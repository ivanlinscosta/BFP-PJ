import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DatasetEntity, DatasetEntityType } from '@bfp/domain';
import type { CompanyQueryOptions, DatasetRepository, DynamoDocumentClientLike } from './types';

const DATASET_TABLE_INDEX = 'GSI1';

function extractDocument<TEntity extends DatasetEntity>(item: Record<string, unknown>): TEntity {
  const document = item.document;
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    return document as TEntity;
  }

  return item as TEntity;
}

function buildEntityTypeFilter(entityTypes: DatasetEntityType[]) {
  const names: Record<string, string> = { '#entityType': 'entityType' };
  const values: Record<string, string> = {};
  const placeholders = entityTypes.map((entityType, index) => {
    const key = `:entityType${index}`;
    values[key] = entityType;
    return key;
  });

  return {
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    FilterExpression: `#entityType IN (${placeholders.join(', ')})`,
  };
}

function getCompanyId(entityType: DatasetEntityType, entity: DatasetEntity) {
  switch (entityType) {
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
    case 'customerIntelligence':
      return 'companyId' in entity ? entity.companyId : null;
    case 'qualityStatus':
    case 'auditLog':
      return 'companyId' in entity ? (entity.companyId ?? null) : null;
    default:
      return null;
  }
}

function getEntityTimestamp(entityType: DatasetEntityType, entity: DatasetEntity) {
  switch (entityType) {
    case 'company':
      return 'createdAt' in entity ? entity.createdAt : '';
    case 'partner':
      return 'joinedAt' in entity ? entity.joinedAt : '';
    case 'account':
      return 'openedAt' in entity ? entity.openedAt : '';
    case 'product':
      return 'createdAt' in entity ? entity.createdAt : '';
    case 'companyProduct':
      return 'contractedAt' in entity ? entity.contractedAt : '';
    case 'campaign':
      return 'createdAt' in entity ? entity.createdAt : '';
    case 'touchpoint':
    case 'funnelEvent':
    case 'crmInteraction':
    case 'digitalEvent':
    case 'appNavigation':
    case 'transaction':
      return 'occurredAt' in entity ? entity.occurredAt : '';
    case 'npsResponse':
      return 'respondedAt' in entity ? entity.respondedAt : '';
    case 'customerIntelligence':
      return 'calculatedAt' in entity ? entity.calculatedAt : '';
    case 'conversation':
      return 'startedAt' in entity ? entity.startedAt : '';
    case 'qualityStatus':
      return 'checkedAt' in entity ? entity.checkedAt : '';
    case 'auditLog':
      return 'timestamp' in entity ? entity.timestamp : '';
  }
}

/** DynamoDB implementation of the immutable dataset repository. */
export class DynamoDatasetRepository implements DatasetRepository {
  constructor(
    private readonly client: DynamoDocumentClientLike,
    private readonly tableName: string,
  ) {}

  async getById<TEntity extends DatasetEntity>(entityType: DatasetEntityType, id: string) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND #sk = :sk',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': `ENTITY#${entityType}`,
          ':sk': id,
        },
        Limit: 1,
      }),
    );

    const item = response.Items?.[0];
    return item ? extractDocument<TEntity>(item) : undefined;
  }

  async listByType<TEntity extends DatasetEntity>(entityType: DatasetEntityType) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: {
          '#pk': 'PK',
        },
        ExpressionAttributeValues: {
          ':pk': `ENTITY#${entityType}`,
        },
      }),
    );

    return (response.Items ?? []).map((item) => extractDocument<TEntity>(item));
  }

  async put<TEntity extends DatasetEntity>(entityType: DatasetEntityType, entity: TEntity) {
    const companyId = getCompanyId(entityType, entity);
    const timestamp = getEntityTimestamp(entityType, entity);

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `ENTITY#${entityType}`,
          SK: entity.id,
          entityType,
          document: entity,
          ...(companyId
            ? {
                GSI1PK: `COMPANY#${companyId}`,
                GSI1SK: `${timestamp}#${entityType}#${entity.id}`,
              }
            : {}),
        },
      }),
    );
  }

  async listByCompany<TEntity extends DatasetEntity>(
    companyId: string,
    options: CompanyQueryOptions = {},
  ) {
    const expressionAttributeNames: Record<string, string> = {
      '#gsi1pk': 'GSI1PK',
    };
    const expressionAttributeValues: Record<string, string | number> = {
      ':gsi1pk': `COMPANY#${companyId}`,
    };
    let keyConditionExpression = '#gsi1pk = :gsi1pk';

    if (options.from && options.to) {
      keyConditionExpression += ' AND #gsi1sk BETWEEN :from AND :to';
      expressionAttributeValues[':from'] = `${options.from}#`;
      expressionAttributeValues[':to'] = `${options.to}~`;
    } else if (options.from) {
      keyConditionExpression += ' AND #gsi1sk >= :from';
      expressionAttributeValues[':from'] = `${options.from}#`;
    } else if (options.to) {
      keyConditionExpression += ' AND #gsi1sk <= :to';
      expressionAttributeValues[':to'] = `${options.to}~`;
    }
    // DynamoDB rejects attribute names that the expressions do not use.
    if (options.from || options.to) {
      expressionAttributeNames['#gsi1sk'] = 'GSI1SK';
    }

    let filterExpression: string | undefined;
    if (options.entityTypes && options.entityTypes.length > 0) {
      const entityTypeFilter = buildEntityTypeFilter(options.entityTypes);
      filterExpression = entityTypeFilter.FilterExpression;
      Object.assign(expressionAttributeNames, entityTypeFilter.ExpressionAttributeNames);
      Object.assign(expressionAttributeValues, entityTypeFilter.ExpressionAttributeValues);
    }

    // A company partition can exceed one 1 MB page: follow LastEvaluatedKey up to the limit.
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: DATASET_TABLE_INDEX,
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          FilterExpression: filterExpression,
          Limit: options.limit,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...(response.Items ?? []));
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey && (!options.limit || items.length < options.limit));

    return items
      .slice(0, options.limit ?? items.length)
      .map((item) => extractDocument<TEntity>(item));
  }
}
