import type { CustomerIntelligenceProfile } from '@bfp/customer-intelligence';
import {
  DynamoCustomerIntelligenceRepository,
  DynamoRecommendationOutcomeRepository,
  InMemoryCustomerIntelligenceRepository,
  InMemoryRecommendationOutcomeRepository,
  loadLocalProfiles,
  type CustomerIntelligenceRepository,
  type RecommendationOutcomeRepository,
} from '@api/services/customerIntelligence/repository';
import { DOCUMENT_CLIENT_OPTIONS } from '@api/repositories/factory';
import fs from 'node:fs';
import path from 'node:path';
import { AthenaClient } from '@aws-sdk/client-athena';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBAnalyticsQueryEngine,
  InMemoryAnalyticsQueryEngine,
  buildAudienceProfiles,
  evaluateAudience,
  type AnalyticsExecutionResult,
} from '@bfp/analytics-engine';
import type { AudienceDefinition, AuditLogEntry, DatasetBundle } from '@bfp/domain';
import { buildDemoWorkspace } from '@api/demo/workspace';
import { AthenaAnalyticsQueryEngine } from '@api/engines/athenaEngine';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';
import { AuthService } from '@api/auth/authService';
import type { AuthenticatedUser } from '@api/auth/types';
import { loadConfig, type AppConfig } from '@api/common/config';
import type { Logger } from '@api/common/logger';
import { logger } from '@api/common/logger';
import { DynamoDatasetRepository } from '@api/repositories/dynamoDatasetRepository';
import { DynamoObjectRepository } from '@api/repositories/dynamoObjectRepository';
import {
  InMemoryDatasetRepository,
  createEmptyDatasetBundle,
} from '@api/repositories/inMemoryDatasetRepository';
import { InMemoryObjectRepository } from '@api/repositories/inMemoryObjectRepository';
import type { DatasetRepository, ObjectRepository } from '@api/repositories/types';

let cachedProcessDatasetBundle: DatasetBundle | undefined;
let cachedProcessDatasetLoadedAt: string | undefined;
const PROCESS_STARTED_AT = new Date().toISOString();

export interface HttpAnalyticsEngine {
  execute(query: ValidatedAnalysisQuery): Promise<AnalyticsExecutionResult>;
}

export interface ApiContext {
  config: AppConfig;
  logger: Logger;
  authService: AuthService;
  clock: () => Date;
  getDatasetRepository(): DatasetRepository;
  getObjectRepository(): ObjectRepository;
  getAnalyticsEngine(user: AuthenticatedUser): HttpAnalyticsEngine;
  /** When the analytical dataset was last loaded (drives freshness indicators). */
  getDataLoadedAt(): Promise<string>;
  /** Customer Intelligence read model (DNA, signals, NBA) materialized by the rebuild. */
  getCustomerIntelligenceRepository(): CustomerIntelligenceRepository;
  getRecommendationOutcomeRepository(): RecommendationOutcomeRepository;
}

export interface ApiContextOptions {
  config?: AppConfig;
  logger?: Logger;
  authService?: AuthService;
  datasetBundle?: DatasetBundle;
  datasetRepository?: DatasetRepository;
  objectRepository?: ObjectRepository;
  clock?: () => Date;
  auditSpy?: (entry: AuditLogEntry) => void | Promise<void>;
  /** Pre-built intelligence profiles (tests); local dev reads data/customer-intelligence.json. */
  intelligenceProfiles?: CustomerIntelligenceProfile[];
}

function loadDevDatasetBundle(config: AppConfig, fallbackBundle?: DatasetBundle) {
  if (fallbackBundle) {
    return fallbackBundle;
  }

  if (cachedProcessDatasetBundle) {
    return cachedProcessDatasetBundle;
  }

  const datasetPathCandidates = [
    path.resolve(process.cwd(), config.dataPath),
    path.resolve(process.cwd(), 'apps/api', config.dataPath),
    path.resolve(process.cwd(), 'data/dataset.json'),
  ];
  const datasetPath = datasetPathCandidates.find((candidate) => fs.existsSync(candidate));

  if (!datasetPath) {
    throw new Error(
      `Local dataset not found. Tried: ${datasetPathCandidates.join(', ')}. Run \`npm run seed\` to generate data/dataset.json before starting the API.`,
    );
  }

  const contents = fs.readFileSync(datasetPath, 'utf8');
  // Datasets generated before a new entity type existed simply lack that list: treat it as empty.
  cachedProcessDatasetBundle = {
    ...createEmptyDatasetBundle(),
    ...(JSON.parse(contents) as Partial<DatasetBundle>),
  };
  cachedProcessDatasetLoadedAt = fs.statSync(datasetPath).mtime.toISOString();
  return cachedProcessDatasetBundle;
}

/** Demo workspace with audience sizes computed from the governed dataset. */
function buildSeededWorkspace(now: Date, bundle: DatasetBundle) {
  const profiles = buildAudienceProfiles({
    companies: bundle.companies,
    companyProducts: bundle.companyProducts,
    products: bundle.products,
  });

  return buildDemoWorkspace(now).map((object) => {
    if (object.type !== 'audience') {
      return object;
    }

    const audience = object.value as AudienceDefinition;
    return {
      ...object,
      value: {
        ...audience,
        estimatedSize: audience.filterGroups
          ? evaluateAudience(profiles, audience.filterGroups).length
          : audience.estimatedSize,
      },
    };
  });
}

export function createApiContext(options: ApiContextOptions = {}): ApiContext {
  const config = options.config ?? loadConfig();
  const contextLogger = options.logger ?? logger;
  const authService = options.authService ?? new AuthService(config);
  const clock = options.clock ?? (() => new Date());

  let datasetRepository = options.datasetRepository;
  let objectRepository = options.objectRepository;
  let documentClient: DynamoDBDocumentClient | undefined;
  const engineCache = new Map<string, HttpAnalyticsEngine>();

  const getDocumentClient = () => {
    if (documentClient) {
      return documentClient;
    }

    const baseClient = new DynamoDBClient({ region: config.awsRegion });
    documentClient = DynamoDBDocumentClient.from(baseClient, DOCUMENT_CLIENT_OPTIONS);
    return documentClient;
  };

  const getDatasetRepository = () => {
    if (datasetRepository) {
      return datasetRepository;
    }

    datasetRepository = config.useDynamo
      ? new DynamoDatasetRepository(getDocumentClient(), config.dynamoDatasetTable)
      : new InMemoryDatasetRepository(loadDevDatasetBundle(config, options.datasetBundle));

    return datasetRepository;
  };

  const getObjectRepository = () => {
    if (objectRepository) {
      return objectRepository;
    }

    objectRepository = config.useDynamo
      ? new DynamoObjectRepository(getDocumentClient(), config.dynamoObjectsTable)
      : new InMemoryObjectRepository(
          config.seedDemoWorkspace
            ? buildSeededWorkspace(clock(), loadDevDatasetBundle(config, options.datasetBundle))
            : [],
        );

    return objectRepository;
  };

  let intelligenceRepository: CustomerIntelligenceRepository | undefined;
  let outcomeRepository: RecommendationOutcomeRepository | undefined;
  const getCustomerIntelligenceRepository = () => {
    intelligenceRepository ??= config.useDynamo
      ? new DynamoCustomerIntelligenceRepository(getDocumentClient(), config.dynamoDatasetTable)
      : new InMemoryCustomerIntelligenceRepository(
          options.intelligenceProfiles ?? loadLocalProfiles(config.dataPath),
        );
    return intelligenceRepository;
  };
  const getRecommendationOutcomeRepository = () => {
    outcomeRepository ??= config.useDynamo
      ? new DynamoRecommendationOutcomeRepository(getDocumentClient(), config.dynamoDatasetTable)
      : new InMemoryRecommendationOutcomeRepository();
    return outcomeRepository;
  };

  const persistAudit = async (entry: AuditLogEntry) => {
    await getDatasetRepository().put('auditLog', entry);
    await options.auditSpy?.(entry);
  };

  const getAnalyticsEngine = (user: AuthenticatedUser) => {
    const key = `${user.userId}:${user.role}`;
    const existingEngine = engineCache.get(key);
    if (existingEngine) {
      return existingEngine;
    }

    const baseOptions = {
      clock,
      onAudit: persistAudit,
      contextResolver: () => ({
        accessScope: `${user.role}:${user.groups.join(',')}`,
        userId: user.userId,
        companyId: null,
      }),
    };

    if (config.analyticsEngine === 'athena') {
      const athenaEngine = new AthenaAnalyticsQueryEngine({
        client: new AthenaClient({ region: config.awsRegion }),
        meshDatabasePrefix: config.athena.database,
        workgroup: config.athena.workgroup,
        outputLocation: config.athena.outputLocation,
        accessScope: `${user.role}:${user.groups.join(',')}`,
        clock,
        freshness: getDataLoadedAt,
      });
      engineCache.set(key, athenaEngine);
      return athenaEngine;
    }

    const engine = config.useDynamo
      ? new DynamoDBAnalyticsQueryEngine({
          client: getDocumentClient(),
          tableName: config.dynamoDatasetTable,
          ...baseOptions,
        })
      : new InMemoryAnalyticsQueryEngine({
          bundle: loadDevDatasetBundle(config, options.datasetBundle),
          ...baseOptions,
        });

    engineCache.set(key, engine);
    return engine;
  };

  let parameterCache: { value: string; expiresAt: number } | undefined;
  const getDataLoadedAt = async () => {
    if (config.dataLoadedAt) {
      return config.dataLoadedAt;
    }

    if (config.dataLoadedAtParameter) {
      if (parameterCache && parameterCache.expiresAt > Date.now()) {
        return parameterCache.value;
      }
      const value = await new SSMClient({ region: config.awsRegion })
        .send(new GetParameterCommand({ Name: config.dataLoadedAtParameter }))
        .then((response) => response.Parameter?.Value)
        .catch(() => undefined);
      if (value && !Number.isNaN(Date.parse(value))) {
        parameterCache = { value, expiresAt: Date.now() + 5 * 60_000 };
        return value;
      }
    }

    if (!config.useDynamo && !options.datasetRepository) {
      loadDevDatasetBundle(config, options.datasetBundle);
      return options.datasetBundle
        ? clock().toISOString()
        : (cachedProcessDatasetLoadedAt ?? PROCESS_STARTED_AT);
    }

    return PROCESS_STARTED_AT;
  };

  return {
    config,
    logger: contextLogger,
    authService,
    clock,
    getDatasetRepository,
    getObjectRepository,
    getAnalyticsEngine,
    getDataLoadedAt,
    getCustomerIntelligenceRepository,
    getRecommendationOutcomeRepository,
  };
}
