import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ObjectType } from '@bfp/domain';
import type { DynamoDocumentClientLike, ObjectRepository, PersistedObject } from './types';

function extractPersistedObject<TValue>(item: Record<string, unknown>): PersistedObject<TValue> {
  return {
    userId: String(item.userId),
    type: String(item.type) as ObjectType,
    id: String(item.id),
    value: item.value as TValue,
    shared: item.shared === true,
  };
}

/** DynamoDB implementation of the user objects repository. */
export class DynamoObjectRepository implements ObjectRepository {
  constructor(
    private readonly client: DynamoDocumentClientLike,
    private readonly tableName: string,
  ) {}

  async get<TValue>(userId: string, type: ObjectType, id: string) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND #sk = :sk',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': `${type}#${id}`,
        },
        Limit: 1,
      }),
    );

    const item = response.Items?.[0];
    return item ? extractPersistedObject<TValue>(item) : undefined;
  }

  async put<TValue>(object: PersistedObject<TValue>) {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${object.userId}`,
          SK: `${object.type}#${object.id}`,
          GSI1PK: `ID#${object.id}`,
          GSI1SK: `USER#${object.userId}`,
          ...(object.shared
            ? { GSI2PK: `SHARED#${object.type}`, GSI2SK: `USER#${object.userId}#${object.id}` }
            : {}),
          userId: object.userId,
          type: object.type,
          id: object.id,
          value: object.value,
          shared: object.shared === true,
        },
      }),
    );
  }

  async delete(userId: string, type: ObjectType, id: string) {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `${type}#${id}`,
        },
      }),
    );
  }

  async listByType<TValue>(userId: string, type: ObjectType) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':skPrefix': `${type}#`,
        },
      }),
    );

    return (response.Items ?? []).map((item) => extractPersistedObject<TValue>(item));
  }

  async findById<TValue>(id: string) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: '#gsi1pk = :gsi1pk',
        ExpressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
        },
        ExpressionAttributeValues: {
          ':gsi1pk': `ID#${id}`,
        },
      }),
    );

    return (response.Items ?? []).map((item) => extractPersistedObject<TValue>(item));
  }

  async listShared<TValue>(type: ObjectType) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: '#gsi2pk = :gsi2pk',
        ExpressionAttributeNames: {
          '#gsi2pk': 'GSI2PK',
        },
        ExpressionAttributeValues: {
          ':gsi2pk': `SHARED#${type}`,
        },
      }),
    );

    return (response.Items ?? []).map((item) => extractPersistedObject<TValue>(item));
  }
}
