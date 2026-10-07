import type { AnalyticsInsight } from '@bfp/analytics-engine';
import type { AnalysisSpec, AnalyticsResult, SharingLevel } from '@bfp/domain';
import { apiRequest } from '@/services/apiClient';
import { toQueryBody } from './spec';

export interface VisualizationRecommendation {
  requestedType: string;
  recommendedType: string;
  reason: string;
}

/** Governed analytics result enriched with labels and deterministic insights. */
export interface AnalyticsResponse extends AnalyticsResult {
  visualization: VisualizationRecommendation;
  insights: AnalyticsInsight[];
  valueLabels: Record<string, Record<string, string>>;
}

export type ObjectAccess = 'OWNER' | 'EDIT' | 'VIEW';

export type SavedAnalysis = AnalysisSpec & { id: string; name: string; access?: ObjectAccess };

export async function runAnalysis(spec: AnalysisSpec, signal?: AbortSignal) {
  return apiRequest<AnalyticsResponse, AnalysisSpec>('/analytics/query', {
    method: 'POST',
    body: toQueryBody(spec),
    signal,
  });
}

export async function listAnalyses() {
  return (await apiRequest<{ items: SavedAnalysis[] }>('/analyses')).items;
}

export async function getAnalysis(id: string) {
  return (await apiRequest<{ analysis: SavedAnalysis }>(`/analyses/${encodeURIComponent(id)}`))
    .analysis;
}

export interface SaveAnalysisInput {
  id?: string;
  name: string;
  description?: string;
  visibility?: SharingLevel;
  team?: string;
  spec: AnalysisSpec;
}

export async function saveAnalysis(input: SaveAnalysisInput) {
  const body: AnalysisSpec = {
    ...toQueryBody(input.spec),
    name: input.name,
    metadata: {
      description: input.description,
      visibility: input.visibility,
      team: input.team,
    },
  };
  const path = input.id ? `/analyses/${encodeURIComponent(input.id)}` : '/analyses';
  return (
    await apiRequest<{ analysis: SavedAnalysis }, AnalysisSpec>(path, {
      method: input.id ? 'PUT' : 'POST',
      body,
    })
  ).analysis;
}

export async function deleteAnalysis(id: string) {
  await apiRequest<void>(`/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
