import request from 'supertest';
import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { AnalysisSpec } from '@bfp/domain';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import { runBedrockProvider } from '@api/services/intelligence/bedrockProvider';
import { buildUpdateOperations, parseIntent } from '@api/services/intelligence/nlu';
import { runIntelligence } from '@api/services/intelligence/service';

const bundle = generateDatasetBundle({ scale: 0.1 });
const playgroundSpec = {
  datasets: ['customer_360'],
  metrics: [{ id: 'account_conversion_rate' }],
  dimensions: [{ id: 'acquisition_channel' }],
  filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
  dateRange: { type: 'LAST_N_DAYS', value: 365 },
  visualization: { type: 'BAR' },
};

function createHarness() {
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test-secret',
    RATE_LIMIT_ENABLED: 'false',
    AI_PROVIDER: 'local',
  });
  const authService = new AuthService(config);
  const context = createApiContext({ config, logger, authService, datasetBundle: bundle });
  return { app: createApp({ context }), context };
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'analyst@example.local', password: 'demo-password-123' });
  return `Bearer ${response.body.accessToken as string}`;
}

describe('Inteligência PJ NLU', () => {
  it('maps a balanced question to governed metrics and keeps context filters out of dimensions', () => {
    const intent = parseIntent('Qual canal combina melhor conversão com menor CAC?');
    expect(intent).toMatchObject({
      kind: 'QUESTION',
      metrics: ['account_conversion_rate', 'cac'],
      dimensions: ['acquisition_channel'],
    });

    const filtered = parseIntent('Conversão por canal no Estado = SP');
    expect(filtered.dimensions).toEqual(['acquisition_channel']);
    expect(filtered.filters).toEqual([{ field: 'state', operator: 'EQ', value: 'SP' }]);
  });

  it('understands the usage, payments, service and NPS metrics of the catalog', () => {
    expect(parseIntent('Qual o NPS por porte da empresa?')).toMatchObject({
      metrics: ['nps'],
      dimensions: ['company_size'],
    });
    expect(parseIntent('Qual a taxa de erro no app por tela?')).toMatchObject({
      metrics: ['app_error_rate'],
      dimensions: ['app_screen'],
    });
    expect(parseIntent('Volume em Pix por segmento')).toMatchObject({
      metrics: ['pix_volume'],
      dimensions: ['segment'],
    });
    expect(parseIntent('Sessões digitais (FullStory) por região')).toMatchObject({
      metrics: ['digital_sessions'],
      dimensions: ['region'],
    });
  });

  it('turns "Agora separa por porte" into ADD_DIMENSION company_size', () => {
    const intent = parseIntent('Agora separa por porte.');
    expect(intent.kind).toBe('UPDATE');
    expect(
      buildUpdateOperations(intent, {
        metrics: [{ id: 'account_conversion_rate' }],
        dimensions: [{ id: 'acquisition_channel' }],
        filters: [],
        visualization: { type: 'BAR' },
      }),
    ).toEqual([{ type: 'ADD_DIMENSION', dimensionId: 'company_size', granularity: undefined }]);
  });

  it('parses periods, comparison and visualization changes', () => {
    expect(parseIntent('mostre os últimos 120 dias').dateRange).toEqual({
      type: 'LAST_N_DAYS',
      value: 120,
    });
    expect(parseIntent('Comparar com período anterior')).toMatchObject({
      kind: 'UPDATE',
      comparison: true,
    });
    expect(parseIntent('mostre em mapa de calor').visualization).toBe('HEATMAP');
  });
});

describe('POST /api/ai/chat', () => {
  it('answers with real data, then updates the AnalysisSpec structurally', async () => {
    const { app } = createHarness();
    const auth = await login(app);

    const answer = await request(app).post('/api/ai/chat').set('Authorization', auth).send({
      prompt: 'Qual canal combina melhor conversão com menor CAC?',
      analysisSpec: playgroundSpec,
    });

    expect(answer.status).toBe(200);
    expect(answer.body.action).toBe('ANSWER_QUESTION');
    expect(answer.body.answer).toMatch(/melhor equilíbrio/);
    expect(answer.body.answer).toMatch(/%/);
    expect(answer.body.answer).toMatch(/R\$/);
    expect(answer.body.basis.items).toContain('Estado = SP');
    expect(answer.body.explainability.tools).toEqual(['runAnalyticsQuery']);

    const update = await request(app).post('/api/ai/chat').set('Authorization', auth).send({
      prompt: 'Agora separa por porte.',
      analysisSpec: playgroundSpec,
      conversationId: answer.body.conversationId,
    });

    expect(update.body.action).toBe('UPDATE_ANALYSIS');
    expect(update.body.operations).toEqual([
      { type: 'ADD_DIMENSION', dimensionId: 'company_size' },
    ]);
    expect(update.body.message).toBe('Porte da empresa adicionado à análise.');
    expect(update.body.analysisSpec.dimensions.map((d: { id: string }) => d.id)).toEqual([
      'acquisition_channel',
      'company_size',
    ]);

    const conversation = await request(app)
      .get(`/api/ai/conversations/${answer.body.conversationId as string}`)
      .set('Authorization', auth);
    expect(conversation.body.conversation.turns).toHaveLength(4);
  });

  it('builds a brand new AnalysisSpec for the final architectural test question', async () => {
    const { app } = createHarness();
    const auth = await login(app);
    const response = await request(app).post('/api/ai/chat').set('Authorization', auth).send({
      prompt: 'Compare CAC e ativação D30 por canal, porte e estado nos últimos 120 dias.',
    });

    expect(response.status).toBe(200);
    expect(response.body.action).toBe('UPDATE_ANALYSIS');
    expect(response.body.analysisSpec).toMatchObject({
      metrics: [{ id: 'cac' }, { id: 'activation_d30_rate' }],
      dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }, { id: 'state' }],
      dateRange: { type: 'LAST_N_DAYS', value: 120 },
    });

    const query = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', auth)
      .send(response.body.analysisSpec);
    expect(query.status).toBe(200);
    expect(query.body.columns.map((column: { key: string }) => column.key)).toEqual([
      'acquisition_channel',
      'company_size',
      'state',
      'cac',
      'activation_d30_rate',
    ]);
  });

  it('refuses PII requests before touching data', async () => {
    const { app } = createHarness();
    const auth = await login(app);
    const response = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', auth)
      .send({ prompt: 'Liste o CPF e telefone dos sócios' });

    expect(response.body.action).toBe('NONE');
    expect(response.body.explainability.refusal).toBe('pii_request');
    expect(response.body.explainability.tools).toEqual([]);
  });
});

describe('Bedrock provider', () => {
  it('runs governed tools and keeps only semantically valid operations', async () => {
    const { context } = createHarness();
    const auth = {
      userId: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst' as const,
      groups: ['analyst' as const],
    };
    const calls: ConverseCommand[] = [];
    const responses = [
      {
        stopReason: 'tool_use',
        output: {
          message: {
            role: 'assistant' as const,
            content: [
              {
                toolUse: {
                  toolUseId: 't1',
                  name: 'runAnalyticsQuery',
                  input: {
                    analysisSpec: {
                      ...playgroundSpec,
                      dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }],
                    },
                  },
                },
              },
            ],
          },
        },
      },
      {
        stopReason: 'end_turn',
        output: {
          message: {
            role: 'assistant' as const,
            content: [
              {
                text: JSON.stringify({
                  action: 'UPDATE_ANALYSIS',
                  operations: [
                    { type: 'ADD_DIMENSION', dimensionId: 'company_size' },
                    { type: 'ADD_DIMENSION', dimensionId: 'invented_dimension' },
                  ],
                  answer: '',
                  suggestions: [],
                }),
              },
            ],
          },
        },
      },
    ];
    const client = {
      async send(command: ConverseCommand) {
        calls.push(command);
        return responses[calls.length - 1]!;
      },
    };

    const result = await runBedrockProvider({
      prompt: 'Agora separa por porte',
      analysisSpec: {
        ...playgroundSpec,
        filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
        dateRange: { type: 'LAST_N_DAYS', value: 365 },
        visualization: { type: 'BAR' },
      },
      history: [],
      toolContext: { context, auth, queries: [] },
      modelId: 'test-model',
      client,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.input.modelId).toBe('test-model');
    expect(result.operations).toEqual([{ type: 'ADD_DIMENSION', dimensionId: 'company_size' }]);
    expect(result.message).toBe('Porte da empresa adicionado à análise.');
  });

  it('discards numbers that were not produced by runAnalyticsQuery', async () => {
    const { context } = createHarness();
    const auth = {
      userId: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst' as const,
      groups: ['analyst' as const],
    };
    const client = {
      async send() {
        return {
          stopReason: 'end_turn',
          output: {
            message: {
              role: 'assistant' as const,
              content: [
                {
                  text: JSON.stringify({
                    action: 'ANSWER_QUESTION',
                    operations: [],
                    answer: 'A conversão do Google é 99,9%.',
                  }),
                },
              ],
            },
          },
        };
      },
    };

    const result = await runBedrockProvider({
      prompt: 'Qual canal combina melhor conversão com menor CAC?',
      analysisSpec: {
        metrics: [{ id: 'account_conversion_rate' }],
        dimensions: [{ id: 'acquisition_channel' }],
        filters: [],
        dateRange: { type: 'LAST_N_DAYS', value: 365 },
        visualization: { type: 'BAR' },
      },
      history: [],
      toolContext: { context, auth, queries: [] },
      modelId: 'test-model',
      client,
    });

    expect(result.answer).not.toContain('99,9%');
    expect(result.answer).toMatch(/melhor equilíbrio/);
  });
});

describe('Inteligência PJ provider fallback', () => {
  it('answers with the deterministic provider when Bedrock refuses the model', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AUTH_MODE: 'dev',
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_ENABLED: 'false',
      AI_PROVIDER: 'bedrock',
      BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
    });
    const context = createApiContext({
      config,
      logger,
      authService: new AuthService(config),
      datasetBundle: bundle,
    });
    const analysisSpec: AnalysisSpec = {
      datasets: ['customer_360'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [],
      dateRange: { type: 'LAST_N_DAYS', value: 365 },
      visualization: { type: 'BAR' },
    };
    const refusal = Object.assign(new Error('Model use case details have not been submitted'), {
      name: 'ResourceNotFoundException',
    });

    const response = await runIntelligence(
      context,
      { userId: 'usr-1', email: 'analyst@example.local', groups: ['analyst'], role: 'analyst' },
      { prompt: 'Qual a conversão de abertura por canal?', analysisSpec },
      'corr-1',
      { bedrockClient: { send: () => Promise.reject(refusal) } },
    );

    expect(response.provider).toBe('local');
    expect(response.model).toBe('deterministic-insights');
    expect(response.message || response.answer).toBeTruthy();
  });
});
