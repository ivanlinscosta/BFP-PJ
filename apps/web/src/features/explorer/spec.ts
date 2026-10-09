import type { AnalysisSpec, DateRangeSpec, DimensionSelection, FilterCondition } from '@bfp/domain';
import { analysisSpecSchema } from '@bfp/schemas';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';

export const SPEC_QUERY_PARAM = 'spec';
export const DEFAULT_DATE_RANGE: DateRangeSpec = { type: 'LAST_N_DAYS', value: 90 };

/** Virtual library item: resolved to a date dimension with month granularity. */
export const MONTH_DIMENSION_ID = 'month';

export function createEmptySpec(): AnalysisSpec {
  return {
    metrics: [],
    dimensions: [],
    filters: [],
    dateRange: DEFAULT_DATE_RANGE,
    visualization: { type: 'AUTO', mode: 'AUTO' },
  };
}

/** Request body sent to POST /analytics/query: only the governed contract, no UI state. */
export function toQueryBody(spec: AnalysisSpec): AnalysisSpec {
  return {
    datasets: spec.datasets ?? [],
    metrics: spec.metrics.map((metric) => ({ id: metric.id })),
    dimensions: spec.dimensions.map((dimension) =>
      dimension.granularity
        ? { id: dimension.id, granularity: dimension.granularity }
        : { id: dimension.id },
    ),
    filters: spec.filters,
    dateRange: spec.dateRange,
    comparison: spec.comparison,
    sorting: spec.sorting,
    limit: spec.limit,
    visualization: spec.visualization,
  };
}

/** Builds an /explorar link that opens the playground with the given spec. */
export function buildExplorerHref(spec: Partial<AnalysisSpec>) {
  const full = { ...createEmptySpec(), ...spec };
  return `/explorar?${new URLSearchParams({ [SPEC_QUERY_PARAM]: JSON.stringify(toQueryBody(full)) }).toString()}`;
}

/** Parses a spec from the URL; invalid payloads are ignored. */
export function parseSpecParam(raw: string | null): AnalysisSpec | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AnalysisSpec>;
    const candidate = {
      ...createEmptySpec(),
      ...parsed,
      visualization: parsed.visualization ?? { type: 'AUTO' },
    };
    if (candidate.metrics.length === 0) {
      return { ...candidate, metrics: [] };
    }
    const validated = analysisSpecSchema.safeParse(candidate);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

/** Resolves "Mês" to the date dimension that matches the metrics' time field. */
export function resolveMonthDimension(
  metrics: CatalogMetric[],
  dimensions: CatalogDimension[],
): DimensionSelection | null {
  const dateDimensions = dimensions.filter((dimension) => dimension.type === 'date');
  const compatible = dateDimensions.filter((dimension) =>
    metrics.every(
      (metric) =>
        metric.allowedDimensions === '*' || metric.allowedDimensions.includes(dimension.id),
    ),
  );
  const primary = metrics[0];
  const byTimeField = primary
    ? compatible.find((dimension) => dimension.source.endsWith(`.${primary.timeField}`))
    : undefined;
  const chosen = byTimeField ?? compatible[0];
  return chosen ? { id: chosen.id, granularity: 'month' } : null;
}

/** Whether every selected metric accepts the dimension. */
export function isDimensionCompatible(dimensionId: string, metrics: CatalogMetric[]) {
  return metrics.every(
    (metric) => metric.allowedDimensions === '*' || metric.allowedDimensions.includes(dimensionId),
  );
}

/** Stable identity of a filter inside the builder. */
export function filterKey(filter: FilterCondition, index: number) {
  return `${filter.field}:${filter.operator}:${index}`;
}

/** Datasets the current selection needs (metrics' fact bases + dimension/filter owners). */
export function requiredDatasetsFor(
  spec: AnalysisSpec,
  metrics: CatalogMetric[],
  dimensions: CatalogDimension[],
) {
  const needed = new Set<string>();
  spec.metrics.forEach((selection) =>
    metrics.find((metric) => metric.id === selection.id)?.datasets?.forEach((id) => needed.add(id)),
  );
  [
    ...spec.dimensions.map((dimension) => dimension.id),
    ...spec.filters.map((filter) => filter.field),
  ].forEach((id) => {
    const owner = dimensions.find((dimension) => dimension.id === id)?.dataset;
    if (owner) needed.add(owner);
  });
  return [...needed];
}

/** Removes metrics, dimensions and filters that depend on datasets no longer selected. */
export function pruneToDatasets(
  spec: AnalysisSpec,
  datasets: string[],
  metrics: CatalogMetric[],
  dimensions: CatalogDimension[],
): AnalysisSpec {
  const allowedMetric = (id: string) =>
    (metrics.find((metric) => metric.id === id)?.datasets ?? []).every((dataset) =>
      datasets.includes(dataset),
    );
  const allowedDimension = (id: string) => {
    const owner = dimensions.find((dimension) => dimension.id === id)?.dataset;
    return !owner || datasets.includes(owner);
  };
  return {
    ...spec,
    datasets,
    metrics: spec.metrics.filter((metric) => allowedMetric(metric.id)),
    dimensions: spec.dimensions.filter((dimension) => allowedDimension(dimension.id)),
    filters: spec.filters.filter((filter) => allowedDimension(filter.field)),
  };
}
