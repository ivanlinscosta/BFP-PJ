import { z } from 'zod';
import { Router } from 'express';
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DEMO_USERS, USER_ROLES, type UserRole } from '@bfp/domain';
import {
  BUSINESS_GLOSSARY,
  DATA_PRODUCT_CATALOG,
  SEMANTIC_DOMAINS,
  listDimensionDefinitions,
  listMetricDefinitions,
} from '@bfp/semantic-layer';
import { PERMISSIONS, requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';

const SYSTEM_USER_ID = '__system__';
const FEATURE_FLAGS_ID = 'feature-flags';

/** Feature flags governed by administrators and read by every client. */
export const DEFAULT_FEATURE_FLAGS = {
  aiCopilot: true,
  audienceActivation: true,
  csvExport: true,
  dashboardSharing: true,
} as const;

type FeatureFlags = Record<keyof typeof DEFAULT_FEATURE_FLAGS, boolean>;

const featureFlagsSchema = z.object({
  aiCopilot: z.boolean(),
  audienceActivation: z.boolean(),
  csvExport: z.boolean(),
  dashboardSharing: z.boolean(),
});

/** Reads persisted feature flags merged with defaults. */
export async function readFeatureFlags(context: ApiContext): Promise<FeatureFlags> {
  const stored = await context
    .getObjectRepository()
    .get<Partial<FeatureFlags>>(SYSTEM_USER_ID, 'preference', FEATURE_FLAGS_ID);
  return { ...DEFAULT_FEATURE_FLAGS, ...stored?.value };
}

async function listUsers(context: ApiContext) {
  if (context.config.authMode === 'dev') {
    return DEMO_USERS.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      team: user.team,
      role: user.role,
      status: 'ACTIVE',
    }));
  }

  const client = new CognitoIdentityProviderClient({ region: context.config.awsRegion });
  const groups = await Promise.all(
    USER_ROLES.map(async (role: UserRole) => {
      const response = await client.send(
        new ListUsersInGroupCommand({
          UserPoolId: context.config.cognitoUserPoolId,
          GroupName: role,
          Limit: 60,
        }),
      );
      return (response.Users ?? []).map((user) => {
        const attribute = (name: string) =>
          user.Attributes?.find((entry) => entry.Name === name)?.Value;
        return {
          id: attribute('sub') ?? user.Username ?? '',
          name: attribute('name') ?? user.Username ?? '',
          email: attribute('email') ?? '',
          team: attribute('custom:team') ?? '—',
          role,
          status: user.Enabled === false ? 'DISABLED' : (user.UserStatus ?? 'ACTIVE'),
        };
      });
    }),
  );

  return groups.flat();
}

export function createAdminRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt);

  router.get('/features', async (_req, res, next) => {
    try {
      res.json({ flags: await readFeatureFlags(context) });
    } catch (error) {
      next(error);
    }
  });

  router.use(requireRoles('admin'));

  router.get('/overview', async (_req, res, next) => {
    try {
      const metrics = listMetricDefinitions();
      const dimensions = listDimensionDefinitions();
      res.json({
        users: await listUsers(context),
        roles: USER_ROLES.map((role) => ({
          role,
          actions: PERMISSIONS[role].actions,
          domains: PERMISSIONS[role].domains,
        })),
        domains: SEMANTIC_DOMAINS.map((domain) => ({
          id: domain,
          metrics: metrics.filter((metric) => metric.domain === domain).length,
          dimensions: dimensions.filter((dimension) => dimension.domain === domain).length,
          dataProducts: DATA_PRODUCT_CATALOG.filter((product) => product.domain === domain).length,
        })),
        metrics: metrics.map((metric) => ({
          id: metric.id,
          name: metric.shortName,
          domain: metric.domain,
          owner: metric.owner,
          certificationStatus: metric.certificationStatus,
          version: metric.version,
        })),
        dimensions: dimensions.map((dimension) => ({
          id: dimension.id,
          name: dimension.label,
          domain: dimension.domain,
          type: dimension.type,
          sensitivity: dimension.sensitivity,
        })),
        dataProducts: DATA_PRODUCT_CATALOG.map((product) => ({
          id: product.id,
          name: product.name,
          owner: product.owner,
          goldTable: product.goldTable,
          sloMinutes: product.freshnessSLOMinutes,
        })),
        semantic: {
          version: metrics[0]?.version ?? '—',
          metricCount: metrics.length,
          dimensionCount: dimensions.length,
          glossaryCount: BUSINESS_GLOSSARY.length,
          certifiedMetrics: metrics.filter((metric) => metric.certificationStatus === 'CERTIFIED')
            .length,
        },
        runtime: {
          authMode: context.config.authMode,
          persistence: context.config.useDynamo ? 'DynamoDB' : 'Memória local',
          analyticsEngine: context.config.analyticsEngine,
          aiProvider: context.config.aiProvider,
        },
        featureFlags: await readFeatureFlags(context),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/features', async (req, res, next) => {
    try {
      const flags = parseWithZod(featureFlagsSchema, req.body, {
        message: 'Feature flags inválidas.',
      });
      await context.getObjectRepository().put({
        userId: SYSTEM_USER_ID,
        type: 'preference',
        id: FEATURE_FLAGS_ID,
        value: flags,
      });
      context.logger.info('feature_flags_updated', {
        correlationId: req.correlationId,
        userId: req.auth!.userId,
        operation: 'UPDATE_FEATURE_FLAGS',
        status: 'success',
      });
      res.json({ flags });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
