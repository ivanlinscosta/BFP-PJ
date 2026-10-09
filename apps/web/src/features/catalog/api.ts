import type {
  AggregationType,
  BusinessTerm,
  CertificationStatus,
  DimensionSemanticType,
  DimensionValueType,
  LineageGraph,
  MetricFormat,
  MetricSemanticType,
  QualityHealthState,
} from '@bfp/domain';
import { apiRequest } from '@/services/apiClient';

interface ListResponse<TItem> {
  items: TItem[];
  total: number;
}

export interface CatalogMetric {
  id: string;
  name: string;
  shortName: string;
  description: string;
  businessDefinition: string;
  formula: string;
  aggregation: AggregationType;
  format: MetricFormat;
  domain: string;
  owner: string;
  timeField: string;
  allowedDimensions: '*' | string[];
  allowedFilters: string[];
  certificationStatus: CertificationStatus;
  version: string;
  category: string;
  tags: string[];
  featured?: boolean;
  libraryOrder?: number;
  /** Data mesh datasets the metric reads. */
  datasets?: string[];
  additivity?: 'ADDITIVE' | 'NON_ADDITIVE';
  unit?: string;
  /** What the value represents (feeds chart recommendations). */
  semanticType?: MetricSemanticType;
  /** Stage of the acquisition-to-activation funnel (1 = top). */
  funnelStage?: number;
}

export interface CatalogDimension {
  id: string;
  label: string;
  name: string;
  description: string;
  type: DimensionValueType;
  domain: string;
  source: string;
  allowedOperators: string[];
  certificationStatus: CertificationStatus;
  supportedGranularities?: Array<'date' | 'week' | 'month'>;
  featured?: boolean;
  ordering: number;
  libraryOrder?: number;
  valueLabels?: Record<string, string>;
  /** Data mesh dataset that owns the dimension. */
  dataset?: string;
  /** What the dimension represents: GEO, SOURCE, DESTINATION, TIME… */
  semanticType?: DimensionSemanticType;
  cohortRole?: 'START' | 'EVENT';
  geoLevel?: 'UF' | 'REGION';
}

export interface DimensionValue {
  value: string;
  label: string;
}

export interface CatalogDataProduct {
  id: string;
  name: string;
  description: string;
  domain: string;
  owner: string;
  goldDataset: string;
  businessSources: string[];
  freshnessSLOMinutes: number;
  qualityThreshold: number;
  metricIds: string[];
  dimensionIds: string[];
}

export interface MetricDetail {
  metric: CatalogMetric;
  calculation:
    | {
        kind: 'RATIO';
        numerator: { id: string; label: string };
        denominator: { id: string; label: string };
        multiplier: number;
      }
    | { kind: string; expression: string };
  compatibleDimensions: Array<{ id: string; label: string }>;
  dataProduct: {
    id: string;
    name: string;
    owner: string;
    goldDataset: string;
    goldTable: string;
    businessSources: string[];
  } | null;
  trust: {
    owner: string;
    lastLoadedAt: string | null;
    freshnessMinutes: number | null;
    sloMinutes: number;
    qualityRatio: number | null;
    qualityStatus: QualityHealthState | null;
  };
  lineage: {
    stages: Array<{ kind: string; label: string; value: string }>;
    graph: LineageGraph;
  };
}

function withQuery(path: string, q?: string) {
  return q?.trim() ? `${path}?${new URLSearchParams({ q: q.trim() }).toString()}` : path;
}

export async function fetchMetrics(q?: string, signal?: AbortSignal) {
  return (
    await apiRequest<ListResponse<CatalogMetric>>(withQuery('/catalog/metrics', q), { signal })
  ).items;
}

export async function fetchDimensions(q?: string, signal?: AbortSignal) {
  return (
    await apiRequest<ListResponse<CatalogDimension>>(withQuery('/catalog/dimensions', q), {
      signal,
    })
  ).items;
}

export async function fetchDimensionValues(dimensionId: string) {
  return (
    await apiRequest<ListResponse<DimensionValue>>(
      `/catalog/dimensions/${encodeURIComponent(dimensionId)}/values`,
    )
  ).items;
}

export async function fetchGlossary(q?: string, signal?: AbortSignal) {
  return (
    await apiRequest<ListResponse<BusinessTerm>>(withQuery('/catalog/glossary', q), { signal })
  ).items;
}

export async function fetchDataProducts(q?: string, signal?: AbortSignal) {
  return (
    await apiRequest<ListResponse<CatalogDataProduct>>(withQuery('/catalog/data-products', q), {
      signal,
    })
  ).items;
}

export async function fetchMetricDetail(metricId: string) {
  return apiRequest<MetricDetail>(`/catalog/metrics/${encodeURIComponent(metricId)}`);
}
