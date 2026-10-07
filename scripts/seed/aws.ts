import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { DatasetBundle, DatasetEntity, DatasetEntityType } from '@bfp/domain';
import { readDatasetBundle } from './io';

type DatasetEntityRecord = {
  entityType: DatasetEntityType;
  entity: DatasetEntity;
};

type BatchWriteClient = Pick<DynamoDBDocumentClient, 'send'>;

interface SeedItem {
  PK: string;
  SK: string;
  entityType: DatasetEntityType;
  document: DatasetEntity;
  GSI1PK?: string;
  GSI1SK?: string;
}

/** Flattens the DatasetBundle into typed dataset-entity records used by the AWS marshaller. */
export function flattenDatasetBundle(bundle: DatasetBundle): DatasetEntityRecord[] {
  return [
    ...bundle.companies.map((entity) => ({ entityType: 'company' as const, entity })),
    ...bundle.partners.map((entity) => ({ entityType: 'partner' as const, entity })),
    ...bundle.accounts.map((entity) => ({ entityType: 'account' as const, entity })),
    ...bundle.products.map((entity) => ({ entityType: 'product' as const, entity })),
    ...bundle.companyProducts.map((entity) => ({ entityType: 'companyProduct' as const, entity })),
    ...bundle.mediaCampaigns.map((entity) => ({ entityType: 'campaign' as const, entity })),
    ...bundle.mediaTouchpoints.map((entity) => ({ entityType: 'touchpoint' as const, entity })),
    ...bundle.funnelEvents.map((entity) => ({ entityType: 'funnelEvent' as const, entity })),
    ...bundle.crmInteractions.map((entity) => ({ entityType: 'crmInteraction' as const, entity })),
    ...bundle.conversations.map((entity) => ({ entityType: 'conversation' as const, entity })),
    ...bundle.digitalEvents.map((entity) => ({ entityType: 'digitalEvent' as const, entity })),
    ...bundle.appNavigationEvents.map((entity) => ({
      entityType: 'appNavigation' as const,
      entity,
    })),
    ...bundle.transactions.map((entity) => ({ entityType: 'transaction' as const, entity })),
    ...bundle.npsResponses.map((entity) => ({ entityType: 'npsResponse' as const, entity })),
    ...bundle.qualityStatuses.map((entity) => ({ entityType: 'qualityStatus' as const, entity })),
    ...bundle.auditLogs.map((entity) => ({ entityType: 'auditLog' as const, entity })),
  ];
}

/** Marshals one dataset entity into the BatchWriteItem shape expected by the dataset table. */
export function marshallDatasetItem(record: DatasetEntityRecord): SeedItem {
  const item: SeedItem = {
    PK: `ENTITY#${record.entityType}`,
    SK: record.entity.id,
    entityType: record.entityType,
    document: record.entity,
  };
  const companyId = getCompanyId(record);
  const timestamp = getTimestamp(record);

  if (companyId && timestamp) {
    item.GSI1PK = `COMPANY#${companyId}`;
    item.GSI1SK = `${timestamp}#${record.entityType}#${record.entity.id}`;
  }

  return item;
}

/** Builds chunked BatchWriteCommand payloads capped at 25 PutRequests each. */
export function buildBatchWriteInputs(
  bundle: DatasetBundle,
  tableName: string,
): BatchWriteCommandInput[] {
  const requests = flattenDatasetBundle(bundle).map((record) => ({
    PutRequest: {
      Item: marshallDatasetItem(record),
    },
  }));

  const inputs: BatchWriteCommandInput[] = [];
  for (let index = 0; index < requests.length; index += 25) {
    inputs.push({
      RequestItems: {
        [tableName]: requests.slice(index, index + 25),
      },
    });
  }
  return inputs;
}

/** Sends chunked BatchWrite requests with exponential backoff on UnprocessedItems. */
export async function batchWriteDataset(
  client: BatchWriteClient,
  bundle: DatasetBundle,
  tableName: string,
  options: { sleep?: (ms: number) => Promise<void>; maxRetries?: number } = {},
) {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxRetries = options.maxRetries ?? 8;
  const batches = buildBatchWriteInputs(bundle, tableName);

  for (const batch of batches) {
    let pending = batch.RequestItems ?? {};
    let attempt = 0;

    while (Object.keys(pending).length > 0) {
      const response = await client.send(new BatchWriteCommand({ RequestItems: pending }));
      const unprocessed = response.UnprocessedItems ?? {};

      if (Object.keys(unprocessed).length === 0) {
        break;
      }

      attempt += 1;
      if (attempt > maxRetries) {
        throw new Error(
          `BatchWriteItem exceeded retry limit (${maxRetries}) with unprocessed items remaining.`,
        );
      }

      await sleep(2 ** attempt * 50);
      pending = unprocessed;
    }
  }
}

async function main() {
  const tableName = process.env.DATASET_TABLE;
  if (!tableName) {
    throw new Error('DATASET_TABLE is required.');
  }

  const region = process.env.AWS_REGION ?? 'sa-east-1';
  const bundle = await readDatasetBundle();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  await batchWriteDataset(client, bundle, tableName);
  console.log(`Wrote dataset bundle to DynamoDB table ${tableName}.`);
}

function getCompanyId(record: DatasetEntityRecord) {
  const entity = record.entity;

  switch (record.entityType) {
    case 'company':
      return entity.id;
    case 'partner':
    case 'account':
    case 'companyProduct':
    case 'touchpoint':
    case 'funnelEvent':
    case 'crmInteraction':
    case 'conversation':
    case 'digitalEvent':
    case 'appNavigation':
    case 'transaction':
    case 'npsResponse':
      return 'companyId' in entity ? entity.companyId : undefined;
    case 'qualityStatus':
    case 'auditLog':
      return 'companyId' in entity ? (entity.companyId ?? undefined) : undefined;
    default:
      return undefined;
  }
}

function getTimestamp(record: DatasetEntityRecord) {
  const entity = record.entity;

  switch (record.entityType) {
    case 'company':
      return 'createdAt' in entity ? entity.createdAt : undefined;
    case 'partner':
      return 'joinedAt' in entity ? entity.joinedAt : undefined;
    case 'account':
      return 'openedAt' in entity ? entity.openedAt : undefined;
    case 'companyProduct':
      return 'contractedAt' in entity ? entity.contractedAt : undefined;
    case 'touchpoint':
    case 'funnelEvent':
    case 'crmInteraction':
    case 'digitalEvent':
    case 'appNavigation':
    case 'transaction':
      return 'occurredAt' in entity ? entity.occurredAt : undefined;
    case 'npsResponse':
      return 'respondedAt' in entity ? entity.respondedAt : undefined;
    case 'conversation':
      return 'startedAt' in entity ? entity.startedAt : undefined;
    case 'qualityStatus':
      return 'checkedAt' in entity ? entity.checkedAt : undefined;
    case 'auditLog':
      return 'timestamp' in entity ? entity.timestamp : undefined;
    default:
      return undefined;
  }
}

if (process.argv[1]?.endsWith('aws.ts')) {
  await main();
}
