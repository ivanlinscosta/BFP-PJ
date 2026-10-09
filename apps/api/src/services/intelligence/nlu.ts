import type { AnalysisSpec, DateRangeSpec, FilterCondition, VisualizationType } from '@bfp/domain';
import {
  compatibility,
  getMetricDefinition,
  listDimensionDefinitions,
  listMetricDefinitions,
} from '@bfp/semantic-layer';
import type { AnalysisOperation } from '@bfp/shared';
import { normalizeSearchText } from '@api/http/textSearch';

/** Lexicon entry mapping business phrases to a governed id. */
interface LexiconEntry {
  id: string;
  phrases: string[];
}

/** Governed metric vocabulary. Only ids that exist in the semantic catalog. */
const CURATED_METRIC_LEXICON: LexiconEntry[] = [
  // Specific phrases of the usage, payments, service and NPS metrics come before the generic
  // acquisition ones ("conversao", "investimento") so they win the match.
  { id: 'nps', phrases: ['nps', 'net promoter score', 'satisfacao', 'recomendacao'] },
  { id: 'nps_responses', phrases: ['respostas nps', 'respostas de nps'] },
  { id: 'app_error_rate', phrases: ['taxa de erro no app', 'taxa de erro', 'erros no app'] },
  {
    id: 'app_completion_rate',
    phrases: ['taxa de conclusao no app', 'conclusao no app', 'taxa de conclusao'],
  },
  { id: 'app_abandons', phrases: ['abandonos no app', 'abandono no app', 'abandonos'] },
  { id: 'app_sessions', phrases: ['sessoes no app', 'sessoes do app'] },
  { id: 'app_active_companies', phrases: ['ativas no app', 'empresas ativas no app'] },
  { id: 'app_avg_screen_time', phrases: ['tempo por tela', 'tempo em tela', 'tempo no app'] },
  { id: 'app_interactions', phrases: ['interacoes no app', 'uso do app', 'navegacao no app'] },
  { id: 'pix_volume', phrases: ['volume em pix', 'volume de pix', 'pix'] },
  { id: 'boletos_issued', phrases: ['boletos emitidos', 'boletos'] },
  { id: 'average_ticket', phrases: ['ticket medio', 'ticket'] },
  { id: 'transacting_companies', phrases: ['empresas transacionando'] },
  {
    id: 'transaction_volume',
    phrases: ['volume transacionado', 'volume de transacoes', 'volume movimentado'],
  },
  { id: 'transactions_count', phrases: ['quantidade de transacoes', 'transacoes'] },
  { id: 'conversation_resolution_rate', phrases: ['taxa de resolucao', 'resolucao'] },
  { id: 'conversations_resolved', phrases: ['conversas resolvidas'] },
  { id: 'unresolved_conversations', phrases: ['conversas nao resolvidas', 'nao resolvidas'] },
  { id: 'conversations_total', phrases: ['conversas', 'atendimentos'] },
  { id: 'crm_contacted_companies', phrases: ['empresas contatadas'] },
  { id: 'crm_interactions_total', phrases: ['interacoes no crm', 'interacoes de crm', 'crm'] },
  { id: 'digital_sessions', phrases: ['sessoes digitais', 'fullstory'] },
  { id: 'digital_active_companies', phrases: ['ativas no digital'] },
  { id: 'revenue_proxy', phrases: ['receita'] },
  { id: 'products_per_company', phrases: ['produtos por cliente', 'produtos por empresa'] },
  { id: 'new_companies', phrases: ['novos clientes', 'clientes novos'] },
  {
    id: 'account_conversion_rate',
    phrases: ['conversao de abertura', 'taxa de conversao', 'conversao', 'convertem', 'converte'],
  },
  { id: 'activation_d30_rate', phrases: ['ativacao d30', 'ativacao', 'd30', 'ativam'] },
  { id: 'cac', phrases: ['cac', 'custo de aquisicao'] },
  { id: 'accounts_opened', phrases: ['contas abertas', 'abertura de contas'] },
  {
    id: 'media_spend',
    phrases: ['investimento em midia', 'investimento', 'gasto em midia', 'spend'],
  },
  { id: 'onboarding_completion_rate', phrases: ['conclusao de onboarding'] },
  { id: 'leads', phrases: ['leads'] },
  { id: 'digital_contract_rate', phrases: ['contratacao digital', 'taxa de contratacao digital'] },
  { id: 'digital_contracted_products', phrases: ['contratacoes digitais'] },
  { id: 'contracted_products', phrases: ['produtos contratados', 'contratacoes'] },
  { id: 'bankline_active_companies', phrases: ['ativas no bankline', 'usam o bankline'] },
];

/**
 * Curated phrases first, then every governed metric by its catalog name and short name, so a
 * metric added to the semantic layer is understood without touching this file.
 */
const METRIC_LEXICON: LexiconEntry[] = [
  ...CURATED_METRIC_LEXICON,
  ...listMetricDefinitions().map((metric) => ({
    id: metric.id,
    phrases: [
      ...new Set([normalizeSearchText(metric.name), normalizeSearchText(metric.shortName ?? '')]),
    ].filter((phrase) => phrase.length > 2),
  })),
];

/** Governed dimension vocabulary; "month" is resolved to a compatible date dimension. */
const CURATED_DIMENSION_LEXICON: LexiconEntry[] = [
  { id: 'app_screen', phrases: ['telas', 'tela'] },
  { id: 'app_platform', phrases: ['plataforma', 'ios', 'android', 'sistema operacional'] },
  { id: 'app_action', phrases: ['acao no app', 'acoes'] },
  { id: 'transaction_type', phrases: ['tipo de transacao', 'tipos de transacao'] },
  { id: 'transaction_channel', phrases: ['canal da transacao'] },
  { id: 'nps_touchpoint', phrases: ['momento da pesquisa', 'ponto de contato', 'momento'] },
  { id: 'crm_outcome', phrases: ['resultado'] },
  { id: 'crm_interaction_type', phrases: ['tipo de interacao'] },
  { id: 'conversation_channel', phrases: ['canal da conversa', 'canal de atendimento'] },
  // Access channels (App, Bankline, Agência, API) before the generic "canal" (media channel).
  { id: 'product_contract_channel', phrases: ['canal de contratacao', 'canais de contratacao'] },
  { id: 'access_channel', phrases: ['canal de navegacao'] },
  {
    id: 'primary_access_channel',
    phrases: [
      'canal de acesso principal',
      'canais de acesso',
      'canal de acesso',
      'app ou bankline',
      'app e bankline',
      'app x bankline',
    ],
  },
  {
    id: 'acquisition_channel',
    phrases: ['canal de aquisicao', 'canal de midia', 'canais', 'canal'],
  },
  { id: 'company_size', phrases: ['portes', 'porte', 'tamanho da empresa'] },
  { id: 'state', phrases: ['estados', 'estado', 'uf'] },
  { id: 'segment', phrases: ['segmentos', 'segmento', 'setor'] },
  { id: 'region', phrases: ['regioes', 'regiao'] },
  { id: 'acquisition_campaign', phrases: ['campanhas', 'campanha'] },
  { id: 'product', phrases: ['produto'] },
  { id: 'month', phrases: ['mensal', 'meses', 'mes a mes', 'por mes', 'evolucao'] },
];

/** Curated dimension phrases first, then every governed dimension by its catalog label. */
const DIMENSION_LEXICON: LexiconEntry[] = [
  ...CURATED_DIMENSION_LEXICON,
  ...listDimensionDefinitions().map((dimension) => ({
    id: dimension.id,
    phrases: [normalizeSearchText(dimension.label ?? dimension.name)].filter(
      (phrase) => phrase.length > 2,
    ),
  })),
];

const VALUE_LEXICON: Array<{ field: string; value: string; phrases: string[] }> = [
  { field: 'acquisition_channel', value: 'GOOGLE_SEARCH', phrases: ['google search', 'google'] },
  { field: 'acquisition_channel', value: 'META', phrases: ['meta', 'facebook', 'instagram'] },
  { field: 'acquisition_channel', value: 'LINKEDIN', phrases: ['linkedin'] },
  { field: 'acquisition_channel', value: 'ORGANIC', phrases: ['organic', 'organico'] },
  { field: 'acquisition_channel', value: 'REFERRAL', phrases: ['referral', 'indicacao'] },
  { field: 'acquisition_channel', value: 'INSIDE_SALES', phrases: ['inside sales'] },
  { field: 'company_size', value: 'MEI', phrases: ['mei'] },
  { field: 'company_size', value: 'Micro', phrases: ['micro'] },
  { field: 'company_size', value: 'Pequena', phrases: ['pequenas', 'pequena'] },
  { field: 'company_size', value: 'Média', phrases: ['medias', 'media empresa', 'medio porte'] },
  { field: 'company_size', value: 'Grande', phrases: ['grandes', 'grande'] },
  { field: 'state', value: 'SP', phrases: ['sao paulo', ' sp'] },
  { field: 'state', value: 'RJ', phrases: ['rio de janeiro', ' rj'] },
  { field: 'state', value: 'MG', phrases: ['minas gerais', ' mg'] },
  { field: 'state', value: 'PR', phrases: ['parana', ' pr'] },
  { field: 'state', value: 'RS', phrases: ['rio grande do sul', ' rs'] },
  { field: 'segment', value: 'Agronegócio', phrases: ['agronegocio', 'agronegocios', ' agro'] },
  { field: 'segment', value: 'Varejo', phrases: ['varejo', 'varejistas'] },
  { field: 'segment', value: 'Serviços', phrases: ['segmento servicos', 'segmento de servicos'] },
  {
    field: 'segment',
    value: 'Tecnologia',
    phrases: ['segmento tecnologia', 'segmento de tecnologia'],
  },
  { field: 'segment', value: 'Saúde', phrases: ['segmento saude', 'segmento de saude'] },
  { field: 'segment', value: 'Logística', phrases: ['logistica'] },
  { field: 'segment', value: 'Educação', phrases: ['segmento educacao', 'segmento de educacao'] },
  {
    field: 'segment',
    value: 'Construção',
    phrases: ['construcao civil', 'segmento construcao', 'segmento de construcao'],
  },
  {
    field: 'segment',
    value: 'Indústria',
    phrases: ['segmento industria', 'segmento de industria', 'industrial'],
  },
  {
    field: 'segment',
    value: 'Alimentação',
    phrases: ['segmento alimentacao', 'segmento de alimentacao'],
  },
  { field: 'region', value: 'Nordeste', phrases: ['nordeste'] },
  { field: 'region', value: 'Sudeste', phrases: ['sudeste'] },
  { field: 'region', value: 'Centro-Oeste', phrases: ['centro-oeste', 'centro oeste'] },
  { field: 'region', value: 'Norte', phrases: ['regiao norte'] },
  { field: 'region', value: 'Sul', phrases: ['regiao sul'] },
];

/** Chart names, most specific first (only used when phrased as a chart request). */
const VISUALIZATION_LEXICON: Array<{ type: VisualizationType; phrases: string[] }> = [
  { type: 'HEATMAP', phrases: ['mapa de calor', 'heatmap'] },
  { type: 'CALENDAR_HEATMAP', phrases: ['calendario'] },
  { type: 'MAP', phrases: ['mapa'] },
  { type: 'TIMELINE', phrases: ['linha do tempo', 'timeline'] },
  { type: 'MULTI_LINE', phrases: ['multiplas linhas', 'varias linhas'] },
  { type: 'LINE', phrases: ['linhas', 'linha', 'tendencia'] },
  { type: 'AREA_STACKED', phrases: ['area empilhada', 'areas empilhadas'] },
  { type: 'AREA', phrases: ['area'] },
  { type: 'COLUMN_100_STACKED', phrases: ['100% empilhad', 'colunas 100%'] },
  { type: 'BAR_STACKED', phrases: ['barras empilhadas'] },
  { type: 'COLUMN_STACKED', phrases: ['colunas empilhadas', 'empilhad'] },
  { type: 'BAR_GROUPED', phrases: ['barras agrupadas'] },
  { type: 'COLUMN_GROUPED', phrases: ['colunas agrupadas'] },
  { type: 'COLUMN', phrases: ['colunas', 'coluna'] },
  { type: 'BAR_HORIZONTAL', phrases: ['barras horizontais', 'barras', 'barra'] },
  { type: 'TABLE', phrases: ['tabela'] },
  { type: 'KPI', phrases: ['indicador', 'kpi'] },
  { type: 'BUBBLE', phrases: ['bolhas', 'bolha'] },
  { type: 'QUADRANT', phrases: ['quadrantes', 'quadrante'] },
  { type: 'SCATTER', phrases: ['dispersao'] },
  { type: 'DONUT', phrases: ['rosca', 'pizza', 'donut'] },
  { type: 'TREEMAP', phrases: ['treemap'] },
  { type: 'FUNNEL', phrases: ['funil'] },
  { type: 'SANKEY', phrases: ['sankey', 'fluxos', 'fluxo'] },
  { type: 'WATERFALL', phrases: ['cascata', 'waterfall'] },
  { type: 'HISTOGRAM', phrases: ['histograma'] },
  { type: 'BOX_PLOT', phrases: ['box plot', 'boxplot'] },
  { type: 'COHORT', phrases: ['cohort', 'coorte'] },
  { type: 'RETENTION_CURVE', phrases: ['curva de retencao', 'retencao'] },
  { type: 'RADAR', phrases: ['radar'] },
  { type: 'RANKING', phrases: ['ranking'] },
];

/** "em linha", "como funil", "gráfico de rosca", "visualização em mapa". */
function chartRequest(normalized: string) {
  for (const entry of VISUALIZATION_LEXICON) {
    for (const phrase of entry.phrases) {
      const pattern = new RegExp(
        `(^|\\s)(em|como|grafico de|grafico em|visualizacao de|visualizacao em|formato de|use|usar|mostre|mostra|exiba|troque para|mude para)\\s+(um |uma |o |a )?(grafico de |grafico em )?${phrase.replace('%', '\\%')}`,
      );
      if (pattern.test(normalized)) return entry.type;
    }
  }
  return undefined;
}

/** "Qual gráfico faz mais sentido?", "melhor visualização para isso". */
export function asksForChartRecommendation(prompt: string) {
  return /(qual|que|melhor)\s+(o\s+)?(melhor\s+)?(grafico|visualizacao)|grafico (faz|fica) mais sentido|como (devo )?visualizar/.test(
    normalizeSearchText(prompt),
  );
}

const UPDATE_VERBS = [
  'separa',
  'separe',
  'separar',
  'quebra',
  'quebre',
  'abre por',
  'abra por',
  'adiciona',
  'adicione',
  'adicionar',
  'inclui',
  'inclua',
  'incluir',
  'remove',
  'remova',
  'remover',
  'tira',
  'tire',
  'troca',
  'mostra em',
  'mostre em',
  'muda para',
  'compara com',
  'comparar com',
  'compare com',
  'investigar',
  'investiga',
  'investigue',
  'filtra',
  'filtre',
  'agora',
];

const REMOVE_VERBS = ['remove', 'remova', 'remover', 'tira', 'tire', 'sem '];
const QUESTION_STARTERS = [
  'qual',
  'quais',
  'quanto',
  'quantos',
  'como',
  'onde',
  'por que',
  'o que',
];

/** Interpretation of a natural-language request in terms of governed ids. */
export interface ParsedIntent {
  kind: 'QUESTION' | 'BUILD' | 'UPDATE' | 'UNKNOWN';
  metrics: string[];
  dimensions: string[];
  filters: FilterCondition[];
  dateRange?: DateRangeSpec;
  visualization?: VisualizationType;
  comparison: boolean;
  removal: boolean;
  normalized: string;
}

function findMentions(text: string, lexicon: LexiconEntry[]) {
  let remaining = ` ${text} `;
  const found: Array<{ id: string; index: number }> = [];

  for (const entry of lexicon) {
    for (const phrase of entry.phrases) {
      const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
      const match = pattern.exec(remaining);
      if (match) {
        found.push({ id: entry.id, index: match.index });
        remaining =
          remaining.slice(0, match.index) +
          ' '.repeat(match[0].length) +
          remaining.slice(match.index + match[0].length);
        break;
      }
    }
  }

  return {
    ids: [...new Set(found.sort((left, right) => left.index - right.index).map((f) => f.id))],
    remaining: remaining.trim(),
  };
}

function parseDateRange(text: string): DateRangeSpec | undefined {
  const lastDays = /ultimos?\s+(\d{1,3})\s+dias/.exec(text) ?? /(\d{1,3})\s+dias/.exec(text);
  if (lastDays) {
    return { type: 'LAST_N_DAYS', value: Number(lastDays[1]) };
  }

  if (text.includes('mes passado')) {
    return { type: 'LAST_MONTH' };
  }
  if (text.includes('este mes') || text.includes('esse mes')) {
    return { type: 'THIS_MONTH' };
  }
  if (text.includes('este ano') || text.includes('esse ano')) {
    return { type: 'THIS_YEAR' };
  }
  if (text.includes('todo o historico') || text.includes('desde o inicio')) {
    return { type: 'ALL_TIME' };
  }

  return undefined;
}

function parseFilters(text: string): FilterCondition[] {
  const padded = ` ${text} `;
  const byField = new Map<string, string[]>();

  for (const entry of VALUE_LEXICON) {
    if (entry.phrases.some((phrase) => new RegExp(`${phrase}([^a-z0-9]|$)`).test(padded))) {
      byField.set(entry.field, [...(byField.get(entry.field) ?? []), entry.value]);
    }
  }

  return [...byField.entries()].map(([field, values]) =>
    values.length === 1
      ? { field, operator: 'EQ', value: values[0]! }
      : { field, operator: 'IN', value: values },
  );
}

/** Parses a prompt into governed ids. It never creates ids outside the lexicon above. */
export function parseIntent(prompt: string): ParsedIntent {
  const normalized = normalizeSearchText(prompt).replace(/[?!.,;:]/g, ' ');
  const metricMentions = findMentions(normalized, METRIC_LEXICON);
  const filters = parseFilters(normalized);
  const filteredFields = new Set(filters.map((filter) => filter.field));
  const rawDimensions = findMentions(metricMentions.remaining, DIMENSION_LEXICON);
  // "Estado = SP" is a filter, not a breakdown, unless the user explicitly asks "por estado".
  const dimensionMentions = {
    ids: rawDimensions.ids.filter((id) => {
      if (!filteredFields.has(id)) {
        return true;
      }
      const phrases = DIMENSION_LEXICON.find((entry) => entry.id === id)?.phrases ?? [];
      return phrases.some((phrase) => normalized.includes(`por ${phrase}`));
    }),
  };
  const dateRange = parseDateRange(normalized);
  const visualization = chartRequest(normalized);
  const comparison = normalized.includes('periodo anterior');
  const isQuestion =
    prompt.trim().endsWith('?') ||
    QUESTION_STARTERS.some((starter) => normalized.trimStart().startsWith(starter));
  const isUpdate = UPDATE_VERBS.some((verb) => normalized.includes(verb));
  const removal = REMOVE_VERBS.some((verb) => normalized.includes(verb));
  const hasSignal =
    metricMentions.ids.length > 0 ||
    dimensionMentions.ids.length > 0 ||
    filters.length > 0 ||
    Boolean(dateRange) ||
    Boolean(visualization) ||
    comparison;

  let kind: ParsedIntent['kind'] = 'UNKNOWN';
  if (hasSignal && isUpdate && !isQuestion) {
    kind = 'UPDATE';
  } else if (metricMentions.ids.length > 0 && isQuestion) {
    kind = 'QUESTION';
  } else if (metricMentions.ids.length > 0) {
    kind = 'BUILD';
  } else if (hasSignal) {
    kind = isQuestion ? 'QUESTION' : 'UPDATE';
  }

  return {
    kind,
    metrics: metricMentions.ids,
    dimensions: dimensionMentions.ids,
    filters,
    dateRange,
    visualization,
    comparison,
    removal,
    normalized,
  };
}

/** Resolves the virtual "month" dimension to a date dimension compatible with all metrics. */
export function resolveDimensionId(dimensionId: string, metricIds: readonly string[]) {
  if (dimensionId !== 'month') {
    return { id: dimensionId };
  }

  const dateDimension = listDimensionDefinitions()
    .filter((dimension) => dimension.type === 'date')
    .find((dimension) => metricIds.every((metricId) => compatibility(metricId, dimension.id)));
  return dateDimension ? { id: dateDimension.id, granularity: 'month' as const } : null;
}

/** Translates an UPDATE intent into incremental operations over the current spec. */
export function buildUpdateOperations(
  intent: ParsedIntent,
  current: AnalysisSpec,
): AnalysisOperation[] {
  const operations: AnalysisOperation[] = [];
  const metricIds = current.metrics.map((metric) => metric.id);

  for (const metricId of intent.metrics) {
    operations.push(
      intent.removal ? { type: 'REMOVE_METRIC', metricId } : { type: 'ADD_METRIC', metricId },
    );
  }

  const nextMetricIds = intent.removal ? metricIds : [...metricIds, ...intent.metrics];
  for (const dimensionId of intent.dimensions) {
    const resolved = resolveDimensionId(dimensionId, nextMetricIds);
    if (!resolved) {
      continue;
    }
    operations.push(
      intent.removal
        ? { type: 'REMOVE_DIMENSION', dimensionId: resolved.id }
        : { type: 'ADD_DIMENSION', dimensionId: resolved.id, granularity: resolved.granularity },
    );
  }

  for (const filter of intent.filters) {
    operations.push(
      intent.removal
        ? { type: 'REMOVE_FILTER', field: filter.field }
        : { type: 'ADD_FILTER', filter },
    );
  }

  if (intent.dateRange) {
    operations.push({ type: 'SET_DATE_RANGE', dateRange: intent.dateRange });
  }
  if (intent.visualization) {
    operations.push({ type: 'SET_VISUALIZATION', visualization: intent.visualization });
  }
  if (intent.comparison) {
    operations.push({
      type: 'SET_COMPARISON',
      comparison: intent.removal ? 'NONE' : 'PREVIOUS_PERIOD',
    });
  }

  return operations;
}

/** Builds a complete spec for BUILD/QUESTION intents, inheriting missing parts from context. */
export function buildSpecFromIntent(intent: ParsedIntent, context: AnalysisSpec | undefined) {
  const metricIds = intent.metrics;
  const dimensionIds =
    intent.dimensions.length > 0
      ? intent.dimensions
      : (context?.dimensions.map((dimension) => dimension.id) ?? []);
  const dimensions = dimensionIds
    .map((dimensionId) => resolveDimensionId(dimensionId, metricIds))
    .filter((dimension): dimension is NonNullable<typeof dimension> => dimension !== null)
    .filter((dimension) => metricIds.every((metricId) => compatibility(metricId, dimension.id)));
  const filters = intent.filters.length > 0 ? intent.filters : (context?.filters ?? []);

  return {
    metrics: metricIds.map((id) => ({ id })),
    dimensions,
    filters: filters.filter((filter) =>
      metricIds.every((metricId) =>
        getMetricDefinition(metricId)?.allowedFilters.includes(filter.field),
      ),
    ),
    dateRange: intent.dateRange ?? context?.dateRange ?? { type: 'LAST_N_DAYS', value: 90 },
    visualization: { type: intent.visualization ?? 'AUTO' },
  } satisfies AnalysisSpec;
}
