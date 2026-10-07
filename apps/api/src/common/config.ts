import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  AUTH_MODE: z.enum(['dev', 'cognito']).default('dev'),
  JWT_SECRET: z.string().min(1).default('dev-only-secret-change-me'),
  AWS_REGION: z.string().min(1).default('sa-east-1'),
  COGNITO_USER_POOL_ID: z.string().default(''),
  COGNITO_CLIENT_ID: z.string().default(''),
  DATASET_TABLE: z.string().optional(),
  OBJECTS_TABLE: z.string().optional(),
  DYNAMODB_TABLE_DATASET: z.string().optional(),
  DYNAMODB_TABLE_OBJECTS: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_SECRET_NAME: z.string().default('bfp/dev/anthropic-api-key'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  DATA_PATH: z.string().default('../../data/dataset.json'),
  DATA_LOADED_AT: z.string().datetime().optional(),
  ANALYTICS_ENGINE: z.enum(['memory', 'dynamodb', 'athena']).optional(),
  ATHENA_WORKGROUP: z.string().default('primary'),
  ATHENA_DATABASE: z.string().default('bfp_pj_dev'),
  ATHENA_OUTPUT_LOCATION: z.string().optional(),
  AI_PROVIDER: z.enum(['local', 'bedrock', 'anthropic']).optional(),
  MESH_CATALOG: z.enum(['local', 'glue']).optional(),
  MESH_DATABASE_PREFIX: z.string().optional(),
  DATAZONE_DOMAIN_ID: z.string().optional(),
  DATA_LOADED_AT_PARAMETER: z.string().optional(),
  ATLAN_SECRET_ID: z.string().optional(),
  ATLAN_BASE_URL: z.string().optional(),
  ATLAN_API_TOKEN: z.string().optional(),
  FULLSTORY_SECRET_ID: z.string().optional(),
  FULLSTORY_API_KEY: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().optional(),
  BEDROCK_REGION: z.string().optional(),
  SEED_DEMO_WORKSPACE: z.enum(['true', 'false']).optional(),
  PORT: z.coerce.number().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).optional(),
  RATE_LIMIT_TOKENS_PER_MINUTE: z.coerce.number().default(100),
  RATE_LIMIT_BURST: z.coerce.number().default(200),
});

export type AuthMode = 'dev' | 'cognito';

/** Analytics execution backend. */
export type AnalyticsEngineKind = 'memory' | 'dynamodb' | 'athena';

/** Provider that narrates governed answers in Inteligência PJ. */
export type AiProviderKind = 'local' | 'bedrock' | 'anthropic';

export interface AppConfig {
  nodeEnv: string;
  authMode: AuthMode;
  jwtSecret: string;
  awsRegion: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  dynamoDatasetTable: string;
  dynamoObjectsTable: string;
  useDynamo: boolean;
  anthropicApiKey: string;
  anthropicSecretName: string;
  anthropicModel: string;
  dataPath: string;
  dataLoadedAt?: string;
  analyticsEngine: AnalyticsEngineKind;
  athena: {
    workgroup: string;
    database: string;
    outputLocation?: string;
  };
  aiProvider: AiProviderKind;
  mesh: {
    catalog: 'local' | 'glue';
    databasePrefix: string;
    datazoneDomainId?: string;
  };
  dataLoadedAtParameter?: string;
  atlan: { secretId?: string; baseUrl?: string; apiToken?: string };
  fullstory: { secretId?: string; apiKey?: string };
  bedrockModelId: string;
  bedrockRegion: string;
  seedDemoWorkspace: boolean;
  port: number;
  webOrigin: string;
  rateLimit: {
    enabled: boolean;
    tokensPerMinute: number;
    burst: number;
  };
}

const DEFAULT_DEV_JWT_SECRET = 'dev-only-secret-change-me';

function resolveRateLimitEnabled(nodeEnv: string, configuredValue: 'true' | 'false' | undefined) {
  if (!configuredValue) {
    return nodeEnv !== 'test';
  }

  if (configuredValue === 'false' && nodeEnv !== 'test') {
    console.warn(
      '[config] RATE_LIMIT_ENABLED=false é permitido apenas em NODE_ENV=test; mantendo o rate limit ativo.',
    );
    return true;
  }

  return configuredValue === 'true';
}

function warnUnsafeAuthConfig(nodeEnv: string, authMode: AuthMode, jwtSecret: string) {
  if (nodeEnv === 'test') {
    return;
  }

  if (authMode !== 'dev' && jwtSecret === DEFAULT_DEV_JWT_SECRET) {
    console.warn(
      '[config] JWT_SECRET padrão detectado com AUTH_MODE=cognito. O segredo local HS256 não é usado em cloud e deve ser mantido apenas para desenvolvimento local.',
    );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const nodeEnv = parsed.NODE_ENV ?? 'development';
  const bedrockModelId =
    parsed.BEDROCK_MODEL_ID?.trim() && parsed.BEDROCK_MODEL_ID.trim() !== 'NOT_CONFIGURED'
      ? parsed.BEDROCK_MODEL_ID.trim()
      : '';
  const dynamoDatasetTable = parsed.DATASET_TABLE ?? parsed.DYNAMODB_TABLE_DATASET ?? '';
  const dynamoObjectsTable = parsed.OBJECTS_TABLE ?? parsed.DYNAMODB_TABLE_OBJECTS ?? '';

  warnUnsafeAuthConfig(nodeEnv, parsed.AUTH_MODE, parsed.JWT_SECRET);

  return {
    nodeEnv,
    authMode: parsed.AUTH_MODE,
    jwtSecret: parsed.JWT_SECRET,
    awsRegion: parsed.AWS_REGION,
    cognitoUserPoolId: parsed.COGNITO_USER_POOL_ID,
    cognitoClientId: parsed.COGNITO_CLIENT_ID,
    dynamoDatasetTable,
    dynamoObjectsTable,
    useDynamo: Boolean(dynamoDatasetTable && dynamoObjectsTable),
    anthropicApiKey: parsed.ANTHROPIC_API_KEY?.trim() ?? '',
    anthropicSecretName: parsed.ANTHROPIC_SECRET_NAME,
    anthropicModel: parsed.ANTHROPIC_MODEL,
    dataPath: parsed.DATA_PATH,
    dataLoadedAt: parsed.DATA_LOADED_AT,
    analyticsEngine:
      parsed.ANALYTICS_ENGINE ?? (dynamoDatasetTable && dynamoObjectsTable ? 'dynamodb' : 'memory'),
    athena: {
      workgroup: parsed.ATHENA_WORKGROUP,
      database: parsed.ATHENA_DATABASE,
      outputLocation: parsed.ATHENA_OUTPUT_LOCATION,
    },
    aiProvider:
      parsed.AI_PROVIDER ??
      (bedrockModelId ? 'bedrock' : parsed.ANTHROPIC_API_KEY?.trim() ? 'anthropic' : 'local'),
    bedrockModelId,
    mesh: {
      catalog:
        parsed.MESH_CATALOG ?? ((parsed.ANALYTICS_ENGINE ?? '') === 'athena' ? 'glue' : 'local'),
      databasePrefix: parsed.MESH_DATABASE_PREFIX ?? parsed.ATHENA_DATABASE,
      datazoneDomainId: parsed.DATAZONE_DOMAIN_ID?.trim() || undefined,
    },
    dataLoadedAtParameter: parsed.DATA_LOADED_AT_PARAMETER?.trim() || undefined,
    atlan: {
      secretId: parsed.ATLAN_SECRET_ID?.trim() || undefined,
      baseUrl: parsed.ATLAN_BASE_URL?.trim() || undefined,
      apiToken: parsed.ATLAN_API_TOKEN?.trim() || undefined,
    },
    fullstory: {
      secretId: parsed.FULLSTORY_SECRET_ID?.trim() || undefined,
      apiKey: parsed.FULLSTORY_API_KEY?.trim() || undefined,
    },
    bedrockRegion: parsed.BEDROCK_REGION ?? parsed.AWS_REGION,
    seedDemoWorkspace: parsed.SEED_DEMO_WORKSPACE
      ? parsed.SEED_DEMO_WORKSPACE === 'true'
      : nodeEnv !== 'test',
    port: parsed.PORT,
    webOrigin: parsed.WEB_ORIGIN,
    rateLimit: {
      enabled: resolveRateLimitEnabled(nodeEnv, parsed.RATE_LIMIT_ENABLED),
      tokensPerMinute: parsed.RATE_LIMIT_TOKENS_PER_MINUTE,
      burst: parsed.RATE_LIMIT_BURST,
    },
  };
}
