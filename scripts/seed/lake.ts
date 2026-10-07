import { gzipSync } from 'node:zlib';
import {
  AthenaClient,
  GetQueryExecutionCommand,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { GetTableCommand, GlueClient, UpdateTableCommand } from '@aws-sdk/client-glue';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { readDatasetBundle } from './io';
import { buildLakeTables, domainDatabase, goldCtas, silverDdl, type LakeTable } from './lake-model';

/**
 * Publishes the synthetic data products into the AWS data mesh:
 *   bronze/<source>/                    raw NDJSON (gzip, sem CNPJ/nomes/texto livre)
 *   silver/<domain>/<table>/            normalized NDJSON (Athena JSON tables)
 *   gold/<domain>/<table>/              Parquet via Athena CTAS, one Glue database per domain
 * Glue tables are documented (description, owner, domain) and the load time is written to SSM.
 *
 * Required env: AWS_REGION, DATA_LAKE_BUCKET, MESH_DATABASE_PREFIX, ATHENA_WORKGROUP.
 * Optional: DATA_LOADED_AT_PARAMETER (SSM parameter name).
 */
function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Defina a variável de ambiente ${name}.`);
  }
  return value;
}

/** Drops identifying/free-text fields before data leaves the application boundary. */
function omit<T extends object>(value: T, keys: Array<keyof T>) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key as keyof T)),
  );
}

function ndjson(rows: unknown[]) {
  return gzipSync(Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n')));
}

async function emptyPrefix(s3: S3Client, bucket: string, prefix: string) {
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

async function runAthena(athena: AthenaClient, sql: string, workgroup: string) {
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
async function documentTable(glue: GlueClient, database: string, table: LakeTable) {
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

async function main() {
  const region = requireEnv('AWS_REGION');
  const bucket = requireEnv('DATA_LAKE_BUCKET');
  const prefix = requireEnv('MESH_DATABASE_PREFIX');
  const workgroup = requireEnv('ATHENA_WORKGROUP');
  const s3 = new S3Client({ region });
  const athena = new AthenaClient({ region });
  const glue = new GlueClient({ region });
  const bundle = await readDatasetBundle();

  const bronze: Array<[string, unknown[]]> = [
    [
      'companies',
      bundle.companies.map((company) => omit(company, ['cnpjMasked', 'legalName', 'tradeName'])),
    ],
    ['media', bundle.mediaTouchpoints],
    ['crm', bundle.crmInteractions],
    ['onboarding', bundle.funnelEvents],
    ['products', bundle.companyProducts],
    ['conversations', bundle.conversations.map((conversation) => omit(conversation, ['subject']))],
  ];
  for (const [name, rows] of bronze) {
    await emptyPrefix(s3, bucket, `bronze/${name}/`);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `bronze/${name}/part-00000.json.gz`,
        Body: ndjson(rows),
      }),
    );
    console.log(`bronze/${name}: ${rows.length} registros`);
  }

  for (const table of buildLakeTables(bundle)) {
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

  const parameter = process.env.DATA_LOADED_AT_PARAMETER;
  if (parameter) {
    await new SSMClient({ region }).send(
      new PutParameterCommand({
        Name: parameter,
        Value: new Date().toISOString(),
        Type: 'String',
        Overwrite: true,
      }),
    );
    console.log(`Horário de carga registrado em ${parameter}.`);
  }
}

await main();
