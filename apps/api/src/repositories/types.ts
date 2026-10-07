import type { AppConfig } from '@api/common/config';
import type { DatasetBundle, DatasetEntity, DatasetEntityType, ObjectType } from '@bfp/domain';

/** Options used to query a company-scoped dataset timeline. */
export interface CompanyQueryOptions {
  entityTypes?: DatasetEntityType[];
  from?: string;
  to?: string;
  limit?: number;
}

/** Repository contract for immutable dataset entities. */
export interface DatasetRepository {
  getById<TEntity extends DatasetEntity>(
    entityType: DatasetEntityType,
    id: string,
  ): Promise<TEntity | undefined>;
  listByType<TEntity extends DatasetEntity>(entityType: DatasetEntityType): Promise<TEntity[]>;
  put<TEntity extends DatasetEntity>(entityType: DatasetEntityType, entity: TEntity): Promise<void>;
  listByCompany<TEntity extends DatasetEntity>(
    companyId: string,
    options?: CompanyQueryOptions,
  ): Promise<TEntity[]>;
}

/** User-scoped object persisted in the objects table. */
export interface PersistedObject<TValue> {
  userId: string;
  type: ObjectType;
  id: string;
  value: TValue;
  /** Indexes the object for other users (TEAM / READ_ONLY sharing). */
  shared?: boolean;
}

/** Repository contract for user-owned saved objects. */
export interface ObjectRepository {
  get<TValue>(
    userId: string,
    type: ObjectType,
    id: string,
  ): Promise<PersistedObject<TValue> | undefined>;
  put<TValue>(object: PersistedObject<TValue>): Promise<void>;
  delete(userId: string, type: ObjectType, id: string): Promise<void>;
  listByType<TValue>(userId: string, type: ObjectType): Promise<Array<PersistedObject<TValue>>>;
  findById<TValue>(id: string): Promise<Array<PersistedObject<TValue>>>;
  listShared<TValue>(type: ObjectType): Promise<Array<PersistedObject<TValue>>>;
}

/** Common repository pair returned by the repository factory. */
export interface RepositorySet {
  datasetRepository: DatasetRepository;
  objectRepository: ObjectRepository;
}

/** Inputs accepted by the repository factory. */
export interface RepositoryFactoryOptions {
  config?: AppConfig;
  env?: NodeJS.ProcessEnv;
  datasetBundle?: DatasetBundle;
  datasetClient?: DynamoDocumentClientLike;
  objectClient?: DynamoDocumentClientLike;
}

/** Minimal subset of DynamoDBDocumentClient used by the repositories. */
export interface DynamoDocumentClientLike {
  send(command: object): Promise<{ Items?: Array<Record<string, unknown>> }>;
}
