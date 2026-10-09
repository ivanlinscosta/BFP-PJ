import { buildMeshRows, type MeshRow } from '@bfp/analytics-engine';
import { MESH_DATASET_BY_ID, type MeshColumn, type MeshDatasetId } from '@bfp/semantic-layer';
import type { AuthenticatedUser } from '@api/auth/types';
import { ApiError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';

/** Rows shown by the catalog preview (a sample, never an export). */
export const PREVIEW_MAX_ROWS = 100;

export interface MeshDatasetPreview {
  dataset: MeshDatasetId;
  table: string;
  columns: MeshColumn[];
  rows: MeshRow[];
  limit: number;
  source: 'athena' | 'local';
}

function typed(value: string, column: MeshColumn): MeshRow[string] {
  if (value === '') return null;
  if (column.type === 'double' || column.type === 'bigint') {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (column.type === 'boolean') return value === 'true';
  return value;
}

/**
 * First rows of a mesh data product: Athena over the gold table in the cloud, the same row
 * builders used by the lake load in local development. Only the governed (non-PII) columns.
 */
export async function previewMeshDataset(
  context: ApiContext,
  user: AuthenticatedUser,
  datasetId: MeshDatasetId,
  requestedLimit = PREVIEW_MAX_ROWS,
): Promise<MeshDatasetPreview> {
  const definition = MESH_DATASET_BY_ID.get(datasetId);
  if (!definition) throw new ApiError(404, 'not_found', 'Base de dados não encontrada.');
  const limit = Math.max(1, Math.min(PREVIEW_MAX_ROWS, Math.floor(requestedLimit)));
  const columns = [...definition.columns];
  const engine = context.getAnalyticsEngine(user);
  const table = `${context.config.mesh.databasePrefix}_${definition.glueDatabase}.${definition.table}`;

  if (engine.previewTable) {
    const raw = await engine.previewTable(
      datasetId,
      columns.map((column) => column.name),
      limit,
    );
    const rows = raw.map((cells) =>
      Object.fromEntries(
        columns.map((column, index) => [column.name, typed(cells[index] ?? '', column)]),
      ),
    );
    return { dataset: datasetId, table, columns, rows, limit, source: 'athena' };
  }

  const bundle = context.getDatasetBundle();
  if (!bundle) {
    throw new ApiError(
      409,
      'preview_unavailable',
      'A prévia dos dados está disponível com o motor Athena ou no ambiente local.',
    );
  }
  const rows = buildMeshRows(bundle, datasetId).slice(0, limit);
  return { dataset: datasetId, table, columns, rows, limit, source: 'local' };
}
