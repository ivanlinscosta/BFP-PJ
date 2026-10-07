import type { AnalysisSpec, ColumnFormat, VisualizationType } from '@bfp/domain';
import { normalizeSearchText } from '@api/http/textSearch';
import { withRequiredDatasets } from '@bfp/semantic-layer';
import { executeGovernedQuery, type GovernedQueryResult } from '@api/services/analyticsService';
import type { ToolContext } from '@api/services/intelligence/tools';
import type { ProviderResult } from '@api/services/intelligence/types';

/** Headline indicator of the study (one governed metric over the whole period). */
export interface StudyKpi {
  metricId: string;
  label: string;
  value: number | null;
  format?: ColumnFormat;
}

/** One chapter of the study: a governed query, how to show it and what it says. */
export interface StudySection {
  id: string;
  title: string;
  question: string;
  visualization: VisualizationType;
  spec: AnalysisSpec;
  result: GovernedQueryResult;
  findings: string[];
}

/** Multi-chapter study built only from governed queries (every number comes from the engine). */
export interface Study {
  title: string;
  period: string;
  summary: string;
  kpis: StudyKpi[];
  sections: StudySection[];
  recommendations: string[];
  skipped: string[];
  /** Governed queries executed to build the study. */
  queryCount: number;
}

const STUDY_TRIGGERS = [
  'estudo',
  'raio-x',
  'raio x',
  'diagnostico completo',
  'relatorio completo',
  'analise completa',
  'visao completa',
];

const PERIOD = { type: 'LAST_N_DAYS', value: 365 } as const;

/** Channels whose acquisition_source is PAID: CAC is only compared among them (governance rule). */
const PAID_CHANNELS = new Set(['GOOGLE_SEARCH', 'META', 'LINKEDIN']);

/** True when the user asks for a complete study rather than a single answer. */
export function isStudyRequest(prompt: string) {
  const normalized = normalizeSearchText(prompt);
  return STUDY_TRIGGERS.some((trigger) => normalized.includes(trigger));
}

function spec(
  metrics: string[],
  dimensions: Array<{ id: string; granularity?: 'month' }>,
  visualization: VisualizationType,
): AnalysisSpec {
  return {
    metrics: metrics.map((id) => ({ id })),
    dimensions,
    filters: [],
    dateRange: PERIOD,
    visualization: { type: visualization },
  };
}

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatValue(value: unknown, format?: ColumnFormat) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (format === 'percent') return `${number.format(value * 100)}%`;
  if (format === 'currency') return currency.format(value);
  return number.format(value);
}

/** Rows of a result as (label, value) pairs for one metric, highest first. */
function ranked(result: GovernedQueryResult, metricId: string, dimensionId: string) {
  const labels = result.valueLabels[dimensionId] ?? {};
  return result.rows
    .map((row) => ({
      code: String(row[dimensionId] ?? ''),
      label: labels[String(row[dimensionId] ?? '')] ?? String(row[dimensionId] ?? '—'),
      value: typeof row[metricId] === 'number' ? (row[metricId] as number) : null,
    }))
    .filter((row): row is { code: string; label: string; value: number } => row.value !== null)
    .sort((left, right) => right.value - left.value);
}


/**
 * Runs one governed query exactly like the runAnalyticsQuery tool (mesh bases selected for the
 * spec, semantic validation, RBAC) and records it as evidence of the turn. Each call returns its
 * own result, so queries can run in parallel.
 */
async function run(toolContext: ToolContext, analysisSpec: AnalysisSpec) {
  const governedSpec = withRequiredDatasets(analysisSpec);
  const result = await executeGovernedQuery(
    toolContext.context,
    toolContext.auth,
    governedSpec,
    toolContext.correlationId,
  );
  const executed = { spec: governedSpec, result };
  toolContext.queries.push(executed);
  return executed;
}

interface SectionPlan {
  id: string;
  title: string;
  question: string;
  spec: AnalysisSpec;
  describe(result: GovernedQueryResult): string[];
}

const SECTION_PLANS: SectionPlan[] = [
  {
    id: 'acquisition',
    title: 'Aquisição por canal',
    question: 'Quais canais convertem mais e a que custo?',
    spec: spec(['account_conversion_rate', 'cac'], [{ id: 'acquisition_channel' }], 'TABLE'),
    describe(result) {
      const conversion = ranked(result, 'account_conversion_rate', 'acquisition_channel');
      const cac = ranked(result, 'cac', 'acquisition_channel').filter((row) =>
        PAID_CHANNELS.has(row.code),
      );
      const findings: string[] = [];
      if (conversion[0]) {
        findings.push(
          `${conversion[0].label} lidera a conversão de abertura (${formatValue(conversion[0].value, 'percent')}); ${conversion.at(-1)?.label} fecha a lista (${formatValue(conversion.at(-1)?.value, 'percent')}).`,
        );
      }
      if (cac.length > 1) {
        findings.push(
          `Entre os canais pagos, o menor CAC é de ${cac.at(-1)?.label} (${formatValue(cac.at(-1)?.value, 'currency')}) e o maior, de ${cac[0]?.label} (${formatValue(cac[0]?.value, 'currency')}).`,
        );
      }
      return findings;
    },
  },
  {
    id: 'trend',
    title: 'Evolução mensal de contas abertas',
    question: 'Como a abertura de contas evoluiu mês a mês?',
    spec: spec(['accounts_opened'], [{ id: 'account_opened_date', granularity: 'month' }], 'LINE'),
    describe(result) {
      const points = result.rows
        .map((row) => ({
          month: String(row.account_opened_date ?? ''),
          value: typeof row.accounts_opened === 'number' ? row.accounts_opened : 0,
        }))
        .filter((point) => point.month)
        .sort((left, right) => left.month.localeCompare(right.month));
      if (points.length < 2) return [];
      const peak = [...points].sort((left, right) => right.value - left.value)[0]!;
      const first = points[0]!;
      const last = points.at(-1)!;
      const change = first.value > 0 ? (last.value - first.value) / first.value : 0;
      return [
        `Pico em ${peak.month} com ${number.format(peak.value)} contas abertas.`,
        `De ${first.month} a ${last.month}, a variação foi de ${formatValue(change, 'percent')}.`,
      ];
    },
  },
  {
    id: 'channel-size',
    title: 'Conversão por canal e porte',
    question: 'Quais combinações de canal e porte convertem melhor?',
    spec: spec(
      ['account_conversion_rate'],
      [{ id: 'acquisition_channel' }, { id: 'company_size' }],
      'HEATMAP',
    ),
    describe(result) {
      const channelLabels = result.valueLabels.acquisition_channel ?? {};
      const best = result.rows
        .filter((row) => typeof row.account_conversion_rate === 'number')
        .sort(
          (left, right) =>
            (right.account_conversion_rate as number) - (left.account_conversion_rate as number),
        )[0];
      return best
        ? [
            `A melhor combinação é ${channelLabels[String(best.acquisition_channel)] ?? String(best.acquisition_channel)} com empresas de porte ${String(best.company_size)} (${formatValue(best.account_conversion_rate, 'percent')}).`,
          ]
        : [];
    },
  },
  {
    id: 'activation',
    title: 'Ativação D30 por porte',
    question: 'Quais portes ativam mais rápido depois da abertura?',
    spec: spec(['activation_d30_rate'], [{ id: 'company_size' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'activation_d30_rate', 'company_size');
      return rows.length > 1
        ? [
            `${rows[0]!.label} ativa mais em 30 dias (${formatValue(rows[0]!.value, 'percent')}); ${rows.at(-1)!.label} ativa menos (${formatValue(rows.at(-1)!.value, 'percent')}).`,
          ]
        : [];
    },
  },
  {
    id: 'app-usage',
    title: 'Uso do app Itaú Empresas',
    question: 'Quais telas do app concentram o uso?',
    spec: spec(['app_interactions'], [{ id: 'app_screen' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'app_interactions', 'app_screen');
      const total = rows.reduce((sum, row) => sum + row.value, 0);
      const top3 = rows.slice(0, 3);
      return top3.length && total
        ? [
            `${top3.map((row) => row.label).join(', ')} concentram ${formatValue(top3.reduce((sum, row) => sum + row.value, 0) / total, 'percent')} das interações.`,
          ]
        : [];
    },
  },
  {
    id: 'app-quality',
    title: 'Erros e conclusão no app',
    question: 'Onde o app mais falha?',
    spec: spec(['app_error_rate', 'app_completion_rate'], [{ id: 'app_screen' }], 'TABLE'),
    describe(result) {
      const errors = ranked(result, 'app_error_rate', 'app_screen');
      return errors[0]
        ? [
            `A maior taxa de erro está em ${errors[0].label} (${formatValue(errors[0].value, 'percent')}); a menor, em ${errors.at(-1)?.label} (${formatValue(errors.at(-1)?.value, 'percent')}).`,
          ]
        : [];
    },
  },
  {
    id: 'transactions',
    title: 'Volume transacionado por tipo',
    question: 'Como o dinheiro circula entre Pix, boletos, TED e cartão?',
    spec: spec(['transaction_volume'], [{ id: 'transaction_type' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'transaction_volume', 'transaction_type');
      const total = rows.reduce((sum, row) => sum + row.value, 0);
      const pix = rows
        .filter((row) => row.label.toLowerCase().includes('pix'))
        .reduce((sum, row) => sum + row.value, 0);
      return total
        ? [
            `Volume total de ${formatValue(total, 'currency')}; Pix responde por ${formatValue(pix / total, 'percent')}.`,
          ]
        : [];
    },
  },
  {
    id: 'ticket',
    title: 'Ticket médio e transações por porte',
    question: 'Quanto cada porte movimenta por transação?',
    spec: spec(['average_ticket', 'transactions_count'], [{ id: 'company_size' }], 'TABLE'),
    describe(result) {
      const rows = ranked(result, 'average_ticket', 'company_size');
      return rows.length > 1
        ? [
            `Ticket médio de ${formatValue(rows[0]!.value, 'currency')} nas empresas de porte ${rows[0]!.label}, contra ${formatValue(rows.at(-1)!.value, 'currency')} no porte ${rows.at(-1)!.label}.`,
          ]
        : [];
    },
  },
  {
    id: 'nps',
    title: 'NPS por momento da relação',
    question: 'Em que momento a satisfação é maior ou menor?',
    spec: spec(['nps'], [{ id: 'nps_touchpoint' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'nps', 'nps_touchpoint');
      return rows.length > 1
        ? [
            `NPS mais alto em ${rows[0]!.label} (${number.format(rows[0]!.value)}) e mais baixo em ${rows.at(-1)!.label} (${number.format(rows.at(-1)!.value)}).`,
          ]
        : [];
    },
  },
  {
    id: 'service',
    title: 'Resolução no atendimento',
    question: 'Quais canais de atendimento resolvem mais?',
    spec: spec(['conversation_resolution_rate'], [{ id: 'conversation_channel' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'conversation_resolution_rate', 'conversation_channel');
      return rows.length > 1
        ? [
            `${rows[0]!.label} resolve mais (${formatValue(rows[0]!.value, 'percent')}); ${rows.at(-1)!.label} resolve menos (${formatValue(rows.at(-1)!.value, 'percent')}).`,
          ]
        : [];
    },
  },
];

/** Headline indicators grouped by data product, so each group is one governed query. */
const KPI_GROUPS: string[][] = [
  ['accounts_opened', 'account_conversion_rate', 'activation_d30_rate'],
  ['cac'],
  ['transaction_volume'],
  ['app_active_companies'],
  ['nps'],
  ['conversation_resolution_rate'],
];

function recommendationsFrom(sections: StudySection[]) {
  const byId = new Map(sections.map((section) => [section.id, section.result]));
  const recommendations: string[] = [];

  const acquisition = byId.get('acquisition');
  if (acquisition) {
    const conversion = ranked(acquisition, 'account_conversion_rate', 'acquisition_channel');
    const cac = new Map(
      ranked(acquisition, 'cac', 'acquisition_channel').map((row) => [row.label, row.value]),
    );
    const efficient = conversion.find((row) => PAID_CHANNELS.has(row.code));
    if (efficient) {
      recommendations.push(
        `Aquisição: ampliar investimento em ${efficient.label}, que combina a melhor conversão entre os canais pagos com CAC de ${formatValue(cac.get(efficient.label), 'currency')}.`,
      );
    }
  }
  const activation = byId.get('activation');
  const lowestActivation = activation
    ? ranked(activation, 'activation_d30_rate', 'company_size').at(-1)
    : undefined;
  if (lowestActivation) {
    recommendations.push(
      `Ativação: criar uma trilha de onboarding assistido para o porte ${lowestActivation.label}, que tem a menor ativação D30.`,
    );
  }
  const quality = byId.get('app-quality');
  const worstScreen = quality ? ranked(quality, 'app_error_rate', 'app_screen')[0] : undefined;
  if (worstScreen) {
    recommendations.push(
      `App: priorizar a correção de erros na tela ${worstScreen.label} (maior taxa de erro do app).`,
    );
  }
  const nps = byId.get('nps');
  const worstMoment = nps ? ranked(nps, 'nps', 'nps_touchpoint').at(-1) : undefined;
  if (worstMoment) {
    recommendations.push(
      `Experiência: investigar os detratores em ${worstMoment.label}, o momento com menor NPS.`,
    );
  }
  const service = byId.get('service');
  const worstChannel = service
    ? ranked(service, 'conversation_resolution_rate', 'conversation_channel').at(-1)
    : undefined;
  if (worstChannel) {
    recommendations.push(
      `Atendimento: revisar o fluxo de ${worstChannel.label}, o canal com menor taxa de resolução.`,
    );
  }
  return recommendations;
}

/**
 * Builds the complete study: headline KPIs plus one chapter per business question, all executed
 * through runAnalyticsQuery (semantic validation, RBAC and data mesh selection included).
 * Chapters the user cannot access are skipped and listed instead of failing the whole study.
 */
export async function buildStudy(toolContext: ToolContext): Promise<Study> {
  const skipped: string[] = [];

  const kpiResults = await Promise.all(
    KPI_GROUPS.map((metrics) =>
      run(toolContext, spec(metrics, [], 'KPI')).catch(() => {
        skipped.push(`Indicadores: ${metrics.join(', ')}`);
        return null;
      }),
    ),
  );
  const kpis: StudyKpi[] = kpiResults.flatMap((executed) => {
    if (!executed) return [];
    const row = executed.result.rows[0] ?? {};
    return executed.result.columns
      .filter((column) => column.role === 'value')
      .map((column) => ({
        metricId: column.key,
        label: column.label,
        value: typeof row[column.key] === 'number' ? (row[column.key] as number) : null,
        format: column.format,
      }));
  });

  const sectionResults = await Promise.all(
    SECTION_PLANS.map(async (plan) => {
      try {
        const executed = await run(toolContext, plan.spec);
        return {
          id: plan.id,
          title: plan.title,
          question: plan.question,
          visualization: plan.spec.visualization.type,
          spec: executed.spec,
          result: executed.result,
          findings: plan.describe(executed.result),
        } satisfies StudySection;
      } catch {
        skipped.push(plan.title);
        return null;
      }
    }),
  );
  const sections = sectionResults.filter((section): section is StudySection => Boolean(section));

  const kpiText = kpis
    .slice(0, 4)
    .map((kpi) => `${kpi.label}: ${formatValue(kpi.value, kpi.format)}`)
    .join(' · ');

  return {
    title: 'Estudo completo da jornada PJ',
    period: 'Últimos 365 dias',
    summary: `Estudo com ${sections.length} análises sobre aquisição, ativação, uso do app, transações, satisfação e atendimento. ${kpiText}.`,
    kpis,
    sections,
    recommendations: recommendationsFrom(sections),
    skipped,
    queryCount: toolContext.queries.length,
  };
}

/** Provider-shaped answer for a study request (deterministic narrative over governed data). */
export function studyAnswer(study: Study): ProviderResult & { study: Study } {
  return {
    action: 'ANSWER_QUESTION',
    operations: [],
    message: study.summary,
    answer: study.summary,
    basis: {
      title: 'Base da resposta',
      items: [
        `${study.queryCount} consultas governadas (runAnalyticsQuery)`,
        study.period,
        'Métricas certificadas do catálogo semântico',
      ],
    },
    suggestions: [
      'Agora separa a conversão por estado',
      'Qual a taxa de erro no app por plataforma?',
      'Qual o NPS por porte da empresa?',
    ],
    study,
  };
}
