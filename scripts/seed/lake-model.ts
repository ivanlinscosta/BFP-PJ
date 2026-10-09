import { buildMeshRows, type MeshRow } from '@bfp/analytics-engine';
import type { DatasetBundle } from '@bfp/domain';
import { MESH_DATASETS, type MeshDatasetDefinition } from '@bfp/semantic-layer';

export type Row = MeshRow;

/** Physical table description accepted by the loader (mesh data products and auxiliary gold tables). */
export type LakeDatasetDefinition = Omit<MeshDatasetDefinition, 'id' | 'entityTypes'> & {
  id: string;
};

/** One table ready to be loaded (silver NDJSON → Gold Parquet). */
export interface LakeTable<TDataset extends LakeDatasetDefinition = MeshDatasetDefinition> {
  dataset: TDataset;
  rows: Row[];
}

/**
 * Builds the normalized rows of every mesh data product. Company attributes live only in
 * Customer 360; the other products carry company_id and are joined by the engine.
 * Only synthetic, non-PII attributes are exported (no CNPJ, names or free text).
 */
export function buildLakeTables(bundle: DatasetBundle): LakeTable[] {
  return MESH_DATASETS.map((dataset) => ({ dataset, rows: buildMeshRows(bundle, dataset.id) }));
}

/** Domain database of a mesh data product. */
export function domainDatabase(
  prefix: string,
  dataset: Pick<LakeDatasetDefinition, 'glueDatabase'>,
) {
  return `${prefix}_${dataset.glueDatabase}`;
}

/** Athena DDL for the silver NDJSON table (timestamps stay ISO strings in silver). */
export function silverDdl(prefix: string, bucket: string, table: LakeTable<LakeDatasetDefinition>) {
  const columns = table.dataset.columns.map(
    (column) => `\`${column.name}\` ${column.type === 'timestamp' ? 'string' : column.type}`,
  );
  return `CREATE EXTERNAL TABLE IF NOT EXISTS ${domainDatabase(prefix, table.dataset)}.silver_${table.dataset.table} (${columns.join(', ')}) ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe' LOCATION 's3://${bucket}/silver/${table.dataset.glueDatabase}/${table.dataset.table}/'`;
}

/** Athena CTAS that materializes the Gold Parquet table with typed timestamps and comments. */
export function goldCtas(prefix: string, bucket: string, table: LakeTable<LakeDatasetDefinition>) {
  const database = domainDatabase(prefix, table.dataset);
  const select = table.dataset.columns.map((column) =>
    column.type === 'timestamp'
      ? `CAST(from_iso8601_timestamp(${column.name}) AT TIME ZONE 'UTC' AS timestamp) AS ${column.name}`
      : column.name,
  );
  return `CREATE TABLE ${database}.${table.dataset.table} WITH (format = 'PARQUET', parquet_compression = 'SNAPPY', external_location = 's3://${bucket}/gold/${table.dataset.glueDatabase}/${table.dataset.table}/') AS SELECT ${select.join(', ')} FROM ${database}.silver_${table.dataset.table}`;
}
