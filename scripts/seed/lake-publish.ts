import { gzipSync } from 'node:zlib';
import {
  GetQueryExecutionCommand,
  StartQueryExecutionCommand,
  type AthenaClient,
} from '@aws-sdk/client-athena';
import { GetTableCommand, UpdateTableCommand, type GlueClient } from '@aws-sdk/client-glue';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  domainDatabase,
  goldCtas,
  silverDdl,
  type LakeDatasetDefinition,
  type LakeTable,
} from './lake-model';

export function ndjson(rows: unknown[]) {
  return gzipSync(Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n')));
}

export async function emptyPrefix(s3: S3Client, bucket: string, prefix: string) {
  let token: string | undefined;
  do {
    const listing = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (listing.Contents ?? []).map((object) => ({ Key: object.Key! }));
    if (keys.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
    }
    token = listing.NextContinuationToken;
  } while (token);
}

export async function runAthena(athena: AthenaClient, sql: string, workgroup: string) {
  const started = await athena.send(
    new StartQueryExecutionCommand({ QueryString: sql, WorkGroup: workgroup }),
  );
  for (;;) {
    const execution = await athena.send(
      new GetQueryExecutionCommand({ QueryExecutionId: started.QueryExecutionId }),
    );
    const state = execution.QueryExecution?.Status?.State;
    if (state === 'SUCCEEDED') return;
    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(
        `Athena falhou: ${execution.QueryExecution?.Status?.StateChangeReason ?? state}\n${sql}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Documents the Gold table in the Glue Data Catalog (what the BFP mesh catalog reads). */
export async function documentTable(
  glue: GlueClient,
  database: string,
  table: LakeTable<LakeDatasetDefinition>,
) {
  const current = await glue.send(
    new GetTableCommand({ DatabaseName: database, Name: table.dataset.table }),
  );
  const input = current.Table!;
  const comments = new Map(
    table.dataset.columns.map((column) => [column.name, column.description]),
  );
  await glue.send(
    new UpdateTableCommand({
      DatabaseName: database,
      TableInput: {
        Name: input.Name!,
        Description: table.dataset.description,
        TableType: input.TableType,
        Parameters: {
          ...input.Parameters,
          'bfp:dataset_id': table.dataset.id,
          'bfp:data_product': table.dataset.dataProductId,
          'bfp:domain': table.dataset.domain,
          'bfp:owner': table.dataset.owner,
          'bfp:grain': table.dataset.grain,
          'bfp:source_system': table.dataset.sourceSystem,
          'bfp:join_key': 'company_id',
          'bfp:classification': 'synthetic',
        },
        StorageDescriptor: {
          ...input.StorageDescriptor,
          Columns: input.StorageDescriptor?.Columns?.map((column) => ({
            ...column,
            Comment: comments.get(column.Name ?? '') ?? column.Comment,
          })),
        },
        PartitionKeys: input.PartitionKeys,
      },
    }),
  );
}

/** Clients and settings shared by every table load. */
export interface LakeTarget {
  s3: S3Client;
  athena: AthenaClient;
  glue: GlueClient;
  bucket: string;
  prefix: string;
  workgroup: string;
}

/** silver NDJSON → Athena JSON table → Gold Parquet (CTAS) → documented Glue table. */
export async function publishLakeTable(
  target: LakeTarget,
  table: LakeTable<LakeDatasetDefinition>,
) {
  const { s3, athena, glue, bucket, prefix, workgroup } = target;
  const database = domainDatabase(prefix, table.dataset);
  const silverPrefix = `silver/${table.dataset.glueDatabase}/${table.dataset.table}/`;
  await emptyPrefix(s3, bucket, silverPrefix);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${silverPrefix}part-00000.json.gz`,
      Body: ndjson(table.rows),
    }),
  );
  await runAthena(athena, silverDdl(prefix, bucket, table), workgroup);
  await runAthena(athena, `DROP TABLE IF EXISTS ${database}.${table.dataset.table}`, workgroup);
  await emptyPrefix(s3, bucket, `gold/${table.dataset.glueDatabase}/${table.dataset.table}/`);
  await runAthena(athena, goldCtas(prefix, bucket, table), workgroup);
  await documentTable(glue, database, table);
  console.log(`${database}.${table.dataset.table}: ${table.rows.length} linhas (Parquet)`);
}
