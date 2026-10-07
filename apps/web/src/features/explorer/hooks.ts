import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AnalysisSpec } from '@bfp/domain';
import { useDimensionCatalog, useMetricCatalog } from '@/features/catalog/hooks';
import { runAnalysis } from './api';
import { requiredDatasetsFor, toQueryBody } from './spec';

/**
 * Data mesh bases the spec needs but has not selected. `null` while the catalog loads, so the
 * engine is never called before the coverage of the selection is known.
 */
export function useMissingDatasets(spec: AnalysisSpec) {
  const metrics = useMetricCatalog();
  const dimensions = useDimensionCatalog();
  if (!metrics.data || !dimensions.data) {
    return null;
  }
  const selected = spec.datasets ?? [];
  return requiredDatasetsFor(spec, metrics.data, dimensions.data).filter(
    (id) => !selected.includes(id),
  );
}

/**
 * Executes the spec through the governed API; stale requests are aborted on change. The engine
 * only runs over selected data mesh bases that cover every metric, dimension and filter.
 */
export function useAnalysisResult(spec: AnalysisSpec, options: { enabled?: boolean } = {}) {
  const body = toQueryBody(spec);
  const missing = useMissingDatasets(spec);
  const covered = (spec.datasets ?? []).length > 0 && missing !== null && missing.length === 0;
  return useQuery({
    queryKey: ['analytics', JSON.stringify(body)],
    queryFn: ({ signal }) => runAnalysis(spec, signal),
    enabled: (options.enabled ?? true) && spec.metrics.length > 0 && covered,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}
