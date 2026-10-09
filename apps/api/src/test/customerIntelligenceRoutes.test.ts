import request from 'supertest';
import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { buildCustomerProfiles } from '@bfp/customer-intelligence';
import {
  AS_OF,
  baseRaw,
  creditIntentRaw,
} from '../../../../packages/customer-intelligence/src/__fixtures__/raw';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import {
  classifyCustomerQuestion,
  runCustomerAssistant,
} from '@api/services/customerIntelligence/assistant';
import { explainRecommendation } from '@api/services/customerIntelligence/service';
import type { BedrockConverseClient } from '@api/services/intelligence/bedrockProvider';

const bundle = generateDatasetBundle({ scale: 0.05 });
const profiles = buildCustomerProfiles(
  [creditIntentRaw('cust-a'), creditIntentRaw('cust-b'), baseRaw('cust-c')],
  AS_OF,
);

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
    intelligenceProfiles: profiles,
  });
  return { app: createApp({ context }), context };
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'analyst@example.local', password: 'demo-password-123' });
  return `Bearer ${response.body.accessToken as string}`;
}

/** Fake Bedrock runtime that replays scripted Converse responses. */
function fakeBedrock(responses: Array<{ stopReason: string; content: unknown[] }>) {
  const commands: ConverseCommand[] = [];
  const client: BedrockConverseClient = {
    async send(command) {
      commands.push(command);
      const next = responses.shift()!;
      return {
        stopReason: next.stopReason,
        output: { message: { role: 'assistant', content: next.content as never } },
      };
    },
  };
  return { client, commands };
}

describe('Customer Intelligence API', () => {
  const { app } = createHarness();

  it('requires authentication', async () => {
    expect((await request(app).get('/api/customers/cust-a/intelligence')).status).toBe(401);
  });

  it('serves the Cliente PJ 360 profile with DNA, signals and ranked actions', async () => {
    const auth = await login(app);
    const response = await request(app)
      .get('/api/customers/cust-a/intelligence')
      .set('Authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body.customer.customerId).toBe('cust-a');
    expect(response.body.recommendations[0].actionId).toBe('OFFER_WORKING_CAPITAL');
    expect(response.body.dnaVersion).toBe('dna-1.0.0');
    expect(response.body.tabs.transactions.weekly.length).toBeGreaterThan(0);

    const dna = await request(app).get('/api/customers/cust-a/dna').set('Authorization', auth);
    expect(dna.body.dna.commercialIntent.score).toBe(response.body.dna.commercialIntent.score);
    const signals = await request(app)
      .get('/api/customers/cust-a/signals')
      .set('Authorization', auth);
    expect(signals.body.items.map((item: { type: string }) => item.type)).toContain(
      'HIGH_CREDIT_INTENT',
    );
    const recommendations = await request(app)
      .get('/api/customers/cust-a/recommendations')
      .set('Authorization', auth);
    expect(recommendations.body.modelVersion).toBe('nba-1.0.0');
  });

  it('returns 404 for a customer without intelligence', async () => {
    const response = await request(app)
      .get('/api/customers/unknown/intelligence')
      .set('Authorization', await login(app));
    expect(response.status).toBe(404);
  });

  it('records outcomes (ACTIVATED, DISMISSED) and returns them with the profile', async () => {
    const auth = await login(app);
    const recommendationId = profiles[0]!.recommendations[0]!.id;
    const activated = await request(app)
      .post(`/api/recommendations/${encodeURIComponent(recommendationId)}/outcomes`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVATED', channel: 'RELATIONSHIP_MANAGER', reason: 'Enviar ao CRM' });
    expect(activated.status).toBe(201);
    expect(activated.body.outcome).toMatchObject({
      status: 'ACTIVATED',
      actionId: 'OFFER_WORKING_CAPITAL',
    });

    const invalid = await request(app)
      .post(`/api/recommendations/${encodeURIComponent(recommendationId)}/outcomes`)
      .set('Authorization', auth)
      .send({ status: 'APPROVED_CREDIT' });
    expect(invalid.status).toBe(422);

    const profile = await request(app)
      .get('/api/customers/cust-a/intelligence')
      .set('Authorization', auth);
    expect(profile.body.outcomes[0]).toMatchObject({ status: 'ACTIVATED' });
  });

  it('explains deterministically when Bedrock is not configured', async () => {
    const recommendationId = profiles[0]!.recommendations[0]!.id;
    const response = await request(app)
      .post(`/api/recommendations/${encodeURIComponent(recommendationId)}/explain`)
      .set('Authorization', await login(app));
    expect(response.body.explanation).toMatchObject({
      generatedBy: 'deterministic',
      actionId: 'OFFER_WORKING_CAPITAL',
    });
  });

  it('finds similar customers and aggregates clusters', async () => {
    const auth = await login(app);
    const similar = await request(app)
      .post('/api/customers/similar')
      .set('Authorization', auth)
      .send({ customerId: 'cust-a' });
    expect(similar.body.items[0]).toMatchObject({ customerId: 'cust-b', similarity: 100 });

    const cluster = await request(app)
      .post('/api/clusters/intelligence')
      .set('Authorization', auth)
      .send({ customerIds: ['cust-a', 'cust-b', 'cust-c'] });
    expect(cluster.body.cluster.populationSize).toBe(3);
    expect(cluster.body.cluster.nextBestActions[0].actionId).toBe('OFFER_WORKING_CAPITAL');
  });

  it('answers customer questions in Inteligência PJ from the profile', async () => {
    const response = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', await login(app))
      .send({ prompt: 'Por que essa ação está em primeiro?', customerId: 'cust-a' });
    expect(response.status).toBe(200);
    expect(response.body.provider).toBe('local');
    expect(response.body.customer).toMatchObject({ customerId: 'cust-a' });
    expect(response.body.answer).toContain('Oferecer Capital de Giro');
    expect(response.body.explainability.tools).toContain('getNextBestActions');
  });
});

describe('Customer assistant', () => {
  it('classifies the supported questions', () => {
    expect(classifyCustomerQuestion('Me explique este cliente.')).toBe('EXPLAIN');
    expect(classifyCustomerQuestion('Qual é a principal oportunidade?')).toBe('TOP_OPPORTUNITY');
    expect(classifyCustomerQuestion('Por que essa ação está em primeiro?')).toBe('WHY_TOP');
    expect(classifyCustomerQuestion('O que mudou?')).toBe('CHANGES');
    expect(classifyCustomerQuestion('Tem algum motivo para não abordar agora?')).toBe('BLOCKERS');
    expect(classifyCustomerQuestion('Quais outras ações foram consideradas?')).toBe('ALTERNATIVES');
    expect(classifyCustomerQuestion('Encontre clientes semelhantes.')).toBe('SIMILAR');
  });

  it('uses Claude with customer tools and drops ungrounded numbers', async () => {
    const { context } = createHarness({
      AI_PROVIDER: 'bedrock',
      BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
    });
    const score = profiles[0]!.recommendations[0]!.score;
    const { client, commands } = fakeBedrock([
      {
        stopReason: 'tool_use',
        content: [{ toolUse: { toolUseId: 't1', name: 'getNextBestActions', input: {} } }],
      },
      {
        stopReason: 'end_turn',
        content: [
          {
            text: JSON.stringify({
              answer: `Capital de Giro lidera com score ${score}. O limite pré-aprovado é de 347 mil reais.`,
              suggestions: ['O que mudou?'],
            }),
          },
        ],
      },
    ]);
    const result = await runCustomerAssistant(
      context,
      { prompt: 'Por que essa ação está em primeiro?', customerId: 'cust-a' },
      client,
    );
    expect(result.provider).toBe('bedrock');
    expect(result.tools).toEqual(['getNextBestActions']);
    expect(result.result.answer).toContain(String(score));
    expect(result.result.answer).not.toContain('347');
    expect(commands).toHaveLength(2);
  });

  it('falls back to the deterministic answer when Bedrock fails, and never changes the ranking', async () => {
    const { context } = createHarness({
      AI_PROVIDER: 'bedrock',
      BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
    });
    const failing: BedrockConverseClient = {
      async send() {
        throw new Error('Model use case details have not been submitted');
      },
    };
    const result = await runCustomerAssistant(
      context,
      { prompt: 'Qual é a principal oportunidade?', customerId: 'cust-a' },
      failing,
    );
    expect(result.provider).toBe('local');
    expect(result.result.answer).toContain('Oferecer Capital de Giro');

    const explanation = await explainRecommendation(
      context,
      profiles[0]!,
      profiles[0]!.recommendations[0]!,
      failing,
    );
    expect(explanation.generatedBy).toBe('deterministic');
    expect(explanation.notice).toContain('IA generativa');
    expect(profiles[0]!.recommendations[0]!.rank).toBe(1);
  });
});
