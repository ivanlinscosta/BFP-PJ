import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Router } from 'express';
import {
  AudienceRuleError,
  buildAudienceProfiles,
  evaluateAudience,
  listAudienceFieldOptions,
  previewAudience,
  type AudienceProfile,
} from '@bfp/analytics-engine';
import {
  AUDIENCE_STATUSES,
  LOGICAL_OPERATORS,
  type ActivationJob,
  type AudienceDefinition,
  type AudienceRule,
  type AudienceRuleGroup,
  type Company,
  type CompanyProduct,
  type FilterCondition,
  type Product,
} from '@bfp/domain';
import {
  activationRequestSchema,
  audienceRuleGroupSchema,
  filterConditionSchema,
} from '@bfp/schemas';
import { resolveUserProfile } from '@api/auth/profile';
import { requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { ApiError, NotFoundError, ValidationError } from '@api/common/errors';
import { readFeatureFlags } from '@api/http/routes/admin';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import type { DatasetRepository } from '@api/repositories/types';

const MAX_RULE_DEPTH = 3;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const ACTIVATION_QUEUE_MS = 1_500;
const ACTIVATION_PROCESSING_MS = 4_000;
const AUDIENCE_SOURCES = ['CRM', 'Onboarding', 'Produtos PJ'];

const audiencePayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).optional(),
  filters: z.array(filterConditionSchema).default([]),
  filterGroups: audienceRuleGroupSchema.optional(),
  logicalOperator: z.enum(LOGICAL_OPERATORS).optional(),
  sourceAnalysisId: z.string().trim().min(1).optional(),
  estimatedSize: z.number().int().nonnegative().optional(),
  status: z.enum(AUDIENCE_STATUSES).optional(),
});

const previewPayloadSchema = z.object({
  filterGroups: audienceRuleGroupSchema,
});

interface ProfileCacheEntry {
  profiles: AudienceProfile[];
  freshness: string;
  loadedAt: number;
}

const profileCache = new WeakMap<DatasetRepository, ProfileCacheEntry>();

async function loadProfiles(context: ApiContext) {
  const repository = context.getDatasetRepository();
  const cached = profileCache.get(repository);
  const now = context.clock().getTime();
  if (cached && now - cached.loadedAt < PROFILE_CACHE_TTL_MS) {
    return cached;
  }

  const [companies, companyProducts, products] = await Promise.all([
    repository.listByType<Company>('company'),
    repository.listByType<CompanyProduct>('companyProduct'),
    repository.listByType<Product>('product'),
  ]);
  const freshness = await context.getDataLoadedAt();
  const entry = {
    profiles: buildAudienceProfiles({ companies, companyProducts, products }),
    freshness,
    loadedAt: now,
  };
  profileCache.set(repository, entry);
  return entry;
}

function groupDepth(group: AudienceRuleGroup): number {
  return (
    1 + Math.max(0, ...group.rules.map((rule) => (rule.kind === 'group' ? groupDepth(rule) : 0)))
  );
}

/** Converts legacy flat filters into an AND rule group. */
function filtersToGroup(filters: FilterCondition[]): AudienceRuleGroup {
  return {
    kind: 'group',
    id: 'root',
    operator: 'AND',
    rules: filters.map((filter, index): AudienceRule => ({
      ...filter,
      kind: 'rule',
      id: `legacy-${index}`,
    })),
  };
}

function resolveRuleGroup(payload: {
  filterGroups?: AudienceRuleGroup;
  filters: FilterCondition[];
}) {
  const group = payload.filterGroups ?? filtersToGroup(payload.filters);
  if (groupDepth(group) > MAX_RULE_DEPTH) {
    throw new ValidationError(
      `Use no máximo ${MAX_RULE_DEPTH} níveis de grupos E/OU.`,
      { path: 'filterGroups' },
      'invalid_audience_rules',
    );
  }

  return group;
}

function runRules<T>(fn: () => T) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof AudienceRuleError) {
      throw new ValidationError(
        error.message,
        { issues: [{ code: 'INVALID_AUDIENCE_RULE', path: error.path, message: error.message }] },
        'invalid_audience_rules',
      );
    }

    throw error;
  }
}

function advanceJob(job: ActivationJob, nowMs: number): ActivationJob {
  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    return job;
  }

  const elapsed = nowMs - new Date(job.createdAt).getTime();
  if (elapsed < ACTIVATION_QUEUE_MS) {
    return { ...job, status: 'QUEUED' };
  }

  if (elapsed < ACTIVATION_PROCESSING_MS) {
    return { ...job, status: 'PROCESSING' };
  }

  return {
    ...job,
    status: 'COMPLETED',
    completedAt: new Date(
      new Date(job.createdAt).getTime() + ACTIVATION_PROCESSING_MS,
    ).toISOString(),
  };
}

async function resolveAudience(context: ApiContext, requesterId: string, role: string, id: string) {
  const repository = context.getObjectRepository();
  const ownAudience = await repository.get<AudienceDefinition>(requesterId, 'audience', id);
  if (ownAudience) {
    return ownAudience;
  }

  const matches = (await repository.findById<AudienceDefinition>(id)).filter(
    (item) => item.type === 'audience',
  );
  if (matches.length > 0 && role === 'admin') {
    return matches[0]!;
  }

  throw new NotFoundError('Audience not found.');
}

export function createAudiencesRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt, requireRoles('admin', 'analyst'));

  router.get('/', async (req, res, next) => {
    try {
      const items = await context
        .getObjectRepository()
        .listByType<AudienceDefinition>(req.auth!.userId, 'audience');
      res.json({
        items: items
          .map((item) => item.value)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/fields', async (_req, res, next) => {
    try {
      const { profiles } = await loadProfiles(context);
      res.json({ items: listAudienceFieldOptions(profiles) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/preview', async (req, res, next) => {
    try {
      const payload = parseWithZod(previewPayloadSchema, req.body, {
        message: 'Regras de audiência inválidas.',
      });
      const group = resolveRuleGroup({ filterGroups: payload.filterGroups, filters: [] });
      const { profiles, freshness } = await loadProfiles(context);
      const preview = runRules(() =>
        previewAudience(profiles, group, { freshness, sources: AUDIENCE_SOURCES }),
      );
      res.json({ preview });
    } catch (error) {
      next(error);
    }
  });

  router.get('/activations', async (req, res, next) => {
    try {
      const repository = context.getObjectRepository();
      const jobs = await repository.listByType<ActivationJob>(req.auth!.userId, 'activationJob');
      const nowMs = context.clock().getTime();
      res.json({
        items: jobs
          .map((job) => advanceJob(job.value, nowMs))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const auth = req.auth!;
      const payload = parseWithZod(audiencePayloadSchema, req.body, {
        message: 'Invalid audience payload.',
      });
      const group = resolveRuleGroup(payload);
      const { profiles } = await loadProfiles(context);
      const estimatedSize = runRules(() => evaluateAudience(profiles, group).length);
      const now = context.clock().toISOString();
      const audience: AudienceDefinition = {
        id: randomUUID(),
        name: payload.name,
        description: payload.description,
        filters: payload.filters,
        filterGroups: group,
        logicalOperator: group.operator,
        sourceAnalysisId: payload.sourceAnalysisId,
        estimatedSize,
        status: payload.status ?? 'READY',
        createdBy: auth.userId,
        ownerName: resolveUserProfile(auth).name,
        createdAt: now,
        updatedAt: now,
      };

      await context.getObjectRepository().put({
        userId: auth.userId,
        type: 'audience',
        id: audience.id,
        value: audience,
      });
      context.logger.info('audience_saved', {
        correlationId: req.correlationId,
        userId: auth.userId,
        operation: 'CREATE_AUDIENCE',
        status: 'created',
        audienceId: audience.id,
        estimatedSize,
      });

      res.status(201).json({ audience });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const persisted = await resolveAudience(
        context,
        req.auth!.userId,
        req.auth!.role,
        req.params.id,
      );
      res.json({ audience: persisted.value });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const persisted = await resolveAudience(
        context,
        req.auth!.userId,
        req.auth!.role,
        req.params.id,
      );
      const payload = parseWithZod(audiencePayloadSchema, req.body, {
        message: 'Invalid audience payload.',
      });
      const group = resolveRuleGroup(payload);
      const { profiles } = await loadProfiles(context);
      const estimatedSize = runRules(() => evaluateAudience(profiles, group).length);
      const current = persisted.value;
      const audience: AudienceDefinition = {
        ...current,
        name: payload.name,
        description: payload.description,
        filters: payload.filters,
        filterGroups: group,
        logicalOperator: group.operator,
        sourceAnalysisId: payload.sourceAnalysisId,
        estimatedSize,
        status: payload.status ?? current.status,
        updatedAt: context.clock().toISOString(),
      };

      await context.getObjectRepository().put({
        userId: persisted.userId,
        type: 'audience',
        id: audience.id,
        value: audience,
      });

      res.json({ audience });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/activate', async (req, res, next) => {
    try {
      const auth = req.auth!;
      if (!(await readFeatureFlags(context)).audienceActivation) {
        throw new ApiError(
          403,
          'feature_disabled',
          'A ativação de audiências está desativada pela administração.',
        );
      }
      const persisted = await resolveAudience(context, auth.userId, auth.role, req.params.id);
      const { destination } = parseWithZod(activationRequestSchema, req.body, {
        message: 'Destino de ativação inválido.',
      });
      const group = persisted.value.filterGroups ?? filtersToGroup(persisted.value.filters);
      const { profiles } = await loadProfiles(context);
      const records = runRules(() => evaluateAudience(profiles, group).length);
      const now = context.clock().toISOString();
      const job: ActivationJob = {
        id: randomUUID(),
        audienceId: persisted.value.id,
        audienceName: persisted.value.name,
        destination,
        status: 'QUEUED',
        records,
        createdBy: auth.userId,
        createdAt: now,
        completedAt: null,
      };
      const repository = context.getObjectRepository();

      await repository.put({ userId: auth.userId, type: 'activationJob', id: job.id, value: job });
      await repository.put({
        ...persisted,
        value: {
          ...persisted.value,
          status: 'ACTIVATED',
          lastDestination: destination,
          estimatedSize: records,
          updatedAt: now,
        },
      });
      context.logger.info('audience_activation_queued', {
        correlationId: req.correlationId,
        userId: auth.userId,
        operation: 'ACTIVATION',
        status: 'QUEUED',
        audienceId: job.audienceId,
        destination,
        records,
      });

      res.status(202).json({ job });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/activations', async (req, res, next) => {
    try {
      const auth = req.auth!;
      const persisted = await resolveAudience(context, auth.userId, auth.role, req.params.id);
      const repository = context.getObjectRepository();
      const nowMs = context.clock().getTime();
      const jobs = (await repository.listByType<ActivationJob>(auth.userId, 'activationJob'))
        .filter((job) => job.value.audienceId === persisted.value.id)
        .map((job) => ({ persisted: job, current: advanceJob(job.value, nowMs) }));

      await Promise.all(
        jobs
          .filter(({ persisted: job, current }) => job.value.status !== current.status)
          .map(({ persisted: job, current }) => repository.put({ ...job, value: current })),
      );

      res.json({
        items: jobs
          .map(({ current }) => current)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const persisted = await resolveAudience(
        context,
        req.auth!.userId,
        req.auth!.role,
        req.params.id,
      );
      await context.getObjectRepository().delete(persisted.userId, 'audience', persisted.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
