import { AthenaClient } from '@aws-sdk/client-athena';
import { GlueClient } from '@aws-sdk/client-glue';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { readDatasetBundle } from './io';
import { buildLakeTables } from './lake-model';
import { emptyPrefix, ndjson, publishLakeTable } from './lake-publish';

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

  const target = { s3, athena, glue, bucket, prefix, workgroup };
  for (const table of buildLakeTables(bundle)) {
    await publishLakeTable(target, table);
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
