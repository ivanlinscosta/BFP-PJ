import type { AnalyticsResponse } from '@/features/explorer/api';
import { dimensionColumns, labelOf, metricColumns, numeric } from './model';

/**
 * Generic transformation layer: reshapes the aggregated result of POST /analytics/query into what
 * advanced charts need (bins, quartiles, cohorts, contributions, flows, stages). No chart has its
 * own endpoint; every shape is derived from the same governed result.
 */

export interface Bin {
  label: string;
  from: number;
  to: number;
  count: number;
}

/** Equal-width bins of the values (bins = Sturges' rule by default). */
export function histogram(
  values: number[],
  bins?: number,
  format?: (value: number) => string,
): Bin[] {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return [];
  const count = Math.max(2, Math.min(40, bins ?? Math.ceil(Math.log2(clean.length) + 1)));
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const width = max === min ? 1 : (max - min) / count;
  const result: Bin[] = Array.from({ length: count }, (_, index) => {
    const from = min + index * width;
    const to = index === count - 1 ? max : from + width;
    const show = format ?? ((value: number) => String(Math.round(value)));
    return { label: `${show(from)} – ${show(to)}`, from, to, count: 0 };
  });
  for (const value of clean) {
    const index = Math.min(count - 1, Math.floor((value - min) / width));
    result[index]!.count += 1;
  }
  return result;
}

export interface Quartiles {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
  count: number;
}

function quantile(sorted: number[], q: number) {
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base]! : sorted[base]! + rest * (next - sorted[base]!);
}

/** Five-number summary with outliers beyond 1,5 × IQR. */
export function quartiles(values: number[]): Quartiles | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const fence = 1.5 * (q3 - q1);
  const inside = sorted.filter((value) => value >= q1 - fence && value <= q3 + fence);
  return {
    min: inside[0] ?? sorted[0]!,
    q1,
    median: quantile(sorted, 0.5),
    q3,
    max: inside.at(-1) ?? sorted.at(-1)!,
    outliers: sorted.filter((value) => value < q1 - fence || value > q3 + fence),
    count: sorted.length,
  };
}

/** Box per value of the first dimension, over the values of the second (or one box overall). */
export function boxGroups(result: AnalyticsResponse) {
  const [group, item] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!group || !metric) return [];
  const byGroup = new Map<string, number[]>();
  for (const row of result.rows) {
    const key = item ? String(row[group.key] ?? '') : metric.label;
    const value = numeric(row[metric.key]);
    if (value === null) continue;
    byGroup.set(key, [...(byGroup.get(key) ?? []), value]);
  }
  return [...byGroup.entries()]
    .map(([key, values]) => ({
      key,
      label: item ? labelOf(result, group.key, key) : key,
      stats: quartiles(values),
    }))
    .filter((entry): entry is { key: string; label: string; stats: Quartiles } =>
      Boolean(entry.stats),
    );
}

/** Months between two "AAAA-MM[-DD]" values. */
function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return null;
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

export interface CohortMatrix {
  cohorts: Array<{ key: string; label: string; total: number; cells: Array<number | null> }>;
  periods: number[];
}

/**
 * Cohort matrix from two lifecycle dates (start × event): each start month is a cohort and each
 * column is the number of months elapsed until the event (M0, M1, …).
 */
export function cohortMatrix(result: AnalyticsResponse): CohortMatrix | null {
  const [start, event] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!start || !event || !metric) return null;
  const cohorts = new Map<string, Map<number, number>>();
  let maxElapsed = 0;
  for (const row of result.rows) {
    const from = String(row[start.key] ?? '');
    const to = String(row[event.key] ?? '');
    const elapsed = monthsBetween(from, to);
    const value = numeric(row[metric.key]);
    if (elapsed === null || elapsed < 0 || value === null) continue;
    maxElapsed = Math.max(maxElapsed, elapsed);
    const cells = cohorts.get(from) ?? new Map<number, number>();
    cells.set(elapsed, (cells.get(elapsed) ?? 0) + value);
    cohorts.set(from, cells);
  }
  const periods = Array.from({ length: Math.min(maxElapsed, 11) + 1 }, (_, index) => index);
  return {
    periods,
    cohorts: [...cohorts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .filter(([, cells]) => [...cells.values()].some((value) => value > 0))
      .map(([key, cells]) => ({
        key,
        label: labelOf(result, start.key, key),
        total: [...cells.values()].reduce((sum, value) => sum + value, 0),
        cells: periods.map((period) => cells.get(period) ?? null),
      })),
  };
}

/** Cumulative share of the cohorts that reached the event by month M (weighted by cohort size). */
export function retentionCurve(matrix: CohortMatrix) {
  const base = matrix.cohorts.reduce((sum, cohort) => sum + cohort.total, 0);
  return matrix.periods.map((period) => {
    const reached = matrix.cohorts.reduce(
      (sum, cohort) =>
        sum +
        cohort.cells.slice(0, period + 1).reduce<number>((acc, value) => acc + (value ?? 0), 0),
      0,
    );
    return { period, label: `M${period}`, share: base ? reached / base : 0 };
  });
}

export interface WaterfallStep {
  label: string;
  value: number;
  start: number;
  end: number;
  kind: 'part' | 'total';
}

/** Contribution of each category to the total, largest first, closing with the total. */
export function contributions(result: AnalyticsResponse, topN = 12): WaterfallStep[] {
  const [dimension] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!dimension || !metric) return [];
  const values = result.rows
    .map((row) => ({
      label: labelOf(result, dimension.key, row[dimension.key]),
      value: numeric(row[metric.key]) ?? 0,
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  const head = values.slice(0, topN);
  const rest = values.slice(topN).reduce((sum, item) => sum + item.value, 0);
  const parts = rest ? [...head, { label: 'Outros', value: rest }] : head;
  let running = 0;
  const steps: WaterfallStep[] = parts.map((part) => {
    const step = {
      label: part.label,
      value: part.value,
      start: running,
      end: running + part.value,
    };
    running += part.value;
    return { ...step, kind: 'part' as const };
  });
  return [...steps, { label: 'Total', value: running, start: 0, end: running, kind: 'total' }];
}

/** Nodes and links of a flow between two dimensions (origin → destination). */
export function flows(result: AnalyticsResponse, maxNodesPerSide = 8) {
  const [source, target] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!source || !target || !metric) return null;
  const totals = (key: string) => {
    const map = new Map<string, number>();
    for (const row of result.rows) {
      const value = numeric(row[metric.key]) ?? 0;
      map.set(String(row[key] ?? ''), (map.get(String(row[key] ?? '')) ?? 0) + value);
    }
    return [...map.entries()].sort((left, right) => right[1] - left[1]);
  };
  const keep = (entries: Array<[string, number]>) =>
    new Set(entries.slice(0, maxNodesPerSide).map(([key]) => key));
  const sources = keep(totals(source.key));
  const targets = keep(totals(target.key));
  const sourceKey = (value: string) => (sources.has(value) ? value : '__other_source');
  const targetKey = (value: string) => (targets.has(value) ? value : '__other_target');
  const nodes: Array<{ name: string; side: 'source' | 'target' }> = [];
  const index = new Map<string, number>();
  const nodeIndex = (key: string, side: 'source' | 'target', label: string) => {
    const id = `${side}:${key}`;
    if (!index.has(id)) {
      index.set(id, nodes.length);
      nodes.push({ name: label, side });
    }
    return index.get(id)!;
  };
  const links = new Map<string, { source: number; target: number; value: number }>();
  for (const row of result.rows) {
    const value = numeric(row[metric.key]) ?? 0;
    if (value <= 0) continue;
    const from = sourceKey(String(row[source.key] ?? ''));
    const to = targetKey(String(row[target.key] ?? ''));
    const s = nodeIndex(
      from,
      'source',
      from === '__other_source' ? 'Outros' : labelOf(result, source.key, from),
    );
    const t = nodeIndex(
      to,
      'target',
      to === '__other_target' ? 'Outros' : labelOf(result, target.key, to),
    );
    const id = `${s}-${t}`;
    const link = links.get(id) ?? { source: s, target: t, value: 0 };
    link.value += value;
    links.set(id, link);
  }
  return { nodes, links: [...links.values()], metric };
}

/** Funnel stages from stage metrics (ordered by the catalog's funnelStage). */
export function funnelStages(
  result: AnalyticsResponse,
  stageOf: (metricId: string) => number | undefined,
) {
  const row = result.rows[0] ?? {};
  const stages = metricColumns(result)
    .map((column) => ({
      key: column.key,
      label: column.label,
      value: numeric(row[column.key]) ?? 0,
      order: stageOf(column.key) ?? 99,
    }))
    .sort((left, right) => left.order - right.order);
  return stages.map((stage, index) => ({
    ...stage,
    fromPrevious:
      index > 0 && stages[index - 1]!.value ? stage.value / stages[index - 1]!.value : null,
    fromFirst: stages[0]!.value ? stage.value / stages[0]!.value : null,
  }));
}

/** Daily values for a calendar heatmap (keys are "AAAA-MM-DD"). */
export function dailyValues(result: AnalyticsResponse) {
  const [date] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!date || !metric) return { days: new Map<string, number>(), metric };
  const days = new Map<string, number>();
  for (const row of result.rows) {
    const key = String(row[date.key] ?? '').slice(0, 10);
    const value = numeric(row[metric.key]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && value !== null)
      days.set(key, (days.get(key) ?? 0) + value);
  }
  return { days, metric };
}
