import { DataZoneClient, SearchListingsCommand } from '@aws-sdk/client-datazone';
import { GetTablesCommand, GlueClient } from '@aws-sdk/client-glue';
import { GetResourceLFTagsCommand, LakeFormationClient } from '@aws-sdk/client-lakeformation';
import type { BusinessDomain } from '@bfp/domain';
import { MESH_DATASETS, type MeshDatasetDefinition } from '@bfp/semantic-layer';
import type { ApiContext } from '@api/http/context';
import {
  AtlanClient,
  resolveAtlanConnection,
  type AtlanAssetMetadata,
} from '@api/services/integrations/atlan';

/** Data product of the mesh as shown to the user when choosing the analysis bases. */
export interface MeshDatasetView {
  id: string;
  name: string;
  description: string;
  domain: BusinessDomain;
  owner: string;
  grain: string;
  sourceSystem: string;
  joinKey: string;
  /** Business data product (catalog) the table belongs to. */
  dataProductId: string;
  location: { catalog: 'local' | 'glue'; database: string; table: string };
  columns: Array<{ name: string; type: string; description: string }>;
  tags: Record<string, string>;
  available: boolean;
  datazone?: { listingId: string; name: string };
  atlan?: AtlanAssetMetadata;
}

/** Mesh catalog with the sources that answered (for the integrations status panel). */
export interface MeshCatalog {
  source: 'local' | 'glue';
  datazone: 'disabled' | 'ok' | 'error';
  atlan: 'not_configured' | 'ok' | 'error';
  datasets: MeshDatasetView[];
}

const TTL_MS = 5 * 60 * 1000;
let cached: { key: string; expiresAt: number; catalog: MeshCatalog } | undefined;

function localView(dataset: MeshDatasetDefinition, prefix: string): MeshDatasetView {
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    domain: dataset.domain,
    owner: dataset.owner,
    grain: dataset.grain,
    sourceSystem: dataset.sourceSystem,
    joinKey: 'company_id',
    dataProductId: dataset.dataProductId,
    location: {
      catalog: 'local',
      database: `${prefix}_${dataset.glueDatabase}`,
      table: dataset.table,
    },
    columns: dataset.columns.map((column) => ({ ...column })),
    tags: { domain: dataset.domain, owner: dataset.owner, classification: 'synthetic' },
    available: true,
  };
}

/** Reads the published tables of every domain database from Glue and their LF-tags. */
async function readGlue(context: ApiContext): Promise<MeshDatasetView[]> {
  const { awsRegion, mesh } = context.config;
  const glue = new GlueClient({ region: awsRegion });
  const lakeFormation = new LakeFormationClient({ region: awsRegion });

  return Promise.all(
    MESH_DATASETS.map(async (dataset) => {
      const view = localView(dataset, mesh.databasePrefix);
      const database = view.location.database;
      const tables = await glue
        .send(new GetTablesCommand({ DatabaseName: database, Expression: dataset.table }))
        .then((response) => response.TableList ?? [])
        .catch(() => []);
      const table = tables.find((candidate) => candidate.Name === dataset.table);
      if (!table) {
        return {
          ...view,
          location: { ...view.location, catalog: 'glue' as const },
          available: false,
        };
      }

      const parameters = table.Parameters ?? {};
      const lfTags = await lakeFormation
        .send(
          new GetResourceLFTagsCommand({
            Resource: { Table: { DatabaseName: database, Name: dataset.table } },
            ShowAssignedLFTags: true,
          }),
        )
        .then((response) =>
          Object.fromEntries(
            [...(response.LFTagOnDatabase ?? []), ...(response.LFTagsOnTable ?? [])].map((tag) => [
              tag.TagKey ?? '',
              (tag.TagValues ?? []).join(', '),
            ]),
          ),
        )
        .catch(() => ({}));

      return {
        ...view,
        description: table.Description ?? view.description,
        owner: parameters['bfp:owner'] ?? view.owner,
        grain: parameters['bfp:grain'] ?? view.grain,
        sourceSystem: parameters['bfp:source_system'] ?? view.sourceSystem,
        location: { catalog: 'glue' as const, database, table: dataset.table },
        columns: (table.StorageDescriptor?.Columns ?? []).map((column) => ({
          name: column.Name ?? '',
          type: column.Type ?? '',
          description: column.Comment ?? '',
        })),
        tags: { ...view.tags, ...lfTags },
        available: true,
      };
    }),
  );
}

/** Links mesh tables to Amazon DataZone listings when a domain is configured. */
async function attachDataZone(context: ApiContext, datasets: MeshDatasetView[]) {
  const domainId = context.config.mesh.datazoneDomainId;
  if (!domainId) {
    return 'disabled' as const;
  }

  try {
    const client = new DataZoneClient({ region: context.config.awsRegion });
    const response = await client.send(
      new SearchListingsCommand({ domainIdentifier: domainId, maxResults: 50 }),
    );
    for (const item of response.items ?? []) {
      const listing = item.assetListing;
      const match = datasets.find((dataset) => listing?.name === dataset.location.table);
      if (match && listing?.listingId) {
        match.datazone = { listingId: listing.listingId, name: listing.name ?? match.name };
      }
    }
    return 'ok' as const;
  } catch {
    return 'error' as const;
  }
}

/** Enriches mesh tables with Atlan certification, owners, description and terms. */
async function attachAtlan(context: ApiContext, datasets: MeshDatasetView[]) {
  try {
    const connection = await resolveAtlanConnection(context.config);
    if (!connection) {
      return 'not_configured' as const;
    }

    const assets = await new AtlanClient(connection).findByNames(
      'Table',
      datasets.map((dataset) => dataset.location.table),
    );
    for (const dataset of datasets) {
      const asset = assets.find(
        (candidate) =>
          candidate.name === dataset.location.table &&
          (!candidate.qualifiedName || candidate.qualifiedName.includes(dataset.location.database)),
      );
      if (asset) {
        dataset.atlan = asset;
      }
    }
    return 'ok' as const;
  } catch {
    return 'error' as const;
  }
}

/**
 * Data mesh catalog: Glue Data Catalog + Lake Formation tags in AWS (local definitions in
 * development), optionally linked to DataZone listings and enriched by Atlan, the official
 * Itaú data catalog.
 */
export async function getMeshCatalog(context: ApiContext, options: { refresh?: boolean } = {}) {
  const { mesh } = context.config;
  const key = `${mesh.catalog}|${mesh.databasePrefix}`;
  if (!options.refresh && cached && cached.key === key && cached.expiresAt > Date.now()) {
    return cached.catalog;
  }

  const datasets =
    mesh.catalog === 'glue'
      ? await readGlue(context)
      : MESH_DATASETS.map((dataset) => localView(dataset, mesh.databasePrefix));
  const [datazone, atlan] = await Promise.all([
    attachDataZone(context, datasets),
    attachAtlan(context, datasets),
  ]);

  const catalog: MeshCatalog = { source: mesh.catalog, datazone, atlan, datasets };
  cached = { key, expiresAt: Date.now() + TTL_MS, catalog };
  return catalog;
}
