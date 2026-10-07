import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AnalysisSpec } from '@bfp/domain';
import { runAnalysis } from './api';
import { toQueryBody } from './spec';

/** Executes the spec through the governed API; stale requests are aborted on change. */
export function useAnalysisResult(spec: AnalysisSpec, options: { enabled?: boolean } = {}) {
  const body = toQueryBody(spec);
  return useQuery({
    queryKey: ['analytics', JSON.stringify(body)],
    queryFn: ({ signal }) => runAnalysis(spec, signal),
    enabled: (options.enabled ?? true) && spec.metrics.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}
