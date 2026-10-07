import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '@api/common/config';
import { DynamoDatasetRepository } from './dynamoDatasetRepository';
import { DynamoObjectRepository } from './dynamoObjectRepository';
import { createEmptyDatasetBundle, InMemoryDatasetRepository } from './inMemoryDatasetRepository';
import { InMemoryObjectRepository } from './inMemoryObjectRepository';
import type { RepositoryFactoryOptions, RepositorySet } from './types';

function shouldUseDynamo(env: NodeJS.ProcessEnv) {
  return Boolean(
    (env.DATASET_TABLE ?? env.DYNAMODB_TABLE_DATASET) &&
    (env.OBJECTS_TABLE ?? env.DYNAMODB_TABLE_OBJECTS),
  );
}

/** Creates the repository set for the current runtime without a DI framework. */
/** Optional fields (e.g. a turn without action) are omitted instead of rejected by DynamoDB. */
export const DOCUMENT_CLIENT_OPTIONS = {
  marshallOptions: { removeUndefinedValues: true },
} as const;

export function createRepositories(options: RepositoryFactoryOptions = {}): RepositorySet {
  const env = options.env ?? process.env;
  const config = options.config ?? loadConfig(env);

  if (!shouldUseDynamo(env)) {
    return {
      datasetRepository: new InMemoryDatasetRepository(
        options.datasetBundle ?? createEmptyDatasetBundle(),
      ),
      objectRepository: new InMemoryObjectRepository(),
    };
  }

  const baseClient = new DynamoDBClient({ region: config.awsRegion });
  const datasetClient =
    options.datasetClient ?? DynamoDBDocumentClient.from(baseClient, DOCUMENT_CLIENT_OPTIONS);
  const objectClient =
    options.objectClient ?? DynamoDBDocumentClient.from(baseClient, DOCUMENT_CLIENT_OPTIONS);

  return {
    datasetRepository: new DynamoDatasetRepository(datasetClient, config.dynamoDatasetTable),
    objectRepository: new DynamoObjectRepository(objectClient, config.dynamoObjectsTable),
  };
}
