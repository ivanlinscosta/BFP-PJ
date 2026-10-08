import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { isGrounded, runAiStudy } from '@api/services/intelligence/aiStudy';
import { createStudyJob, getStudyJob, runStudyJob } from '@api/services/intelligence/studyJobs';

const bundle = generateDatasetBundle({ scale: 0.1 });
const auth = {
  userId: 'usr-analyst',
  email: 'analyst@example.local',
  groups: ['analyst' as const],
  role: 'analyst' as const,
};

function createContext(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test-secret',
    RATE_LIMIT_ENABLED: 'false',
    AI_PROVIDER: 'local',
    ...env,
  });
  return createApiContext({
    config,
    logger,
    authService: new AuthService(config),
    datasetBundle: bundle,
  });
}

const percent = (value: number) =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value * 100)}%`;

/** Fake Claude: asks for two governed queries, then writes a study from the tool results. */
function fakeClaude() {
  const calls: ConverseCommand[] = [];
  return {
    calls,
    client: {
      async send(command: ConverseCommand) {
        calls.push(command);
        if (calls.length === 1) {
          return {
            stopReason: 'tool_use',
            output: {
              message: {
                role: 'assistant' as const,
                content: [
                  {
                    toolUse: {
                      toolUseId: 'q1',
                      name: 'runAnalyticsQuery',
                      input: {
                        analysisSpec: {
                          metrics: [{ id: 'account_conversion_rate' }],
                          dimensions: [{ id: 'acquisition_channel' }],
                          filters: [],
                          dateRange: { type: 'LAST_N_DAYS', value: 365 },
                          visualization: { type: 'BAR' },
                        },
                      },
                    },
                  },
                  {
                    toolUse: {
                      toolUseId: 'q2',
                      name: 'runAnalyticsQuery',
                      input: {
                        analysisSpec: {
                          metrics: [{ id: 'nps' }],
                          dimensions: [{ id: 'nps_touchpoint' }],
                          filters: [],
                          dateRange: { type: 'LAST_N_DAYS', value: 365 },
                          visualization: { type: 'BAR' },
                        },
                      },
                    },
                  },
                ],
              },
            },
          };
        }

        // Read the real conversion of the first channel from the tool result, like the model would.
        const toolMessage = command.input.messages?.at(-1);
        const first = toolMessage?.content?.find((block) => 'toolResult' in block);
        const json =
          first && 'toolResult' in first
            ? (
                first.toolResult?.content?.[0] as {
                  json?: { rows?: Array<Record<string, unknown>> };
                }
              )?.json
            : undefined;
        const row = json?.rows?.[0] ?? {};
        const value = Number(row.account_conversion_rate);
        const study = {
          title: 'Aquisição e satisfação PJ',
          summary: `A conversão chega a ${percent(value)} no canal líder. O NPS do mercado é 72.`,
          kpis: ['account_conversion_rate', 'nps'],
          chapters: [
            {
              queryRef: 0,
              title: 'Conversão por canal',
              question: 'Qual canal converte mais?',
              visualization: 'BAR',
              findings: [
                `O canal líder converte ${percent(value)}.`,
                'Um concorrente converte 47,3% no mesmo período.',
              ],
            },
            {
              queryRef: 1,
              title: 'NPS por momento',
              question: 'Onde o NPS é menor?',
              findings: [],
            },
            { queryRef: 9, title: 'Capítulo sem consulta', question: '?', findings: [] },
          ],
          recommendations: ['Priorizar o canal líder.', 'Atingir NPS 85 até o fim do ano.'],
        };
        return {
          stopReason: 'end_turn',
          output: {
            message: { role: 'assistant' as const, content: [{ text: JSON.stringify(study) }] },
          },
        };
      },
    },
  };
}

describe('Inteligência PJ generative study', () => {
  it('lets Claude plan and write the study, keeping only numbers that came from the queries', async () => {
    const context = createContext();
    const claude = fakeClaude();
    const study = await runAiStudy({
      prompt: 'Faça um estudo sobre aquisição e NPS',
      toolContext: { context, auth, queries: [] },
      modelId: 'test-model',
      client: claude.client,
    });

    expect(claude.calls).toHaveLength(2);
    expect(study.generatedBy).toBe('ai');
    expect(study.model).toBe('test-model');
    expect(study.sections.map((section) => section.title)).toEqual([
      'Conversão por canal',
      'NPS por momento',
    ]);
    expect(study.sections[0]!.result.rows.length).toBeGreaterThan(0);
    expect(study.sections[0]!.findings).toHaveLength(1);
    expect(study.sections[0]!.findings[0]).toMatch(/O canal líder converte/);
    expect(study.summary).not.toMatch(/72/);
    expect(study.recommendations).toEqual(['Priorizar o canal líder.']);
    expect(study.kpis.map((kpi) => kpi.metricId)).toEqual(['account_conversion_rate', 'nps']);
  });

  it('falls back to the deterministic study and tells why when Bedrock refuses the model', async () => {
    const context = createContext({ AI_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'test-model' });
    const refusal = Object.assign(
      new Error('Model use case details have not been submitted for this account.'),
      { name: 'ResourceNotFoundException' },
    );
    const job = await createStudyJob(context, auth, 'Estudo sobre NPS');
    await runStudyJob(context, auth.userId, job.id, {
      bedrockClient: { send: () => Promise.reject(refusal) },
    });
    const done = await getStudyJob(context, auth.userId, job.id);

    expect(done?.status).toBe('done');
    expect(done?.study?.generatedBy).toBe('deterministic');
    expect(done?.study?.notice).toMatch(/formulário de caso de uso da Anthropic/);
    expect(done?.study?.themes).toEqual(['nps']);
  });

  it('accepts rounded numbers from results and rejects invented ones', () => {
    const pool = [0.1489, 328.9, 1996];
    expect(
      isGrounded('Conversão de 14,9% com CAC de R$ 328,9 e 1.996 contas.', [
        ...pool,
        ...pool.map((value) => value * 100),
      ]),
    ).toBe(true);
    expect(isGrounded('Meta de 47,3% para 2026.', pool)).toBe(false);
    expect(isGrounded('Ativação D30 em 3 portes, 2026.', pool)).toBe(true);
  });
});
