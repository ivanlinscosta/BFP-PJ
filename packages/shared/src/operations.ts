import type {
  AnalysisSpec,
  DateGranularity,
  DateRangeSpec,
  FilterCondition,
  SortDirection,
  VisualizationType,
} from '@bfp/domain';

/** Structured mutation of an AnalysisSpec, shared by the UI, the AI and the API. */
export type AnalysisOperation =
  | { type: 'ADD_METRIC'; metricId: string }
  | { type: 'REMOVE_METRIC'; metricId: string }
  | { type: 'ADD_DIMENSION'; dimensionId: string; granularity?: DateGranularity }
  | { type: 'REMOVE_DIMENSION'; dimensionId: string }
  | { type: 'ADD_FILTER'; filter: FilterCondition }
  | { type: 'REMOVE_FILTER'; field: string }
  | { type: 'SET_DATE_RANGE'; dateRange: DateRangeSpec }
  | { type: 'SET_VISUALIZATION'; visualization: VisualizationType }
  | { type: 'SORT'; field: string; direction: SortDirection }
  | { type: 'SET_COMPARISON'; comparison: 'NONE' | 'PREVIOUS_PERIOD' }
  | { type: 'ADD_DATASET'; datasetId: string }
  | { type: 'REMOVE_DATASET'; datasetId: string }
  | { type: 'CLEAR' };

/** Applies operations immutably; unknown or redundant operations are ignored. */
export function applyAnalysisOperations(
  spec: AnalysisSpec,
  operations: readonly AnalysisOperation[],
): AnalysisSpec {
  return operations.reduce<AnalysisSpec>((current, operation) => {
    switch (operation.type) {
      case 'ADD_METRIC':
        return current.metrics.some((metric) => metric.id === operation.metricId)
          ? current
          : { ...current, metrics: [...current.metrics, { id: operation.metricId }] };
      case 'REMOVE_METRIC':
        return {
          ...current,
          metrics: current.metrics.filter((metric) => metric.id !== operation.metricId),
          sorting: current.sorting?.filter((sort) => sort.field !== operation.metricId),
        };
      case 'ADD_DIMENSION':
        return current.dimensions.some((dimension) => dimension.id === operation.dimensionId)
          ? current
          : {
              ...current,
              dimensions: [
                ...current.dimensions,
                operation.granularity
                  ? { id: operation.dimensionId, granularity: operation.granularity }
                  : { id: operation.dimensionId },
              ],
              visualization: { type: 'AUTO' },
            };
      case 'REMOVE_DIMENSION':
        return {
          ...current,
          dimensions: current.dimensions.filter(
            (dimension) => dimension.id !== operation.dimensionId,
          ),
          sorting: current.sorting?.filter((sort) => sort.field !== operation.dimensionId),
          visualization: { type: 'AUTO' },
        };
      case 'ADD_FILTER':
        return {
          ...current,
          filters: [
            ...current.filters.filter((filter) => filter.field !== operation.filter.field),
            operation.filter,
          ],
        };
      case 'REMOVE_FILTER':
        return {
          ...current,
          filters: current.filters.filter((filter) => filter.field !== operation.field),
        };
      case 'SET_DATE_RANGE':
        return { ...current, dateRange: operation.dateRange };
      case 'SET_VISUALIZATION':
        return { ...current, visualization: { type: operation.visualization } };
      case 'SORT':
        return {
          ...current,
          sorting: [{ field: operation.field, direction: operation.direction }],
        };
      case 'SET_COMPARISON':
        return { ...current, comparison: { type: operation.comparison } };
      case 'ADD_DATASET':
        return (current.datasets ?? []).includes(operation.datasetId)
          ? current
          : { ...current, datasets: [...(current.datasets ?? []), operation.datasetId] };
      case 'REMOVE_DATASET':
        return {
          ...current,
          datasets: (current.datasets ?? []).filter((id) => id !== operation.datasetId),
        };
      case 'CLEAR':
        return {
          datasets: current.datasets,
          metrics: [],
          dimensions: [],
          filters: [],
          dateRange: current.dateRange,
          visualization: { type: 'AUTO' },
        };
      default:
        return current;
    }
  }, spec);
}
