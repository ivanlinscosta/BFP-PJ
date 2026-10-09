import request from 'supertest';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import type { AuthenticatedUser } from '@api/auth/types';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import type { OpenAIChatClient } from '@api/services/intelligence/openaiProvider';
import { systemPrompt } from '@api/services/intelligence/bedrockProvider';
import {
  GROUNDING_RULES,
  groundText,
  isGrounded,
  numberPool,
} from '@api/services/intelligence/grounding';
import { runIntelligence } from '@api/services/intelligence/service';
import { isStudyRequest, studyRecutFilters } from '@api/services/intelligence/study';
import { coerceSpecInput, withChartVisualization } from '@api/services/intelligence/tools';
import { createStudyJob, getStudyJob, runStudyJob } from '@api/services/intelligence/studyJobs';

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

describe('Charts for model queries', () => {
  const base = {
    metrics: [{ id: 'accounts_opened' }],
    dimensions: [{ id: 'state' }],
    filters: [],
    visualization: { type: 'TABLE' as const },
  };

  it('turns the TABLE picked by the model into an automatic chart', () => {
    expect(
      withChartVisualization(base, 'Quais estados abrem mais contas?').visualization.type,
    ).toBe('AUTO');
  });

  it('keeps the table when the user asks for one and KPIs without dimensions', () => {
    expect(withChartVisualization(base, 'Mostre em tabela').visualization.type).toBe('TABLE');
    const kpi = { ...base, dimensions: [], visualization: { type: 'KPI' as const } };
    expect(withChartVisualization(kpi, 'Total').visualization.type).toBe('KPI');
  });
});

describe('Studies over the selected bases', () => {
  const auth: AuthenticatedUser = {
    userId: 'usr-analyst',
    email: 'analyst@example.local',
    role: 'analyst',
    groups: ['analyst'],
    name: 'Mariana Souza',
    team: 'Growth PJ',
  };

  it('normalizes shorthand specs written by the model', () => {
    expect(
      coerceSpecInput({ metrics: ['nps'], dimensions: ['nps_touchpoint'], visualization: 'BAR' }),
    ).toEqual({
      metrics: [{ id: 'nps' }],
      dimensions: [{ id: 'nps_touchpoint' }],
      visualization: { type: 'BAR' },
    });
  });

  it('OpenAI plans a study about the requested subject using only the selected bases', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    const prompts: string[] = [];
    let step = 0;
    const client: OpenAIChatClient = {
      async complete(body) {
        const messages = body.messages as Array<{ role: string; content: string }>;
        if (step === 0) prompts.push(messages[0]!.content);
        step += 1;
        if (step === 1) {
          return {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'q1',
                      type: 'function',
                      function: {
                        name: 'runAnalyticsQuery',
                        arguments: JSON.stringify({
                          analysisSpec: {
                            metrics: ['transaction_volume'],
                            dimensions: ['transaction_type'],
                            visualization: 'TABLE',
                          },
                        }),
                      },
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
                  title: 'Estudo sobre Pix',
                  summary: 'O volume transacionado se concentra em poucos tipos de transação.',
                  kpis: [],
                  chapters: [
                    {
                      queryRef: 0,
                      title: 'Volume por tipo de transação',
                      question: 'Quais tipos concentram o volume?',
                      findings: [],
                    },
                  ],
                  recommendations: [],
                }),
              },
            },
          ],
        };
      },
    };
    const job = await createStudyJob(context, auth, 'Faça um estudo sobre o Pix', {
      datasets: ['transactions'],
    });
    await runStudyJob(context, auth.userId, job.id, { openaiClient: client });
    const study = (await getStudyJob(context, auth.userId, job.id))?.study;
    expect(study?.generatedBy).toBe('ai');
    expect(study?.title).toBe('Estudo sobre Pix');
    expect(study?.sections[0]?.visualization).toBe('BAR');
    expect(prompts[0]).toContain('transactions');
    expect(prompts[0]).not.toContain('nps —');
    expect(prompts[0]).toMatch(/PIX_IN=/);
  });

  it('the deterministic study only reads the selected bases', async () => {
    const { context } = createHarness();
    const job = await createStudyJob(context, auth, 'Faça um estudo completo da jornada PJ', {
      datasets: ['transactions'],
    });
    await runStudyJob(context, auth.userId, job.id);
    const study = (await getStudyJob(context, auth.userId, job.id))?.study;
    expect(study?.sections.length).toBeGreaterThan(0);
    for (const section of study?.sections ?? []) {
      expect(section.spec.datasets).toEqual(['transactions']);
    }
  });
});

describe('Study requests vs follow-ups', () => {
  it.each([
    ['Faça um estudo completo da jornada PJ', true],
    ['Crie um estudo sobre o uso do Pix', true],
    ['Quero um raio-x da aquisição', true],
    ['Estudo de NPS por momento', true],
    ['No segundo capítulo do estudo, qual foi o principal achado?', false],
    ['O que o estudo mostrou sobre CAC?', false],
    ['Qual canal converte mais?', false],
  ])('%s → %s', (prompt, expected) => {
    expect(isStudyRequest(prompt)).toBe(expected);
  });
});

describe('Saved studies', () => {
  it('saves a finished study, lists, opens and deletes it', async () => {
    const { app } = createHarness();
    const token = await login(app);
    const chat = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', token)
      .send({ prompt: 'Faça um estudo sobre transações', datasets: ['transactions'] });
    const jobId = chat.body.studyJob.id as string;
    let status = 'running';
    for (let attempt = 0; attempt < 50 && status === 'running'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      status = (await request(app).get(`/api/ai/studies/${jobId}`).set('Authorization', token)).body
        .study.status;
    }
    expect(status).toBe('done');

    const saved = await request(app)
      .post(`/api/ai/studies/${jobId}/save`)
      .set('Authorization', token)
      .send({ name: 'Meu estudo de transações' });
    expect(saved.status).toBe(201);
    expect(saved.body.study).toMatchObject({
      name: 'Meu estudo de transações',
      datasets: ['transactions'],
    });

    const list = await request(app).get('/api/ai/saved-studies').set('Authorization', token);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(saved.body.study.id);

    const detail = await request(app)
      .get(`/api/ai/saved-studies/${saved.body.study.id}`)
      .set('Authorization', token);
    expect(detail.body.study.study.sections.length).toBeGreaterThan(0);

    const other = await login(app, 'admin@example.local');
    const foreign = await request(app)
      .get(`/api/ai/saved-studies/${saved.body.study.id}`)
      .set('Authorization', other);
    expect(foreign.status).toBe(404);

    const removed = await request(app)
      .delete(`/api/ai/saved-studies/${saved.body.study.id}`)
      .set('Authorization', token);
    expect(removed.status).toBe(204);
  });
});

describe('Conversation memory', () => {
  it('keeps the answer and the query behind it for the next turns', async () => {
    const { app } = createHarness();
    const token = await login(app);
    const first = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', token)
      .send({ prompt: 'Quantas empresas temos por região?', datasets: ['customer_360'] });
    const conversation = await request(app)
      .get(`/api/ai/conversations/${first.body.conversationId}`)
      .set('Authorization', token);
    const assistant = conversation.body.conversation.turns.at(-1);
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toContain(first.body.answer.slice(0, 20));
    expect(assistant.content).toMatch(/\[Consulta usada: métricas .+ por region/);
  });
});

describe('Answers stick to the data', () => {
  const result = {
    columns: [],
    rows: [
      { channel: 'META', accounts: 76 },
      { channel: 'GOOGLE', accounts: 59 },
      { channel: 'EMAIL', accounts: 15 },
    ],
    insights: [],
  } as unknown as Parameters<typeof numberPool>[0][number];

  it('keeps numbers from the results, totals, shares and differences', () => {
    const pool = numberPool([result]);
    expect(isGrounded('Meta abriu 76 contas, 17 a mais que Google.', pool)).toBe(true);
    expect(isGrounded('O total foi de 150 contas e Meta tem 50,7% delas.', pool)).toBe(true);
  });

  it('drops sentences with invented figures and keeps the rest', () => {
    const pool = numberPool([result]);
    const checked = groundText(
      'Meta lidera com 76 contas. A média do mercado é de 230 contas por canal.',
      pool,
    );
    expect(checked.removed).toBe(1);
    expect(checked.text).toBe('Meta lidera com 76 contas.');
  });

  it('puts the fidelity rules in the chat and study prompts', () => {
    expect(systemPrompt(undefined, ['customer_360'])).toContain(GROUNDING_RULES[0]);
  });

  it('removes an invented benchmark from an OpenAI answer', async () => {
    const { context } = createHarness({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-test' });
    let step = 0;
    const client: OpenAIChatClient = {
      async complete() {
        step += 1;
        if (step === 1) {
          return {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'q',
                      type: 'function',
                      function: {
                        name: 'runAnalyticsQuery',
                        arguments: JSON.stringify({
                          analysisSpec: {
                            metrics: [{ id: 'companies_total' }],
                            dimensions: [],
                            filters: [],
                            visualization: { type: 'KPI' },
                          },
                        }),
                      },
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
                  answer: 'O mercado brasileiro tem 987.654 empresas PJ ativas.',
                  suggestions: [],
                }),
              },
            },
          ],
        };
      },
    };
    const auth: AuthenticatedUser = {
      userId: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
      groups: ['analyst'],
    };
    const reply = await runIntelligence(
      context,
      auth,
      { prompt: 'Quantas empresas PJ existem no Brasil?', datasets: ['customer_360'] },
      'corr-bench',
      { openaiClient: client },
    );
    expect(reply.answer).not.toContain('987.654');
  });
});

describe('Follow-up cut of the last study', () => {
  it.each([
    ['Faça um recorte específico do segmento agronegócio', 'Agronegócio'],
    ['Agora só para o varejo', 'Varejo'],
    ['Refaça o estudo apenas para empresas Micro', 'Micro'],
  ])('%s → filter %s', (prompt, value) => {
    expect(JSON.stringify(studyRecutFilters(prompt))).toContain(value);
  });

  it.each([
    'Qual o NPS do agronegócio?',
    'No capítulo 2, o que muda no agronegócio?',
    'Faça um novo estudo sobre o agronegócio',
    'Faça um recorte do estudo',
  ])('%s → not a cut', (prompt) => {
    expect(studyRecutFilters(prompt)).toBeNull();
  });

  it('redoes the previous study chapters with the new cut', async () => {
    const { app } = createHarness();
    const token = await login(app);
    const waitStudy = async (id: string) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const job = (await request(app).get(`/api/ai/studies/${id}`).set('Authorization', token))
          .body.study;
        if (job.status !== 'running') return job;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('study did not finish');
    };
    const first = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', token)
      .send({
        prompt: 'Faça um estudo sobre transações',
        datasets: ['transactions', 'customer_360'],
      });
    const original = await waitStudy(first.body.studyJob.id);

    const cut = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', token)
      .send({
        prompt: 'Faça um recorte específico do segmento agronegócio',
        conversationId: first.body.conversationId,
        datasets: ['transactions', 'customer_360'],
      });
    expect(cut.body.answer).toMatch(/refazendo o estudo/);
    const refined = await waitStudy(cut.body.studyJob.id);
    expect(refined.study.title).toContain('Agronegócio');
    const originalTitles = original.study.sections.map(
      (section: { title: string }) => section.title,
    );
    for (const section of refined.study.sections) {
      expect(section.spec.filters).toEqual(
        expect.arrayContaining([{ field: 'segment', operator: 'EQ', value: 'Agronegócio' }]),
      );
      expect(originalTitles.some((title: string) => section.title.startsWith(title))).toBe(true);
    }
    expect(
      refined.study.sections.length +
        refined.study.skipped.filter((item: string) => /recorte/.test(item)).length,
    ).toBe(original.study.sections.length);
  });
});
