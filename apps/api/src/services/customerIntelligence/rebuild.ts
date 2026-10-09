import { gunzipSync } from 'node:zlib';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  buildCustomerProfiles,
  DNA_VERSION,
  NBA_MODEL_VERSION,
  type CustomerRawData,
} from '@bfp/customer-intelligence';
import type { ApiContext } from '@api/http/context';

/** S3 object written by `npm run seed:intelligence` with the raw behavioral data. */
export const INTELLIGENCE_RAW_KEY = 'intelligence/raw/customers.json.gz';

/** Event that makes the rebuild Lambda recompute the read model (EventBridge schedule). */
export interface IntelligenceRebuildEvent {
  bfpTask: 'intelligenceRebuild';
}

export function isIntelligenceRebuildEvent(event: unknown): event is IntelligenceRebuildEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as { bfpTask?: unknown }).bfpTask === 'intelligenceRebuild'
  );
}

/**
 * CloudWatch Embedded Metric Format: the log line becomes a metric in namespace BFP/Intelligence
 * without extra API calls or permissions.
 */
function emitMetrics(metrics: Record<string, number>, dimensions: Record<string, string>) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'BFP/Intelligence',
            Dimensions: [Object.keys(dimensions)],
            Metrics: Object.keys(metrics).map((name) => ({
              Name: name,
              Unit: name.endsWith('Ms') ? 'Milliseconds' : 'Count',
            })),
          },
        ],
      },
      ...dimensions,
      ...metrics,
    }),
  );
}

/**
 * Daily rebuild: raw data (S3) → features → signals → DNA → NBA → DynamoDB read model.
 * Deterministic for the as-of recorded with the raw data.
 */
export async function rebuildIntelligenceReadModel(
  context: ApiContext,
  input: { bucket: string; key?: string },
) {
  const startedAt = performance.now();
  const object = await new S3Client({ region: context.config.awsRegion }).send(
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key ?? INTELLIGENCE_RAW_KEY }),
  );
  const body = Buffer.from(await object.Body!.transformToByteArray());
  const payload = JSON.parse(gunzipSync(body).toString('utf8')) as {
    asOf: string;
    raws: CustomerRawData[];
  };
  const profiles = buildCustomerProfiles(payload.raws, payload.asOf);
  const computedMs = Math.round(performance.now() - startedAt);
  await context.getCustomerIntelligenceRepository().putProfiles(profiles);
  const durationMs = Math.round(performance.now() - startedAt);
  const signals = profiles.reduce((total, profile) => total + profile.signals.length, 0);
  const noAction = profiles.filter(
    (profile) => profile.recommendations[0]?.actionId === 'NO_ACTION',
  ).length;
  const fields = {
    operation: 'INTELLIGENCE_REBUILD',
    asOf: payload.asOf,
    dnaVersion: DNA_VERSION,
    modelVersion: NBA_MODEL_VERSION,
  };
  context.logger.info('DNA_CALCULATED', { ...fields, customers: profiles.length, computedMs });
  context.logger.info('SIGNAL_DETECTED', { ...fields, signals });
  context.logger.info('NBA_GENERATED', {
    ...fields,
    customers: profiles.length,
    noAction,
    durationMs,
  });
  emitMetrics(
    {
      CustomersProcessed: profiles.length,
      SignalsDetected: signals,
      NoActionCustomers: noAction,
      RebuildDurationMs: durationMs,
    },
    { Service: 'customer-intelligence' },
  );
  return { customers: profiles.length, signals, noAction, durationMs };
}
