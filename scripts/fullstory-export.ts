import { gunzipSync, gzipSync } from 'node:zlib';
import {
  AthenaClient,
  GetQueryExecutionCommand,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { MESH_DATASET_BY_ID } from '@bfp/semantic-layer';

/**
 * Brings FullStory digital-journey events into the AWS data mesh:
 *   FullStory segment export (NDJSON) → s3://<lake>/bronze/fullstory/ → silver digital_journey
 *   → Gold Parquet `<prefix>_digital.digital_journey` (Athena CTAS).
 * Visitors are identified on the site/app with FS.identify(<company_id>).
 *
 * Env: AWS_REGION, DATA_LAKE_BUCKET, MESH_DATABASE_PREFIX, ATHENA_WORKGROUP,
 *      FULLSTORY_SECRET_ID (JSON {"apiKey","segmentId"}) or FULLSTORY_API_KEY + FULLSTORY_SEGMENT_ID,
 *      optional EXPORT_DAYS (default 30).
 */
const API = 'https://api.fullstory.com';

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name}.`);
  return value;
}

async function credentials(region: string) {
  if (process.env.FULLSTORY_API_KEY && process.env.FULLSTORY_SEGMENT_ID) {
    return { apiKey: process.env.FULLSTORY_API_KEY, segmentId: process.env.FULLSTORY_SEGMENT_ID };
  }
  const secret = await new SecretsManagerClient({ region }).send(
    new GetSecretValueCommand({ SecretId: env('FULLSTORY_SECRET_ID') }),
  );
  const parsed = JSON.parse(secret.SecretString ?? '{}') as { apiKey?: string; segmentId?: string };
  if (!parsed.apiKey || !parsed.segmentId) {
    throw new Error('O segredo do FullStory precisa de "apiKey" e "segmentId".');
  }
  return { apiKey: parsed.apiKey, segmentId: parsed.segmentId };
}

async function fullstory<T>(apiKey: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`FullStory respondeu ${response.status} em ${path}.`);
  return (await response.json()) as T;
}

async function athena(client: AthenaClient, sql: string, workgroup: string) {
  const started = await client.send(
    new StartQueryExecutionCommand({ QueryString: sql, WorkGroup: workgroup }),
  );
  for (;;) {
    const execution = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: started.QueryExecutionId }),
    );
    const state = execution.QueryExecution?.Status?.State;
    if (state === 'SUCCEEDED') return;
    if (state === 'FAILED' || state === 'CANCELLED')
      throw new Error(`Athena: ${execution.QueryExecution?.Status?.StateChangeReason}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  const region = env('AWS_REGION');
  const bucket = env('DATA_LAKE_BUCKET');
  const prefix = env('MESH_DATABASE_PREFIX');
  const workgroup = env('ATHENA_WORKGROUP');
  const days = Number(process.env.EXPORT_DAYS ?? 30);
  const { apiKey, segmentId } = await credentials(region);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);

  const { operationId } = await fullstory<{ operationId: string }>(apiKey, '/segments/v1/exports', {
    segmentId,
    type: 'TYPE_EVENT',
    format: 'FORMAT_NDJSON',
    timeRange: { start: start.toISOString(), end: end.toISOString() },
  });

  let location: string | undefined;
  for (let attempt = 0; attempt < 120 && !location; attempt += 1) {
    const operation = await fullstory<{ state?: string; results?: { searchExportId?: string } }>(
      apiKey,
      `/operations/v1/${operationId}`,
    );
    if (operation.state === 'FAILED') throw new Error('A exportação do FullStory falhou.');
    if (operation.state === 'COMPLETED' && operation.results?.searchExportId) {
      location = (
        await fullstory<{ location: string }>(
          apiKey,
          `/search/v1/exports/${operation.results.searchExportId}/results`,
        )
      ).location;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!location) throw new Error('A exportação do FullStory não terminou a tempo.');

  const download = Buffer.from(await (await fetch(location)).arrayBuffer());
  const text = (download[0] === 0x1f ? gunzipSync(download) : download).toString('utf8');
  const raw = text.split('\n').filter(Boolean);
  const rows = raw
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.UserAppKey)
    .map((event, index) => ({
      event_id: String(event.EventId ?? `${event.SessionId ?? 's'}-${index}`),
      company_id: String(event.UserAppKey),
      session_id: String(event.SessionId ?? ''),
      event_type: String(event.EventType ?? 'custom'),
      event_name: String(
        event.EventCustomName ?? event.PageName ?? event.EventTargetText ?? event.EventType ?? '',
      ),
      page_url: String(event.PageUrl ?? ''),
      channel: String(event.PageDevice ?? event.UserAgent ?? '')
        .toLowerCase()
        .includes('mobile')
        ? 'app'
        : 'web',
      occurred_at: new Date(String(event.EventStart)).toISOString(),
    }));

  const s3 = new S3Client({ region });
  const stamp = end.toISOString().slice(0, 10);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `bronze/fullstory/dt=${stamp}/events.json.gz`,
      Body: gzipSync(Buffer.from(raw.join('\n'))),
    }),
  );
  const dataset = MESH_DATASET_BY_ID.get('digital_journey')!;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `silver/${dataset.glueDatabase}/${dataset.table}/fullstory-${stamp}.json.gz`,
      Body: gzipSync(Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n'))),
    }),
  );

  const client = new AthenaClient({ region });
  const database = `${prefix}_${dataset.glueDatabase}`;
  const columns = dataset.columns.map((column) =>
    column.type === 'timestamp'
      ? `CAST(from_iso8601_timestamp(${column.name}) AT TIME ZONE 'UTC' AS timestamp) AS ${column.name}`
      : column.name,
  );
  await athena(client, `DROP TABLE IF EXISTS ${database}.${dataset.table}`, workgroup);
  await athena(
    client,
    `CREATE TABLE ${database}.${dataset.table} WITH (format = 'PARQUET', external_location = 's3://${bucket}/gold/${dataset.glueDatabase}/${dataset.table}/v${Date.now()}/') AS SELECT ${columns.join(', ')} FROM ${database}.silver_${dataset.table}`,
    workgroup,
  );
  console.log(`${rows.length} eventos FullStory publicados em ${database}.${dataset.table}.`);
}

await main();
