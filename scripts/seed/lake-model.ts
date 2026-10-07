import type { DatasetBundle, DigitalEvent } from '@bfp/domain';
import { MESH_DATASETS, type MeshDatasetDefinition } from '@bfp/semantic-layer';

type Row = Record<string, string | number | boolean | null>;

/** One mesh data product ready to be loaded (silver NDJSON → Gold Parquet). */
export interface LakeTable {
  dataset: MeshDatasetDefinition;
  rows: Row[];
}

/** FullStory-style page names used to label digital journey events. */
const FULLSTORY_PAGES: Record<
  DigitalEvent['eventType'],
  { type: string; name: string; path: string }
> = {
  LOGIN: { type: 'navigate', name: 'Login no Itaú Empresas', path: '/empresas/login' },
  FEATURE_USE: { type: 'click', name: 'Uso de funcionalidade', path: '/empresas/inicio' },
  TRANSACTION: { type: 'custom', name: 'Transação concluída', path: '/empresas/pix' },
  ERROR: { type: 'custom', name: 'Erro exibido', path: '/empresas/erro' },
  DOCUMENT_UPLOAD: {
    type: 'change',
    name: 'Envio de documento',
    path: '/empresas/abertura/documentos',
  },
};

/** Maps a synthetic digital event to the FullStory export shape published in the mesh. */
export function toFullStoryRow(event: DigitalEvent): Row {
  const page = FULLSTORY_PAGES[event.eventType];
  return {
    event_id: event.id,
    company_id: event.companyId,
    session_id: event.sessionId,
    event_type: page.type,
    event_name: page.name,
    page_url: `https://www.itau.com.br${page.path}`,
    channel: event.channel === 'MOBILE' ? 'app' : 'web',
    occurred_at: event.occurredAt,
  };
}

/**
 * Builds the normalized rows of every mesh data product. Company attributes live only in
 * Customer 360; the other products carry company_id and are joined by the engine.
 * Only synthetic, non-PII attributes are exported (no CNPJ, names or free text).
 */
export function buildLakeTables(bundle: DatasetBundle): LakeTable[] {
  const productById = new Map(bundle.products.map((product) => [product.id, product]));
  const campaignById = new Map(bundle.mediaCampaigns.map((campaign) => [campaign.id, campaign]));
  const rowsById: Record<MeshDatasetDefinition['id'], Row[]> = {
    customer_360: bundle.companies.map((company) => ({
      company_id: company.id,
      segment: company.segment,
      industry: company.industry,
      company_size: company.companySize,
      state: company.state,
      region: company.region,
      acquisition_source: company.acquisitionSource,
      acquisition_channel: company.acquisitionChannel,
      acquisition_campaign_id: company.acquisitionCampaignId,
      company_status: company.status,
      lead_created_at: company.leadCreatedAt,
      account_opening_started_at: company.accountOpeningStartedAt,
      account_opened_at: company.accountOpenedAt,
      onboarding_started_at: company.onboardingStartedAt,
      onboarding_completed_at: company.onboardingCompletedAt,
      activation_date: company.activationDate,
      lgpd_consent: company.lgpdConsent,
      created_at: company.createdAt,
    })),
    media_touchpoints: bundle.mediaTouchpoints.map((touchpoint) => ({
      touchpoint_id: touchpoint.id,
      company_id: touchpoint.companyId,
      campaign_id: touchpoint.campaignId,
      channel: touchpoint.channel,
      campaign_objective: touchpoint.campaignId
        ? (campaignById.get(touchpoint.campaignId)?.objective ?? null)
        : null,
      touchpoint_type: touchpoint.touchpointType,
      occurred_at: touchpoint.occurredAt,
      cost: touchpoint.cost,
      impressions: touchpoint.impressions,
      clicks: touchpoint.clicks,
    })),
    company_products: bundle.companyProducts.map((item) => ({
      company_product_id: item.id,
      company_id: item.companyId,
      product_name: productById.get(item.productId)?.name ?? null,
      product_category: productById.get(item.productId)?.category ?? null,
      status: item.status,
      contracted_at: item.contractedAt,
      monthly_revenue_proxy: item.monthlyRevenueProxy,
    })),
    conversations: bundle.conversations.map((conversation) => ({
      conversation_id: conversation.id,
      company_id: conversation.companyId,
      channel: conversation.channel,
      status: conversation.status,
      started_at: conversation.startedAt,
      resolved_at: conversation.resolvedAt,
    })),
    crm_interactions: bundle.crmInteractions.map((interaction) => ({
      interaction_id: interaction.id,
      company_id: interaction.companyId,
      interaction_type: interaction.interactionType,
      direction: interaction.direction,
      outcome: interaction.outcome,
      occurred_at: interaction.occurredAt,
    })),
    digital_journey: bundle.digitalEvents.map(toFullStoryRow),
  };

  return MESH_DATASETS.map((dataset) => ({ dataset, rows: rowsById[dataset.id] }));
}

/** Domain database of a mesh data product. */
export function domainDatabase(prefix: string, dataset: MeshDatasetDefinition) {
  return `${prefix}_${dataset.glueDatabase}`;
}

/** Athena DDL for the silver NDJSON table (timestamps stay ISO strings in silver). */
export function silverDdl(prefix: string, bucket: string, table: LakeTable) {
  const columns = table.dataset.columns.map(
    (column) => `\`${column.name}\` ${column.type === 'timestamp' ? 'string' : column.type}`,
  );
  return `CREATE EXTERNAL TABLE IF NOT EXISTS ${domainDatabase(prefix, table.dataset)}.silver_${table.dataset.table} (${columns.join(', ')}) ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe' LOCATION 's3://${bucket}/silver/${table.dataset.glueDatabase}/${table.dataset.table}/'`;
}

/** Athena CTAS that materializes the Gold Parquet table with typed timestamps and comments. */
export function goldCtas(prefix: string, bucket: string, table: LakeTable) {
  const database = domainDatabase(prefix, table.dataset);
  const select = table.dataset.columns.map((column) =>
    column.type === 'timestamp'
      ? `from_iso8601_timestamp(${column.name}) AS ${column.name}`
      : column.name,
  );
  return `CREATE TABLE ${database}.${table.dataset.table} WITH (format = 'PARQUET', parquet_compression = 'SNAPPY', external_location = 's3://${bucket}/gold/${table.dataset.glueDatabase}/${table.dataset.table}/') AS SELECT ${select.join(', ')} FROM ${database}.silver_${table.dataset.table}`;
}
