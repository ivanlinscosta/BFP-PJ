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

describe('Inteligência PJ restricted to the selected bases', () => {
  const auth: AuthenticatedUser = {
    userId: 'usr-analyst',
    email: 'analyst@example.local',
    role: 'analyst',
    groups: ['analyst'],
    name: 'Mariana Souza',
    team: 'Growth PJ',
  };

  function scriptedClient(calls: Array<{ name: string; args: unknown }>, answer: string) {
    const bodies: Array<Record<string, unknown>> = [];
    const toolResults: string[] = [];
    let step = 0;
    const client: OpenAIChatClient = {
      async complete(body) {
        bodies.push(body);
        const messages = body.messages as Array<{ role: string; content: string | null }>;
        for (const message of messages.slice(-calls.length - 1)) {
          if (message.role === 'tool' && message.content) toolResults.push(message.content);
        }
        const call = calls[step];
        step += 1;
        if (call) {
          return {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: `call-${step}`,
                      type: 'function',
                      function: { name: call.name, arguments: JSON.stringify(call.args) },
                    },
                  ],
                },
              },
            ],
          };
        }
        return {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  action: 'ANSWER_QUESTION',
                  operations: [],
                  answer,
                  suggestions: [],
                }),
              },
            },
          ],
        };
      },
    };
    return { client, bodies, toolResults };
  }

  it('forces tool use, describes only the selected bases and grounds answers on row samples', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    const { client, bodies, toolResults } = scriptedClient(
      [
        { name: 'describeSelectedBases', args: {} },
        { name: 'previewDatasetRows', args: { datasetId: 'customer_360', limit: 5 } },
      ],
      'Na amostra de 5 empresas, 3 vieram do Sudeste.',
    );
    const reply = await runIntelligence(
      context,
      auth,
      { prompt: 'De onde vêm as empresas da amostra?', datasets: ['customer_360'] },
      'corr-scope',
      { openaiClient: client },
    );
    expect(reply.provider).toBe('openai');
    expect(reply.answer).toContain('Sudeste');
    expect(bodies[0]).toMatchObject({ tool_choice: 'required' });
    expect(JSON.stringify(bodies[0])).toContain('customer_360');
    const described = toolResults.find((content) => content.includes('"columns"')) ?? '';
    expect(described).toContain('customer_360');
    expect(described).not.toContain('transactions');
  });

  it('keeps grounded answers with a misnamed action and filters sample rows', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    const { client, toolResults } = scriptedClient(
      [
        {
          name: 'previewDatasetRows',
          args: { datasetId: 'customer_360', limit: 3, where: { company_size: 'MICRO' } },
        },
      ],
      'Três empresas MICRO aparecem na amostra da base Customer 360.',
    );
    const original = client.complete.bind(client);
    client.complete = async (body) => {
      const reply = await original(body);
      const content = reply.choices[0]?.message.content;
      if (content) reply.choices[0]!.message.content = content.replace('ANSWER_QUESTION', 'CLEAR');
      return reply;
    };
    const reply = await runIntelligence(
      context,
      auth,
      { prompt: 'Mostre empresas micro', datasets: ['customer_360'] },
      'corr-sample',
      { openaiClient: client },
    );
    expect(reply.answer).toContain('MICRO');
    const sample = JSON.parse(toolResults.find((item) => item.includes('"rows"')) ?? '{}');
    expect(sample.result.rows.length).toBeGreaterThan(0);
    expect(sample.result.rows.length).toBeLessThanOrEqual(3);
    for (const row of sample.result.rows)
      expect(String(row.company_size).toUpperCase()).toBe('MICRO');
  });

  it('accepts a refusal that only names the selected base', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    const { client } = scriptedClient(
      [{ name: 'describeSelectedBases', args: {} }],
      'A base Customer 360 (customer_360) não tem dados de Pix; selecione Transações PJ.',
    );
    const reply = await runIntelligence(
      context,
      auth,
      { prompt: 'Volume de Pix?', datasets: ['customer_360'] },
      'corr-refusal',
      { openaiClient: client },
    );
    expect(reply.answer).toMatch(/não tem dados de Pix/);
  });

  it('refuses queries outside the selected bases', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    const { client, toolResults } = scriptedClient(
      [
        {
          name: 'runAnalyticsQuery',
          args: {
            analysisSpec: {
              datasets: ['transactions'],
              metrics: [{ id: 'transaction_volume' }],
              dimensions: [],
              filters: [],
              dateRange: { type: 'LAST_N_DAYS', value: 90 },
              visualization: { type: 'KPI' },
            },
          },
        },
        { name: 'previewDatasetRows', args: { datasetId: 'transactions', limit: 5 } },
      ],
      'Essa pergunta precisa da base Transações PJ, que não foi selecionada.',
    );
    const reply = await runIntelligence(
      context,
      auth,
      { prompt: 'Qual o volume transacionado?', datasets: ['customer_360'] },
      'corr-out',
      { openaiClient: client },
    );
    expect(toolResults.join(' ')).toMatch(/não está entre as bases selecionadas/);
    expect(reply.analysisSpec).toBeUndefined();
  });

  it('local engine explains the missing base instead of answering', async () => {
    const { context } = createHarness();
    const reply = await runIntelligence(context, auth, {
      prompt: 'Qual o volume de Pix por segmento?',
      datasets: ['customer_360'],
    });
    expect(reply.action).toBe('NONE');
    expect(reply.answer).toMatch(/não está entre as bases selecionadas/);
  });

  it('rejects a selection without any readable base', async () => {
    const { app } = createHarness();
    const response = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', await login(app))
      .send({ prompt: 'Quantos cliques?', datasets: ['base_inexistente'] });
    expect(response.status).toBe(422);
  });
});
