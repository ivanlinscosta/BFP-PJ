import type { QualityHealthState } from '@bfp/domain';
import { apiRequest } from '@/services/apiClient';

export interface GovernanceDataProduct {
  id: string;
  name: string;
  description: string;
  domain: string;
  owner: string;
  goldDataset: string;
  goldTable: string;
  businessSources: string[];
  metricIds: string[];
  freshness: { lastLoadedAt: string; minutes: number; withinSLO: boolean };
  sloMinutes: number;
  qualityThreshold: number;
  qualityRatio: number;
  measures: { completeness: number; validity: number; uniqueness: number };
  score: number;
  status: QualityHealthState;
  openIncidentCount: number;
  records: number;
}

export async function listGovernanceDataProducts() {
  return (await apiRequest<{ items: GovernanceDataProduct[] }>('/governance/data-products')).items;
}
