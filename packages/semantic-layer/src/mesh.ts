import type { BusinessDomain, DatasetEntityType } from '@bfp/domain';
import {
  DIMENSION_DEFINITION_BY_ID,
  METRIC_DEFINITION_BY_ID,
  type GovernedDimensionDefinition,
} from './catalog';

/** Physical data products published in the AWS data mesh (one Glue database per domain). */
export const MESH_DATASET_IDS = [
  'customer_360',
  'media_touchpoints',
  'company_products',
  'conversations',
  'crm_interactions',
  'digital_journey',
] as const;

export type MeshDatasetId = (typeof MESH_DATASET_IDS)[number];

/** Join key shared by every data product of the mesh. */
export const MESH_JOIN_KEY = 'company_id';

/** Governed description of a mesh data product (the physical table behind analyses). */
export interface MeshDatasetDefinition {
  id: MeshDatasetId;
  name: string;
  description: string;
  domain: BusinessDomain;
  owner: string;
  /** Domain database suffix: bfp_pj_<env>_<glueDatabase>. */
  glueDatabase: string;
  table: string;
  grain: string;
  sourceSystem: string;
  entityTypes: readonly DatasetEntityType[];
  /** Business data product (catalog) the table belongs to. */
  dataProductId: string;
  /** Physical schema published in the Glue Data Catalog (Parquet). */
  columns: ReadonlyArray<MeshColumn>;
}

/** Column of a mesh table. */
export interface MeshColumn {
  name: string;
  type: 'string' | 'timestamp' | 'double' | 'bigint' | 'boolean';
  description: string;
}

const col = (name: string, type: MeshColumn['type'], description: string): MeshColumn => ({
  name,
  type,
  description,
});
const COMPANY_KEY = col('company_id', 'string', 'Chave da empresa (join do data mesh)');

export const MESH_DATASETS: readonly MeshDatasetDefinition[] = [
  {
    id: 'customer_360',
    name: 'Customer 360',
    description: 'Cadastro PJ e funil de aquisição, abertura, onboarding e ativação por empresa.',
    domain: 'customer360',
    owner: 'Clientes PJ',
    glueDatabase: 'customer360',
    table: 'customer_360',
    grain: '1 linha por empresa',
    sourceSystem: 'Cadastro PJ · Abertura de contas · Onboarding',
    entityTypes: ['company', 'funnelEvent', 'partner', 'account'],
    dataProductId: 'customer360_profile',
    columns: [
      COMPANY_KEY,
      col('segment', 'string', 'Segmento'),
      col('industry', 'string', 'Indústria'),
      col('company_size', 'string', 'Porte'),
      col('state', 'string', 'UF'),
      col('region', 'string', 'Região'),
      col('acquisition_source', 'string', 'Origem de aquisição'),
      col('acquisition_channel', 'string', 'Canal de aquisição'),
      col('acquisition_campaign_id', 'string', 'Campanha de aquisição'),
      col('company_status', 'string', 'Status no funil'),
      col('lead_created_at', 'timestamp', 'Criação do lead'),
      col('account_opening_started_at', 'timestamp', 'Início da abertura'),
      col('account_opened_at', 'timestamp', 'Conta aberta'),
      col('onboarding_started_at', 'timestamp', 'Início do onboarding'),
      col('onboarding_completed_at', 'timestamp', 'Onboarding concluído'),
      col('activation_date', 'timestamp', 'Ativação'),
      col('lgpd_consent', 'boolean', 'Consentimento LGPD'),
      col('created_at', 'timestamp', 'Criação do registro'),
    ],
  },
  {
    id: 'media_touchpoints',
    name: 'Mídia',
    description:
      'Touchpoints de mídia paga e orgânica com custo, impressões e cliques por campanha.',
    domain: 'media',
    owner: 'Mídia PJ',
    glueDatabase: 'media',
    table: 'media_touchpoints',
    grain: '1 linha por touchpoint',
    sourceSystem: 'Google Ads · Meta Ads · LinkedIn Ads',
    entityTypes: ['touchpoint', 'campaign'],
    dataProductId: 'media_performance',
    columns: [
      col('touchpoint_id', 'string', 'Identificador do touchpoint'),
      COMPANY_KEY,
      col('campaign_id', 'string', 'Campanha'),
      col('channel', 'string', 'Canal da campanha'),
      col('campaign_objective', 'string', 'Objetivo da campanha'),
      col('touchpoint_type', 'string', 'Impressão, clique, visita, formulário'),
      col('occurred_at', 'timestamp', 'Data do evento'),
      col('cost', 'double', 'Custo (R$)'),
      col('impressions', 'bigint', 'Impressões'),
      col('clicks', 'bigint', 'Cliques'),
    ],
  },
  {
    id: 'company_products',
    name: 'Produtos',
    description: 'Produtos contratados por empresa, status e receita proxy mensal.',
    domain: 'products',
    owner: 'Produtos PJ',
    glueDatabase: 'products',
    table: 'company_products',
    grain: '1 linha por produto contratado',
    sourceSystem: 'Produtos PJ · Cartões PJ · Pix PJ',
    entityTypes: ['companyProduct', 'product'],
    dataProductId: 'product_adoption_revenue',
    columns: [
      col('company_product_id', 'string', 'Identificador do contrato'),
      COMPANY_KEY,
      col('product_name', 'string', 'Produto'),
      col('product_category', 'string', 'Categoria do produto'),
      col('status', 'string', 'Status do contrato'),
      col('contracted_at', 'timestamp', 'Contratação'),
      col('monthly_revenue_proxy', 'double', 'Receita proxy mensal (R$)'),
    ],
  },
  {
    id: 'conversations',
    name: 'Conversas',
    description: 'Conversas de atendimento e comerciais por canal e status.',
    domain: 'customer360',
    owner: 'Atendimento PJ',
    glueDatabase: 'service',
    table: 'conversations',
    grain: '1 linha por conversa',
    sourceSystem: 'WhatsApp · Chat · Telefone',
    entityTypes: ['conversation'],
    dataProductId: 'conversations_service',
    columns: [
      col('conversation_id', 'string', 'Identificador da conversa'),
      COMPANY_KEY,
      col('channel', 'string', 'Canal'),
      col('status', 'string', 'Status'),
      col('started_at', 'timestamp', 'Início'),
      col('resolved_at', 'timestamp', 'Resolução'),
    ],
  },
  {
    id: 'crm_interactions',
    name: 'CRM',
    description: 'Interações comerciais e de relacionamento registradas no CRM Empresas.',
    domain: 'customer360',
    owner: 'Relacionamento PJ',
    glueDatabase: 'relationship',
    table: 'crm_interactions',
    grain: '1 linha por interação',
    sourceSystem: 'CRM Empresas',
    entityTypes: ['crmInteraction'],
    dataProductId: 'crm_relationship',
    columns: [
      col('interaction_id', 'string', 'Identificador da interação'),
      COMPANY_KEY,
      col('interaction_type', 'string', 'Tipo'),
      col('direction', 'string', 'Entrada ou saída'),
      col('outcome', 'string', 'Resultado'),
      col('occurred_at', 'timestamp', 'Data da interação'),
    ],
  },
  {
    id: 'digital_journey',
    name: 'Jornada digital (FullStory)',
    description: 'Sessões e eventos de navegação no site e no app capturados pelo FullStory.',
    domain: 'customer360',
    owner: 'Canais Digitais PJ',
    glueDatabase: 'digital',
    table: 'digital_journey',
    grain: '1 linha por evento digital',
    sourceSystem: 'FullStory',
    entityTypes: ['digitalEvent'],
    dataProductId: 'customer360_profile',
    columns: [
      col('event_id', 'string', 'Identificador do evento FullStory'),
      COMPANY_KEY,
      col('session_id', 'string', 'Sessão FullStory'),
      col('event_type', 'string', 'navigate, click, change, custom'),
      col('event_name', 'string', 'Evento de negócio'),
      col('page_url', 'string', 'Página'),
      col('channel', 'string', 'Web ou app'),
      col('occurred_at', 'timestamp', 'Data do evento'),
    ],
  },
];

export const MESH_DATASET_BY_ID = new Map(MESH_DATASETS.map((dataset) => [dataset.id, dataset]));

const DATASET_BY_ENTITY = new Map<DatasetEntityType, MeshDatasetId>(
  MESH_DATASETS.flatMap((dataset) =>
    dataset.entityTypes.map((entityType) => [entityType, dataset.id] as const),
  ),
);

/** Mesh data product that physically stores an entity type. */
export function datasetForEntity(entityType: DatasetEntityType): MeshDatasetId | undefined {
  return DATASET_BY_ENTITY.get(entityType);
}

/** Datasets a metric reads (ratios read both numerator and denominator datasets). */
export function datasetsForMetric(metricId: string): MeshDatasetId[] {
  const metric = METRIC_DEFINITION_BY_ID.get(metricId);
  if (!metric) {
    return [];
  }

  if (metric.aggregation === 'RATIO') {
    return [
      ...new Set([
        ...datasetsForMetric(metric.numerator),
        ...datasetsForMetric(metric.denominator),
      ]),
    ];
  }

  const dataset = datasetForEntity(metric.baseEntity);
  return dataset ? [dataset] : [];
}

/** Dataset that owns a dimension column. */
export function datasetForDimension(dimensionId: string): MeshDatasetId | undefined {
  const dimension: GovernedDimensionDefinition | undefined =
    DIMENSION_DEFINITION_BY_ID.get(dimensionId);
  return dimension ? datasetForEntity(dimension.baseEntity) : undefined;
}

/** Every dataset needed to answer a combination of metrics, dimensions and filters. */
export function requiredDatasets(input: {
  metricIds: readonly string[];
  dimensionIds: readonly string[];
  filterFields: readonly string[];
}): MeshDatasetId[] {
  const datasets = new Set<MeshDatasetId>();
  input.metricIds.forEach((id) =>
    datasetsForMetric(id).forEach((dataset) => datasets.add(dataset)),
  );
  [...input.dimensionIds, ...input.filterFields].forEach((id) => {
    const dataset = datasetForDimension(id);
    if (dataset) datasets.add(dataset);
  });
  return [...datasets];
}

/**
 * Adds the datasets a spec needs to its selection. Used only by AI-built specs (the assistant
 * states which bases it used); people select datasets explicitly in the playground.
 */
export function withRequiredDatasets<
  T extends {
    datasets?: string[];
    metrics: ReadonlyArray<{ id: string }>;
    dimensions: ReadonlyArray<{ id: string }>;
    filters: ReadonlyArray<{ field: string }>;
  },
>(spec: T): T {
  const needed = requiredDatasets({
    metricIds: spec.metrics.map((metric) => metric.id),
    dimensionIds: spec.dimensions.map((dimension) => dimension.id),
    filterFields: spec.filters.map((filter) => filter.field),
  });
  return { ...spec, datasets: [...new Set([...(spec.datasets ?? []), ...needed])] };
}
