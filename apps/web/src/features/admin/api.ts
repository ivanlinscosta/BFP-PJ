import { apiRequest } from '@/services/apiClient';

export interface FeatureFlags {
  aiCopilot: boolean;
  audienceActivation: boolean;
  csvExport: boolean;
  dashboardSharing: boolean;
}

export interface AdminOverview {
  users: Array<{
    id: string;
    name: string;
    email: string;
    team: string;
    role: string;
    status: string;
  }>;
  roles: Array<{ role: string; actions: string[]; domains: string[] }>;
  domains: Array<{ id: string; metrics: number; dimensions: number; dataProducts: number }>;
  metrics: Array<{
    id: string;
    name: string;
    domain: string;
    owner: string;
    certificationStatus: string;
    version: string;
  }>;
  dimensions: Array<{
    id: string;
    name: string;
    domain: string;
    type: string;
    sensitivity: string;
  }>;
  dataProducts: Array<{
    id: string;
    name: string;
    owner: string;
    goldTable: string;
    sloMinutes: number;
  }>;
  semantic: {
    version: string;
    metricCount: number;
    dimensionCount: number;
    glossaryCount: number;
    certifiedMetrics: number;
  };
  runtime: { authMode: string; persistence: string; analyticsEngine: string; aiProvider: string };
  featureFlags: FeatureFlags;
}

export async function getAdminOverview() {
  return apiRequest<AdminOverview>('/admin/overview');
}

export async function updateFeatureFlags(flags: FeatureFlags) {
  return (
    await apiRequest<{ flags: FeatureFlags }, FeatureFlags>('/admin/features', {
      method: 'PUT',
      body: flags,
    })
  ).flags;
}

export async function getFeatureFlags() {
  return (await apiRequest<{ flags: FeatureFlags }>('/admin/features')).flags;
}
