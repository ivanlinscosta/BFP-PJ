import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SpecLabelResolver } from '@bfp/shared';
import { fetchDimensions, fetchMetricDetail, fetchMetrics } from './api';

const CATALOG_STALE_MS = 5 * 60 * 1000;

export function useMetricCatalog() {
  return useQuery({
    queryKey: ['catalog', 'metrics'],
    queryFn: ({ signal }) => fetchMetrics(undefined, signal),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useDimensionCatalog() {
  return useQuery({
    queryKey: ['catalog', 'dimensions'],
    queryFn: ({ signal }) => fetchDimensions(undefined, signal),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useMetricDetail(metricId: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'metric', metricId],
    queryFn: () => fetchMetricDetail(metricId!),
    enabled: Boolean(metricId),
    staleTime: 60_000,
  });
}

/** Label resolver backed by the governed catalog (falls back to ids while loading). */
export function useSpecLabels(): SpecLabelResolver {
  const metrics = useMetricCatalog();
  const dimensions = useDimensionCatalog();

  return useMemo(() => {
    const metricById = new Map((metrics.data ?? []).map((metric) => [metric.id, metric]));
    const dimensionById = new Map(
      (dimensions.data ?? []).map((dimension) => [dimension.id, dimension]),
    );

    return {
      metric: (id) => metricById.get(id)?.shortName ?? id,
      dimension: (id) => dimensionById.get(id)?.label ?? id,
      value: (fieldId, value) =>
        dimensionById.get(fieldId)?.valueLabels?.[String(value)] ?? String(value),
    };
  }, [metrics.data, dimensions.data]);
}
