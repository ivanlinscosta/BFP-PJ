import type { AnalysisSpec, DateRangeSpec, FilterCondition } from '@bfp/domain';

/** Resolves business labels for ids used inside an AnalysisSpec. */
export interface SpecLabelResolver {
  metric(id: string): string;
  dimension(id: string): string;
  value(fieldId: string, value: unknown): string;
}

const PRESET_LABELS: Record<Exclude<DateRangeSpec['type'], 'LAST_N_DAYS' | 'CUSTOM'>, string> = {
  TODAY: 'hoje',
  YESTERDAY: 'ontem',
  LAST_7_DAYS: 'últimos 7 dias',
  LAST_30_DAYS: 'últimos 30 dias',
  LAST_90_DAYS: 'últimos 90 dias',
  LAST_120_DAYS: 'últimos 120 dias',
  THIS_MONTH: 'este mês',
  LAST_MONTH: 'mês passado',
  THIS_QUARTER: 'este trimestre',
  LAST_QUARTER: 'trimestre passado',
  THIS_YEAR: 'este ano',
  LAST_YEAR: 'ano passado',
  ALL_TIME: 'todo o histórico',
};

const OPERATOR_SYMBOLS: Record<FilterCondition['operator'], string> = {
  EQ: '=',
  NEQ: '≠',
  IN: 'em',
  NOT_IN: 'fora de',
  GT: '>',
  GTE: '≥',
  LT: '<',
  LTE: '≤',
  BETWEEN: 'entre',
  CONTAINS: 'contém',
  IS_NULL: 'vazio',
  IS_NOT_NULL: 'preenchido',
};

function formatDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(date);
}

/** Human label for a date range, in lower case (e.g. "últimos 90 dias"). */
export function describeDateRange(range: DateRangeSpec | undefined) {
  if (!range) {
    return 'todo o histórico';
  }

  if (range.type === 'LAST_N_DAYS') {
    return range.value === 1 ? 'último dia' : `últimos ${range.value} dias`;
  }

  if (range.type === 'CUSTOM') {
    return `${formatDay(range.from)} a ${formatDay(range.to)}`;
  }

  return PRESET_LABELS[range.type];
}

/** Human label for a filter (e.g. "Estado = SP"). */
export function describeFilter(filter: FilterCondition, resolver: SpecLabelResolver) {
  const field = resolver.dimension(filter.field);
  const operator = OPERATOR_SYMBOLS[filter.operator];

  if (!('value' in filter)) {
    return `${field} ${operator}`;
  }

  if (Array.isArray(filter.value)) {
    const values = filter.value.map((value) => resolver.value(filter.field, value));
    return filter.operator === 'BETWEEN'
      ? `${field} entre ${values.join(' e ')}`
      : `${field} ${operator} ${values.join(', ')}`;
  }

  return `${field} ${operator} ${resolver.value(filter.field, filter.value)}`;
}

function joinWithAnd(items: string[]) {
  if (items.length <= 1) {
    return items.join('');
  }

  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Structured, human description of an AnalysisSpec used by cards, titles and AI context. */
export function describeAnalysisSpec(spec: AnalysisSpec, resolver: SpecLabelResolver) {
  const metrics = spec.metrics.map((metric) => resolver.metric(metric.id));
  const dimensions = spec.dimensions.map((dimension) => resolver.dimension(dimension.id));
  const filters = spec.filters.map((filter) => describeFilter(filter, resolver));
  const period = describeDateRange(spec.dateRange);
  const title =
    metrics.length === 0
      ? 'Nova análise'
      : dimensions.length === 0
        ? joinWithAnd(metrics)
        : `${joinWithAnd(metrics)} por ${joinWithAnd(dimensions)}`;
  const sentence = [
    title,
    filters.length > 0 ? `onde ${joinWithAnd(filters)}` : '',
    `nos ${period}`.replace('nos todo', 'em todo').replace('nos este', 'neste'),
  ]
    .filter(Boolean)
    .join(' ');

  return { title, sentence, metrics, dimensions, filters, period };
}
