import type { AnalyticsResponse } from '@/features/explorer/api';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';

function metric(
  overrides: Partial<CatalogMetric> & Pick<CatalogMetric, 'id' | 'shortName'>,
): CatalogMetric {
  return {
    name: overrides.shortName,
    description: `${overrides.shortName} descrição`,
    businessDefinition: 'Definição',
    formula: 'a / b',
    aggregation: 'RATIO',
    format: 'percent',
    domain: 'acquisition',
    owner: 'Acquisition PJ',
    timeField: 'leadCreatedAt',
    allowedDimensions: ['acquisition_channel', 'company_size', 'state', 'lead_date'],
    allowedFilters: ['state'],
    certificationStatus: 'CERTIFIED',
    version: '2.1',
    category: 'Conversão',
    tags: [],
    featured: true,
    datasets: ['customer_360'],
    ...overrides,
  };
}

export const METRICS: CatalogMetric[] = [
  metric({
    id: 'cac',
    shortName: 'CAC',
    format: 'currency',
    certificationStatus: 'EXPERIMENTAL',
    libraryOrder: 2,
  }),
  metric({ id: 'account_conversion_rate', shortName: 'Conversão de abertura', libraryOrder: 1 }),
  metric({ id: 'leads', shortName: 'Leads', featured: false, format: 'number' }),
];

function dimension(
  overrides: Partial<CatalogDimension> & Pick<CatalogDimension, 'id' | 'label'>,
): CatalogDimension {
  return {
    name: overrides.label,
    description: `${overrides.label} descrição`,
    type: 'enum',
    domain: 'acquisition',
    source: `company.${overrides.id}`,
    allowedOperators: ['EQ', 'IN'],
    certificationStatus: 'CERTIFIED',
    featured: true,
    ordering: 10,
    dataset: 'customer_360',
    ...overrides,
  };
}

export const DIMENSIONS: CatalogDimension[] = [
  dimension({
    id: 'acquisition_channel',
    label: 'Canal',
    libraryOrder: 1,
    valueLabels: { GOOGLE_SEARCH: 'Google Search', META: 'Meta', ORGANIC: 'Organic' },
  }),
  dimension({ id: 'company_size', label: 'Porte da empresa', libraryOrder: 2 }),
  dimension({ id: 'state', label: 'Estado', libraryOrder: 3 }),
  dimension({ id: 'product', label: 'Produto', libraryOrder: 4, dataset: 'company_products' }),
  dimension({
    id: 'lead_date',
    label: 'Data do lead',
    type: 'date',
    source: 'company.leadCreatedAt',
    featured: false,
  }),
];

export const CONVERSION_BY_CHANNEL: AnalyticsResponse = {
  columns: [
    {
      key: 'acquisition_channel',
      label: 'Canal',
      type: 'dimension',
      format: 'text',
      role: 'category',
    },
    {
      key: 'account_conversion_rate',
      label: 'Conversão de abertura',
      type: 'metric',
      format: 'percent',
      role: 'value',
    },
  ],
  rows: [
    { acquisition_channel: 'META', account_conversion_rate: 0.097 },
    { acquisition_channel: 'GOOGLE_SEARCH', account_conversion_rate: 0.148 },
    { acquisition_channel: 'ORGANIC', account_conversion_rate: 0.136 },
  ],
  metadata: {
    queryId: 'q1',
    executionMs: 4,
    rowCount: 3,
    freshness: '2026-10-07T00:00:00.000Z',
    qualityScore: 0.99,
    metricDefinitions: [],
  },
  visualization: { requestedType: 'BAR', recommendedType: 'BAR', reason: '' },
  valueLabels: {
    acquisition_channel: { META: 'Meta', GOOGLE_SEARCH: 'Google Search', ORGANIC: 'Organic' },
  },
  insights: [
    {
      id: 'i1',
      type: 'DIFFERENCE',
      tone: 'highlight',
      title: 'Google Search: 5,1 p.p. acima de Meta',
      description: 'Google Search (14,8%) está 5,1 p.p. acima de Meta (9,7%).',
      metricId: 'account_conversion_rate',
      evidence: { winner: 'Google Search', loser: 'Meta' },
    },
  ],
};

const meshDataset = (id: string, name: string, domain: string) => ({
  id,
  name,
  description: `${name} do data mesh`,
  domain,
  owner: 'Owner PJ',
  grain: '1 linha por empresa',
  sourceSystem: 'Sistema',
  joinKey: 'company_id',
  location: { catalog: 'glue', database: `bfp_pj_dev_${id}`, table: id },
  columns: [{ name: 'company_id', type: 'string', description: 'Chave' }],
  tags: {},
  available: true,
  metricIds: [],
});

export const MESH_ROUTE = {
  path: '/mesh/datasets',
  respond: {
    items: [
      {
        ...meshDataset('customer_360', 'Customer 360', 'customer360'),
        atlan: {
          guid: 'g',
          certificateStatus: 'VERIFIED',
          owners: ['clientes-pj'],
          terms: [],
          url: 'https://itau.atlan.com/assets/g/overview',
        },
      },
      meshDataset('media_touchpoints', 'Mídia', 'media'),
      meshDataset('company_products', 'Produtos', 'products'),
    ],
    total: 3,
    sources: { mesh: 'glue', datazone: 'disabled', atlan: 'ok' },
  },
};

export const CATALOG_ROUTES = [
  MESH_ROUTE,
  { path: '/catalog/metrics', respond: { items: METRICS, total: METRICS.length, query: null } },
  {
    path: '/catalog/dimensions',
    respond: { items: DIMENSIONS, total: DIMENSIONS.length, query: null },
  },
  {
    path: '/governance/freshness',
    respond: { lastLoadedAt: new Date(Date.now() - 12 * 60_000).toISOString(), minutes: 12 },
  },
];
