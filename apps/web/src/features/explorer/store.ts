import type {
  AnalysisSpec,
  DateGranularity,
  DateRangeSpec,
  FilterCondition,
  SortSpec,
  VisualizationType,
} from '@bfp/domain';
import { applyAnalysisOperations, type AnalysisOperation } from '@bfp/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEmptySpec } from './spec';

/** Lightweight confirmation shown after a structural change (e.g. from Inteligência PJ). */
export interface AnalysisChangeNotice {
  id: number;
  message: string;
}

export interface SavedAnalysisRef {
  id: string;
  name: string;
}

interface AnalysisState {
  spec: AnalysisSpec;
  saved: SavedAnalysisRef | null;
  dirty: boolean;
  notice: AnalysisChangeNotice | null;
  setDatasets(datasetIds: string[]): void;
  setSpec(spec: AnalysisSpec): void;
  addMetric(metricId: string): void;
  removeMetric(metricId: string): void;
  addDimension(dimensionId: string, granularity?: DateGranularity): void;
  removeDimension(dimensionId: string): void;
  addFilter(filter: FilterCondition): void;
  updateFilter(index: number, filter: FilterCondition): void;
  removeFilter(index: number): void;
  setDateRange(dateRange: DateRangeSpec): void;
  setVisualization(type: VisualizationType): void;
  setSort(sort: SortSpec[] | undefined): void;
  setComparison(enabled: boolean): void;
  clearAnalysis(): void;
  loadAnalysis(spec: AnalysisSpec, saved?: SavedAnalysisRef | null): void;
  applyOperations(operations: AnalysisOperation[], message?: string): void;
  markSaved(saved: SavedAnalysisRef): void;
  dismissNotice(): void;
}

let noticeSequence = 0;

function update(
  set: (
    partial: Partial<AnalysisState> | ((state: AnalysisState) => Partial<AnalysisState>),
  ) => void,
  operations: AnalysisOperation[],
) {
  set((state) => ({ spec: applyAnalysisOperations(state.spec, operations), dirty: true }));
}

/**
 * Single source of truth of the playground. Explorer, Inteligência PJ and deep links all
 * read and write the same AnalysisSpec through these actions.
 */
export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set) => ({
      spec: createEmptySpec(),
      saved: null,
      dirty: false,
      notice: null,
      setSpec: (spec) => set({ spec, dirty: true }),
      setDatasets: (datasetIds) =>
        set((state) => ({ spec: { ...state.spec, datasets: datasetIds }, dirty: true })),
      addMetric: (metricId) => update(set, [{ type: 'ADD_METRIC', metricId }]),
      removeMetric: (metricId) => update(set, [{ type: 'REMOVE_METRIC', metricId }]),
      addDimension: (dimensionId, granularity) =>
        update(set, [{ type: 'ADD_DIMENSION', dimensionId, granularity }]),
      removeDimension: (dimensionId) => update(set, [{ type: 'REMOVE_DIMENSION', dimensionId }]),
      addFilter: (filter) => update(set, [{ type: 'ADD_FILTER', filter }]),
      updateFilter: (index, filter) =>
        set((state) => ({
          spec: {
            ...state.spec,
            filters: state.spec.filters.map((current, position) =>
              position === index ? filter : current,
            ),
          },
          dirty: true,
        })),
      removeFilter: (index) =>
        set((state) => ({
          spec: {
            ...state.spec,
            filters: state.spec.filters.filter((_, position) => position !== index),
          },
          dirty: true,
        })),
      setDateRange: (dateRange) => update(set, [{ type: 'SET_DATE_RANGE', dateRange }]),
      setVisualization: (visualization) =>
        update(set, [{ type: 'SET_VISUALIZATION', visualization }]),
      setSort: (sorting) => set((state) => ({ spec: { ...state.spec, sorting }, dirty: true })),
      setComparison: (enabled) =>
        update(set, [{ type: 'SET_COMPARISON', comparison: enabled ? 'PREVIOUS_PERIOD' : 'NONE' }]),
      clearAnalysis: () =>
        set((state) => ({
          spec: { ...createEmptySpec(), datasets: state.spec.datasets },
          saved: null,
          dirty: false,
          notice: null,
        })),
      loadAnalysis: (spec, saved = null) => set({ spec, saved, dirty: false, notice: null }),
      applyOperations: (operations, message) =>
        set((state) => ({
          spec: applyAnalysisOperations(state.spec, operations),
          dirty: true,
          notice: message ? { id: ++noticeSequence, message } : state.notice,
        })),
      markSaved: (saved) => set({ saved, dirty: false }),
      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: 'bfp-analysis',
      storage: createJSONStorage(() => window.sessionStorage),
      partialize: (state) => ({ spec: state.spec, saved: state.saved, dirty: state.dirty }),
    },
  ),
);
