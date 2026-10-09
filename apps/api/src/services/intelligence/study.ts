import type { AnalysisSpec, ColumnFormat, FilterCondition, VisualizationType } from '@bfp/domain';
import { normalizeSearchText } from '@api/http/textSearch';
import {
  getMetricDefinition,
  listMetricDefinitions,
  MESH_DATASET_BY_ID,
  withRequiredDatasets,
} from '@bfp/semantic-layer';
import { parseIntent } from '@api/services/intelligence/nlu';
import { executeGovernedQuery, type GovernedQueryResult } from '@api/services/analyticsService';
import {
  assertSpecInScope,
  dimensionInScope,
  domainAllowed,
  metricInScope,
  type ToolContext,
} from '@api/services/intelligence/tools';

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
  /** Business themes the study covers (from the question). */
  themes: StudyTheme[];
  /** Who wrote the analysis: the generative AI (Claude) or the deterministic engine. */
  generatedBy: 'ai' | 'deterministic';
  model?: string;
  /** Shown to the user when the generative AI could not be used. */
  notice?: string;
}

export const STUDY_THEMES = [
  'acquisition',
  'activation',
  'app',
  'transactions',
  'nps',
  'service',
  'crm',
  'digital',
] as const;
export type StudyTheme = (typeof STUDY_THEMES)[number];

export const THEME_LABELS: Record<StudyTheme, string> = {
  acquisition: 'aquisição',
  activation: 'ativação',
  app: 'uso do app',
  transactions: 'transações',
  nps: 'satisfação (NPS)',
  service: 'atendimento',
  crm: 'relacionamento (CRM)',
  digital: 'jornada digital',
};

/** Words that point a question at each theme (normalized, without accents). */
const THEME_KEYWORDS: Record<StudyTheme, string[]> = {
  acquisition: [
    'aquisicao',
    'conversao',
    'cac',
    'canal',
    'canais',
    'midia',
    'lead',
    'campanha',
    'abertura',
  ],
  activation: ['ativacao', 'onboarding', 'ativam', 'd30'],
  app: ['app', 'aplicativo', 'navegacao', 'telas', 'tela'],
  transactions: ['transac', 'pix', 'boleto', 'ticket', 'ted', 'cartao', 'volume', 'pagamento'],
  nps: ['nps', 'satisfacao', 'experiencia', 'recomendacao', 'detrator', 'promotor'],
  service: ['atendimento', 'conversa', 'resolucao', 'suporte'],
  crm: ['crm', 'relacionamento', 'gerente', 'comercial'],
  digital: ['fullstory', 'digital', 'site', 'sessoes'],
};

/** Themes the question is about; a broad question ("jornada", "completo") covers all of them. */
export function detectThemes(prompt: string): StudyTheme[] {
  const normalized = normalizeSearchText(prompt);
  const themes = STUDY_THEMES.filter((theme) =>
    THEME_KEYWORDS[theme].some((keyword) => normalized.includes(keyword)),
  );
  const broad = /jornada|completo|completa|tudo|geral|raio/.test(normalized);
  return themes.length === 0 || (broad && themes.length >= 4) ? [...STUDY_THEMES] : themes;
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

/**
 * Filters of a follow-up cut of the last study ("faça um recorte do agronegócio", "refaça só para
 * empresas Micro"), or null when the prompt is something else: a question about the study, a
 * request for a new study on another subject or a message without a recognizable cut.
 */
export function studyRecutFilters(prompt: string) {
  const normalized = normalizeSearchText(prompt);
  if (/capitulo|\b(novo|outro) estudo\b/.test(normalized)) return null;
  const { filters } = parseIntent(prompt);
  if (filters.length === 0) return null;
  const asksForCut =
    /recort|refa[cz]|refazer|mesmo estudo|mesma analise|\bso (para|do|da|de|dos|das|no|na|com)\b|somente|apenas|filtr|aplique|aplicar|considerando|foca|foco|\bagora\b|\be (para|no|na|do|da|nos|nas)\b|segment|recorte/.test(
      normalized,
    );
  return asksForCut || isStudyRequest(prompt) ? filters : null;
}

/** True when the user asks for a complete study rather than a single answer. */
export function isStudyRequest(prompt: string) {
  const normalized = normalizeSearchText(prompt);
  if (!STUDY_TRIGGERS.some((trigger) => normalized.includes(trigger))) return false;
  // Follow-ups about a study already delivered ("no capítulo 2 do estudo…") are questions.
  if (/capitulo|\b(do|no|desse|deste|nesse|neste|daquele|ultimo) estudo\b/.test(normalized)) {
    return false;
  }
  return (
    /\b(faca|faz|fazer|crie|criar|gere|gerar|monte|montar|elabore|elaborar|prepare|preparar|quero|preciso|novo|nova|um estudo|uma analise completa|um raio)\b/.test(
      normalized,
    ) || STUDY_TRIGGERS.some((trigger) => normalized.startsWith(trigger))
  );
}

export function spec(
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

export function formatValue(value: unknown, format?: ColumnFormat) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (format === 'percent') return `${number.format(value * 100)}%`;
  if (format === 'currency') return currency.format(value);
  return number.format(value);
}

/** Rows of a result as (label, value) pairs for one metric, highest first. */
export function ranked(result: GovernedQueryResult, metricId: string, dimensionId: string) {
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

/** Adds the cut of a refined study to a query (a filter on the same field is replaced). */
export function withRequiredFilters(spec: AnalysisSpec, required?: FilterCondition[]) {
  if (!required?.length) return spec;
  const fields = new Set(required.map((filter) => filter.field));
  return {
    ...spec,
    filters: [...spec.filters.filter((filter) => !fields.has(filter.field)), ...required],
  };
}

/**
 * Runs one governed query exactly like the runAnalyticsQuery tool (mesh bases selected for the
 * spec, semantic validation, RBAC) and records it as evidence of the turn. Each call returns its
 * own result, so queries can run in parallel.
 */
export async function run(toolContext: ToolContext, analysisSpec: AnalysisSpec) {
  const governedSpec = withRequiredDatasets(
    withRequiredFilters(analysisSpec, toolContext.requiredFilters),
  );
  assertSpecInScope(governedSpec, toolContext.datasets);
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
  theme: StudyTheme;
  title: string;
  question: string;
  spec: AnalysisSpec;
  describe(result: GovernedQueryResult): string[];
}

const SECTION_PLANS: SectionPlan[] = [
  {
    id: 'acquisition',
    theme: 'acquisition',
    title: 'Aquisição por canal',
    question: 'Quais canais convertem mais e a que custo?',
    spec: spec(['account_conversion_rate', 'cac'], [{ id: 'acquisition_channel' }], 'GROUPED_BAR'),
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
    theme: 'acquisition',
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
    theme: 'acquisition',
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
    theme: 'activation',
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
    theme: 'app',
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
    theme: 'app',
    title: 'Erros e conclusão no app',
    question: 'Onde o app mais falha?',
    spec: spec(['app_error_rate', 'app_completion_rate'], [{ id: 'app_screen' }], 'GROUPED_BAR'),
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
    theme: 'transactions',
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
    theme: 'transactions',
    title: 'Ticket médio e transações por porte',
    question: 'Quanto cada porte movimenta por transação?',
    spec: spec(['average_ticket', 'transactions_count'], [{ id: 'company_size' }], 'GROUPED_BAR'),
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
    theme: 'nps',
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
    theme: 'service',
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
  {
    id: 'crm',
    theme: 'crm',
    title: 'Relacionamento comercial (CRM)',
    question: 'Qual o resultado das interações comerciais?',
    spec: spec(['crm_interactions_total'], [{ id: 'crm_outcome' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'crm_interactions_total', 'crm_outcome');
      const total = rows.reduce((sum, row) => sum + row.value, 0);
      return rows[0] && total
        ? [
            `${number.format(total)} interações no período; o resultado mais comum é ${rows[0].label} (${formatValue(rows[0].value / total, 'percent')}).`,
          ]
        : [];
    },
  },
  {
    id: 'digital',
    theme: 'digital',
    title: 'Jornada digital (FullStory)',
    question: 'Quais segmentos mais usam os canais digitais?',
    spec: spec(['digital_sessions'], [{ id: 'segment' }], 'BAR'),
    describe(result) {
      const rows = ranked(result, 'digital_sessions', 'segment');
      return rows.length > 1
        ? [
            `${rows[0]!.label} lidera com ${number.format(rows[0]!.value)} sessões; ${rows.at(-1)!.label} tem ${number.format(rows.at(-1)!.value)}.`,
          ]
        : [];
    },
  },
];

/** Headline indicators grouped by data product, so each group is one governed query. */
const KPI_GROUPS: Array<{ theme: StudyTheme; metrics: string[] }> = [
  { theme: 'acquisition', metrics: ['accounts_opened', 'account_conversion_rate'] },
  { theme: 'acquisition', metrics: ['cac'] },
  { theme: 'activation', metrics: ['activation_d30_rate'] },
  { theme: 'transactions', metrics: ['transaction_volume', 'average_ticket'] },
  { theme: 'app', metrics: ['app_active_companies', 'app_error_rate'] },
  { theme: 'nps', metrics: ['nps'] },
  { theme: 'service', metrics: ['conversation_resolution_rate'] },
  { theme: 'crm', metrics: ['crm_contacted_companies'] },
  { theme: 'digital', metrics: ['digital_sessions'] },
];

/** Runs headline indicators (one governed query per group of metrics of the same product). */
export async function runKpis(toolContext: ToolContext, groups: string[][], skipped: string[]) {
  const results = await Promise.all(
    groups.map((metrics) =>
      run(toolContext, spec(metrics, [], 'KPI')).catch(() => {
        skipped.push(`Indicadores: ${metrics.join(', ')}`);
        return null;
      }),
    ),
  );
  return results.flatMap((executed): StudyKpi[] => {
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
}

/** Priority of dimensions used to break down a metric that has no curated chapter. */
const DEFAULT_BREAKDOWNS = [
  'acquisition_channel',
  'company_size',
  'app_screen',
  'transaction_type',
  'nps_touchpoint',
  'conversation_channel',
  'crm_outcome',
  'segment',
  'region',
];

/** Chapter for a metric the user named that the curated plan does not cover. */
function genericPlan(
  metricId: string,
  dimensionIds: string[],
  scope?: ToolContext['datasets'],
): SectionPlan | null {
  const metric = getMetricDefinition(metricId);
  if (!metric) return null;
  const allowed = new Set<string>(
    (Array.isArray(metric.allowedDimensions)
      ? metric.allowedDimensions
      : DEFAULT_BREAKDOWNS
    ).filter((id) => dimensionInScope(id, scope)),
  );
  const dimension =
    dimensionIds.find((id) => allowed.has(id)) ?? DEFAULT_BREAKDOWNS.find((id) => allowed.has(id));
  if (!dimension) return null;
  return {
    id: `metric-${metricId}-${dimension}`,
    theme: 'acquisition',
    title: `${metric.shortName ?? metric.name} por ${dimension.replace(/_/g, ' ')}`,
    question: `Como ${(metric.shortName ?? metric.name).toLowerCase()} varia entre os grupos?`,
    spec: spec([metricId], [{ id: dimension }], 'BAR'),
    describe(result) {
      const column = result.columns.find((item) => item.key === metricId);
      const dimensionColumn = result.columns.find((item) => item.key === dimension);
      const rows = ranked(result, metricId, dimension);
      return rows.length > 1
        ? [
            `${dimensionColumn?.label ?? 'Grupo'} com maior ${column?.label ?? metricId}: ${rows[0]!.label} (${formatValue(rows[0]!.value, column?.format)}); menor: ${rows.at(-1)!.label} (${formatValue(rows.at(-1)!.value, column?.format)}).`,
          ]
        : [];
    },
  };
}

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
  const ticket = byId.get('ticket');
  const lowestTicket = ticket ? ranked(ticket, 'average_ticket', 'company_size').at(-1) : undefined;
  if (lowestTicket) {
    recommendations.push(
      `Transações: estimular cobrança via Pix e boletos no porte ${lowestTicket.label}, que tem o menor ticket médio (${formatValue(lowestTicket.value, 'currency')}).`,
    );
  }
  const transactions = byId.get('transactions');
  const topType = transactions
    ? ranked(transactions, 'transaction_volume', 'transaction_type')[0]
    : undefined;
  if (topType) {
    recommendations.push(
      `Transações: ${topType.label} concentra o maior volume (${formatValue(topType.value, 'currency')}); usar essa jornada como porta de entrada para crédito e investimentos.`,
    );
  }
  const crm = byId.get('crm');
  if (crm) {
    const rows = ranked(crm, 'crm_interactions_total', 'crm_outcome');
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const noAnswer = rows.find((row) => row.code === 'NO_ANSWER');
    if (noAnswer && total) {
      recommendations.push(
        `CRM: rever a cadência de contato, pois ${formatValue(noAnswer.value / total, 'percent')} das interações terminam sem resposta.`,
      );
    }
  }
  const digital = byId.get('digital');
  const quietSegment = digital ? ranked(digital, 'digital_sessions', 'segment').at(-1) : undefined;
  if (quietSegment) {
    recommendations.push(
      `Digital: criar campanha de adoção do app para ${quietSegment.label}, o segmento com menos sessões digitais.`,
    );
  }
  return recommendations;
}

/**
 * Builds the complete study: headline KPIs plus one chapter per business question, all executed
 * through runAnalyticsQuery (semantic validation, RBAC and data mesh selection included).
 * Chapters the user cannot access are skipped and listed instead of failing the whole study.
 */
export async function buildStudy(toolContext: ToolContext, prompt = ''): Promise<Study> {
  const skipped: string[] = [];
  const scope = toolContext.datasets;
  const themes = detectThemes(prompt);
  const intent = parseIntent(prompt);
  // With bases selected, only chapters that read those bases are planned.
  const fits = (plan: SectionPlan) => {
    try {
      assertSpecInScope(withRequiredDatasets(plan.spec), scope);
      return true;
    } catch {
      return false;
    }
  };
  let curated = SECTION_PLANS.filter((plan) => themes.includes(plan.theme) && fits(plan));
  if (scope && curated.length === 0) curated = SECTION_PLANS.filter(fits);
  const coveredMetrics = new Set(
    curated.flatMap((plan) => plan.spec.metrics.map((metric) => metric.id)),
  );
  // Metrics named in the question that the curated chapters do not cover get their own chapter.
  const extra = intent.metrics
    .filter((metricId) => !coveredMetrics.has(metricId) && metricInScope(metricId, scope))
    .map((metricId) => genericPlan(metricId, intent.dimensions, scope))
    .filter((plan): plan is SectionPlan => Boolean(plan) && fits(plan!));
  const plans = [...extra, ...curated];
  // Few chapters for the selected bases: complete with their certified metrics.
  if (scope && plans.length < 4) {
    const named = new Set(plans.flatMap((plan) => plan.spec.metrics.map((metric) => metric.id)));
    for (const metric of listMetricDefinitions()) {
      if (plans.length >= 6) break;
      if (named.has(metric.id) || !metricInScope(metric.id, scope)) continue;
      if (!domainAllowed(toolContext.auth, metric.domain)) continue;
      if (metric.certificationStatus === 'DEPRECATED') continue;
      const plan = genericPlan(metric.id, intent.dimensions, scope);
      if (plan && fits(plan)) {
        plans.push(plan);
        named.add(metric.id);
      }
    }
  }

  const kpis = await runKpis(
    toolContext,
    KPI_GROUPS.filter((group) => (scope ? true : themes.includes(group.theme)))
      .map((group) => group.metrics.filter((metricId) => metricInScope(metricId, scope)))
      .filter((metrics) => metrics.length > 0),
    skipped,
  );

  const sectionResults = await Promise.all(
    plans.map(async (plan) => {
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
  const allThemes = themes.length === STUDY_THEMES.length;
  // Bases covering the whole journey read like an unrestricted study.
  const partialScope = scope !== undefined && !SECTION_PLANS.every(fits);
  const themeText = partialScope
    ? scope!.map((id) => MESH_DATASET_BY_ID.get(id)?.name ?? id).join(', ')
    : themes.map((theme) => THEME_LABELS[theme]).join(', ');

  return {
    title: partialScope
      ? `Estudo: ${themeText}`
      : allThemes
        ? 'Estudo completo da jornada PJ'
        : `Estudo: ${themeText}`,
    period: 'Últimos 365 dias',
    summary: `Estudo com ${sections.length} análises sobre ${themeText}. ${kpiText}.`,
    kpis,
    sections,
    recommendations: recommendationsFrom(sections),
    skipped,
    queryCount: toolContext.queries.length,
    themes,
    generatedBy: 'deterministic',
  };
}

/** "segment = Agronegócio · company_size = Micro" in words people read. */
export function describeCut(filters: FilterCondition[]) {
  return filters
    .map((filter) => ('value' in filter ? [filter.value].flat().join(', ') : filter.field))
    .join(' · ');
}

/**
 * Deterministic version of a follow-up cut: the chapters of the previous study run again with
 * the new filters (applied by `run`), so the result is directly comparable with the original.
 */
export async function buildRefinedStudy(
  toolContext: ToolContext,
  base: {
    title: string;
    sections: Array<{ title: string; question: string; spec: AnalysisSpec }>;
    filters: FilterCondition[];
  },
): Promise<Study> {
  const skipped: string[] = [];
  const cut = describeCut(base.filters);
  const results = await Promise.all(
    base.sections.map(async (section, index) => {
      try {
        const executed = await run(toolContext, section.spec);
        const [dimension] = executed.result.columns.filter((column) => column.type === 'dimension');
        const [metric] = executed.result.columns.filter((column) => column.role === 'value');
        const rows = dimension && metric ? ranked(executed.result, metric.key, dimension.key) : [];
        const findings =
          rows.length > 1
            ? [
                `${dimension!.label} com maior ${metric!.label} (${cut}): ${rows[0]!.label} (${formatValue(rows[0]!.value, metric!.format)}); menor: ${rows.at(-1)!.label} (${formatValue(rows.at(-1)!.value, metric!.format)}).`,
              ]
            : executed.result.insights.slice(0, 2).map((insight) => insight.title);
        return {
          id: `recut-${index + 1}`,
          title: `${section.title} — ${cut}`,
          question: section.question,
          visualization: executed.spec.visualization.type,
          spec: executed.spec,
          result: executed.result,
          findings,
        } satisfies StudySection;
      } catch {
        skipped.push(`${section.title} (o recorte ${cut} não se aplica a esta métrica)`);
        return null;
      }
    }),
  );
  const sections = results.filter((section): section is StudySection => Boolean(section));
  const metricIds = [
    ...new Set(sections.map((section) => section.spec.metrics[0]?.id).filter(Boolean)),
  ] as string[];
  const kpis = await runKpis(
    toolContext,
    metricIds.slice(0, 6).map((id) => [id]),
    skipped,
  );
  return {
    title: `${base.title} — recorte: ${cut}`,
    period: 'Últimos 365 dias',
    summary: `Mesmo estudo anterior refeito só para ${cut}: ${sections.length} de ${base.sections.length} capítulos se aplicam ao recorte.`,
    kpis,
    sections,
    recommendations: [],
    skipped,
    queryCount: toolContext.queries.length,
    themes: [],
    generatedBy: 'deterministic',
  };
}
