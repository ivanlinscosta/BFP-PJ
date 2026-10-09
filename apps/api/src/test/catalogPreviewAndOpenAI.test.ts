import request from 'supertest';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import type { AuthenticatedUser } from '@api/auth/types';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import type { OpenAIChatClient } from '@api/services/intelligence/openaiProvider';
import { runIntelligence } from '@api/services/intelligence/service';

const bundle = generateDatasetBundle({ scale: 0.05 });

function createHarness(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test-secret',
    RATE_LIMIT_ENABLED: 'false',
    AI_PROVIDER: 'local',
    ...env,
  });
  const context = createApiContext({
    config,
    logger,
    authService: new AuthService(config),
    datasetBundle: bundle,
  });
  return { app: createApp({ context }), context };
}

async function login(app: ReturnType<typeof createApp>, email = 'analyst@example.local') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'demo-password-123' });
  return `Bearer ${response.body.accessToken as string}`;
}

describe('Catalog data preview', () => {
  const { app } = createHarness();

  it('returns up to 100 rows with the governed columns of a base', async () => {
    const response = await request(app)
      .get('/api/mesh/datasets/customer_360/preview?limit=500')
      .set('Authorization', await login(app));
    expect(response.status).toBe(200);
    const { preview } = response.body;
    expect(preview.source).toBe('local');
    expect(preview.limit).toBe(100);
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.rows.length).toBeLessThanOrEqual(100);
    const columns = preview.columns.map((column: { name: string }) => column.name);
    expect(Object.keys(preview.rows[0])).toEqual(columns);
    expect(JSON.stringify(preview.rows)).not.toMatch(/cnpj|legalName|tradeName/i);
  });

  it('applies the domain permissions of the profile', async () => {
    const business = await login(app, 'business@example.local');
    const media = await request(app)
      .get('/api/mesh/datasets/media_touchpoints/preview')
      .set('Authorization', business);
    expect(media.status).toBe(404);
    const unknown = await request(app)
      .get('/api/mesh/datasets/nao_existe/preview')
      .set('Authorization', business);
    expect(unknown.status).toBe(404);
  });
});

describe('Inteligência PJ with OpenAI', () => {
  const auth: AuthenticatedUser = {
    userId: 'usr-analyst',
    email: 'analyst@example.local',
    role: 'analyst',
    groups: ['analyst'],
    name: 'Mariana Souza',
    team: 'Growth PJ',
  };

  it('runs the governed query tool and answers with real numbers', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    const bodies: Array<Record<string, unknown>> = [];
    const replies = [
      {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant' as const,
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function' as const,
                  function: {
                    name: 'runAnalyticsQuery',
                    arguments: JSON.stringify({
                      analysisSpec: {
                        datasets: ['customer_360'],
                        metrics: [{ id: 'accounts_opened' }],
                        dimensions: [{ id: 'acquisition_channel' }],
                        filters: [],
                        dateRange: { type: 'LAST_N_DAYS', value: 365 },
                        visualization: { type: 'BAR' },
                      },
                    }),
                  },
                },
              ],
            },
          },
        ],
      },
    ];
    const client: OpenAIChatClient = {
      async complete(body) {
        bodies.push(body);
        const next = replies.shift();
        if (next) return next;
        return {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  action: 'ANSWER_QUESTION',
                  operations: [],
                  answer: 'Google Search lidera as contas abertas no último ano.',
                  suggestions: ['Separar por porte'],
                }),
              },
            },
          ],
        };
      },
    };
    const reply = await runIntelligence(
      context,
      auth,
      { prompt: 'Quantas contas abrimos por canal?' },
      'corr-1',
      { openaiClient: client },
    );
    expect(reply.provider).toBe('openai');
    expect(reply.model).toBe('gpt-test');
    expect(reply.action).toBe('ANSWER_QUESTION');
    expect(reply.explainability.tools).toContain('runAnalyticsQuery');
    expect(reply.analysisSpec?.metrics[0]?.id).toBe('accounts_opened');
    expect(bodies[0]).toMatchObject({ model: 'gpt-test', tool_choice: 'auto' });
    expect(JSON.stringify(bodies[0])).toContain('runAnalyticsQuery');
  });

  it('falls back to the analytic engine when the OpenAI key is not configured', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai' });
    const reply = await runIntelligence(context, auth, {
      prompt: 'Qual canal combina melhor conversão com menor CAC?',
    });
    expect(reply.provider).toBe('local');
    expect(reply.answer.length).toBeGreaterThan(0);
  });
});
