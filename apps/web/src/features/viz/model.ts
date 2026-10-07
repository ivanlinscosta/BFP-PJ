import type { ColumnDef } from '@bfp/domain';
import type { AnalyticsResponse } from '@/features/explorer/api';

/** Business label of a raw dimension value. */
export function labelOf(result: AnalyticsResponse, key: string, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  return result.valueLabels?.[key]?.[String(value)] ?? String(value);
}

export function dimensionColumns(result: AnalyticsResponse) {
  return result.columns.filter((column) => column.type === 'dimension');
}

export function metricColumns(result: AnalyticsResponse) {
  return result.columns.filter((column) => column.type === 'metric' && column.role === 'value');
}

export function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Nice axis maximum and ticks (e.g. 0, 4, 8, 12, 16 for a 14,8% maximum). */
export function niceScale(maxValue: number, tickCount = 4) {
  if (maxValue <= 0) {
    return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }

  const rawStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = [1, 2, 2.5, 4, 5, 10].find((candidate) => normalized <= candidate) ?? 10;
  const step = factor * magnitude;
  const max = Number((Math.ceil(maxValue / step - 1e-9) * step).toFixed(10));
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, index) =>
    Number((index * step).toFixed(10)),
  );
  return { max, ticks };
}

/** Ordinal rank used to sort temporal values chronologically. */
export function compareDimensionValues(left: unknown, right: unknown) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', { numeric: true });
}

/** Sort order of company size buckets. */
const SIZE_ORDER = ['MEI', 'Micro', 'Pequena', 'Média', 'Grande'];

export function compareCategory(column: ColumnDef, left: string, right: string) {
  if (column.key === 'company_size') {
    return SIZE_ORDER.indexOf(left) - SIZE_ORDER.indexOf(right);
  }

  return left.localeCompare(right, 'pt-BR', { numeric: true });
}
