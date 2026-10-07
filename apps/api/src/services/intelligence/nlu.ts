import type { AnalysisSpec, DateRangeSpec, FilterCondition, VisualizationType } from '@bfp/domain';
import { compatibility, getMetricDefinition, listDimensionDefinitions } from '@bfp/semantic-layer';
import type { AnalysisOperation } from '@bfp/shared';
import { normalizeSearchText } from '@api/http/textSearch';

/** Lexicon entry mapping business phrases to a governed id. */
interface LexiconEntry {
  id: string;
  phrases: string[];
}

/** Governed metric vocabulary. Only ids that exist in the semantic catalog. */
const METRIC_LEXICON: LexiconEntry[] = [
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
];

/** Governed dimension vocabulary; "month" is resolved to a compatible date dimension. */
const DIMENSION_LEXICON: LexiconEntry[] = [
  { id: 'acquisition_channel', phrases: ['canais', 'canal'] },
  { id: 'company_size', phrases: ['portes', 'porte', 'tamanho da empresa'] },
  { id: 'state', phrases: ['estados', 'estado', 'uf'] },
  { id: 'segment', phrases: ['segmentos', 'segmento', 'setor'] },
  { id: 'region', phrases: ['regioes', 'regiao'] },
  { id: 'acquisition_campaign', phrases: ['campanhas', 'campanha'] },
  { id: 'product', phrases: ['produto'] },
  { id: 'month', phrases: ['mensal', 'meses', 'mes a mes', 'por mes', 'evolucao'] },
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
];

const VISUALIZATION_LEXICON: Array<{ type: VisualizationType; phrases: string[] }> = [
  { type: 'HEATMAP', phrases: ['mapa de calor', 'heatmap'] },
  { type: 'LINE', phrases: ['linha', 'tendencia'] },
  { type: 'BAR', phrases: ['barras', 'barra'] },
  { type: 'TABLE', phrases: ['tabela'] },
  { type: 'SCATTER', phrases: ['dispersao'] },
];

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
      const pattern = new RegExp(`(^|[^a-z0-9])${phrase.trim()}([^a-z0-9]|$)`);
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
  const visualization = VISUALIZATION_LEXICON.find((entry) =>
    entry.phrases.some((phrase) => normalized.includes(phrase)),
  )?.type;
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
