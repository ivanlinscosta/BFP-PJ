import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/services/apiClient';

export interface AtlanAsset {
  guid: string;
  certificateStatus?: string;
  certificateMessage?: string;
  description?: string;
  owners: string[];
  terms: string[];
  url: string;
}

/** Data product of the AWS data mesh available to the analysis. */
export interface MeshDataset {
  id: string;
  name: string;
  description: string;
  domain: string;
  owner: string;
  grain: string;
  sourceSystem: string;
  joinKey: string;
  dataProductId: string;
  location: { catalog: 'local' | 'glue'; database: string; table: string };
  columns: Array<{ name: string; type: string; description: string }>;
  tags: Record<string, string>;
  available: boolean;
  metricIds: string[];
  datazone?: { listingId: string; name: string };
  atlan?: AtlanAsset;
}

export interface MeshCatalogResponse {
  items: MeshDataset[];
  total: number;
  sources: {
    mesh: 'local' | 'glue';
    datazone: 'disabled' | 'ok' | 'error';
    atlan: 'not_configured' | 'ok' | 'error';
  };
}

export interface IntegrationStatus {
  mesh: { source: 'local' | 'glue'; databasePrefix: string; datasets: number; available: number };
  datazone: 'disabled' | 'ok' | 'error';
  atlan: 'not_configured' | 'ok' | 'error';
  atlanLinkedAssets: number;
  fullstory: 'configured' | 'not_configured';
  analyticsEngine: string;
}

export async function listMeshDatasets() {
  return apiRequest<MeshCatalogResponse>('/mesh/datasets');
}

export async function getIntegrationStatus() {
  return apiRequest<IntegrationStatus>('/integrations/status');
}

export async function syncAtlan() {
  return apiRequest<{ published: number }, Record<string, never>>('/integrations/atlan/sync', {
    method: 'POST',
    body: {},
  });
}

export function useMeshDatasets() {
  return useQuery({
    queryKey: ['mesh', 'datasets'],
    queryFn: listMeshDatasets,
    staleTime: 5 * 60_000,
  });
}

export function useIntegrationStatus() {
  return useQuery({
    queryKey: ['integrations', 'status'],
    queryFn: getIntegrationStatus,
    staleTime: 60_000,
  });
}

/** Human labels of the integration states. */
export const SOURCE_LABELS = {
  mesh: { local: 'Definições locais (desenvolvimento)', glue: 'AWS Glue + Lake Formation' },
  datazone: { disabled: 'Não configurado', ok: 'Conectado', error: 'Falha na conexão' },
  atlan: { not_configured: 'Não configurado', ok: 'Conectado', error: 'Falha na conexão' },
  fullstory: { configured: 'Conectado', not_configured: 'Não configurado' },
} as const;

/** First rows of a base (catalog preview, up to 100 rows of governed columns). */
export interface DatasetPreview {
  dataset: string;
  table: string;
  columns: Array<{ name: string; type: string; description: string }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  limit: number;
  source: 'athena' | 'local';
}

export function useDatasetPreview(datasetId: string) {
  return useQuery({
    queryKey: ['mesh', 'preview', datasetId],
    queryFn: async () =>
      (
        await apiRequest<{ preview: DatasetPreview }>(
          `/mesh/datasets/${encodeURIComponent(datasetId)}/preview?limit=100`,
        )
      ).preview,
    enabled: Boolean(datasetId),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
