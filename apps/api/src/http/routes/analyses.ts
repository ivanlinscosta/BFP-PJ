import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { type AnalysisSpec } from '@bfp/domain';
import { analysisSpecSchema } from '@bfp/schemas';
import { resolveUserProfile } from '@api/auth/profile';
import { requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { ForbiddenError } from '@api/common/errors';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import {
  assertCanEdit,
  isShared,
  listVisibleObjects,
  resolveVisibleObject,
  type SharingFields,
} from '@api/http/objectAccess';

const analysisSharing = (analysis: AnalysisSpec): SharingFields => ({
  visibility: analysis.metadata?.visibility,
  team: analysis.metadata?.team,
});

function sortByRecency(items: AnalysisSpec[]) {
  return [...items].sort((left, right) =>
    (right.metadata?.updatedAt ?? '').localeCompare(left.metadata?.updatedAt ?? ''),
  );
}

export function createAnalysesRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt, requireRoles('admin', 'analyst'));

  router.get('/', async (req, res, next) => {
    try {
      const visible = await listVisibleObjects<AnalysisSpec>(
        context.getObjectRepository(),
        'analysis',
        req.auth!,
        analysisSharing,
      );
      const items = sortByRecency(
        visible.map(({ persisted, access }) => ({ ...persisted.value, access })),
      );
      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const auth = req.auth!;
      const payload = parseWithZod(analysisSpecSchema, req.body, {
        message: 'Invalid analysis payload.',
      });
      const profile = resolveUserProfile(auth);
      const now = context.clock().toISOString();
      const visibility = payload.metadata?.visibility ?? 'PRIVATE';
      const analysis: AnalysisSpec = {
        ...payload,
        id: randomUUID(),
        name: payload.name ?? 'Análise sem título',
        metadata: {
          description: payload.metadata?.description,
          visibility,
          team: payload.metadata?.team ?? profile.team,
          ownerName: profile.name,
          createdBy: auth.userId,
          createdAt: now,
          updatedAt: now,
        },
      };

      await context.getObjectRepository().put({
        userId: auth.userId,
        type: 'analysis',
        id: analysis.id!,
        value: analysis,
        shared: isShared(visibility),
      });
      context.logger.info('analysis_saved', {
        correlationId: req.correlationId,
        userId: auth.userId,
        operation: 'SAVE_ANALYSIS',
        status: 'created',
        analysisId: analysis.id,
      });

      res.status(201).json({ analysis: { ...analysis, access: 'OWNER' } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { persisted, access } = await resolveVisibleObject<AnalysisSpec>(
        context.getObjectRepository(),
        'analysis',
        req.params.id,
        req.auth!,
        analysisSharing,
        'Analysis not found.',
      );
      res.json({ analysis: { ...persisted.value, access } });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const { persisted, access } = await resolveVisibleObject<AnalysisSpec>(
        context.getObjectRepository(),
        'analysis',
        req.params.id,
        req.auth!,
        analysisSharing,
        'Analysis not found.',
      );
      assertCanEdit(access, 'Você tem acesso somente leitura a esta análise.');
      const payload = parseWithZod(analysisSpecSchema, req.body, {
        message: 'Invalid analysis payload.',
      });
      const current = persisted.value;
      const visibility =
        access === 'OWNER'
          ? (payload.metadata?.visibility ?? current.metadata?.visibility ?? 'PRIVATE')
          : (current.metadata?.visibility ?? 'PRIVATE');
      const analysis: AnalysisSpec = {
        ...payload,
        id: current.id,
        name: payload.name ?? current.name,
        metadata: {
          ...current.metadata,
          description: payload.metadata?.description ?? current.metadata?.description,
          visibility,
          team:
            access === 'OWNER'
              ? (payload.metadata?.team ?? current.metadata?.team)
              : current.metadata?.team,
          updatedAt: context.clock().toISOString(),
        },
      };

      await context.getObjectRepository().put({
        userId: persisted.userId,
        type: 'analysis',
        id: analysis.id!,
        value: analysis,
        shared: isShared(visibility),
      });
      context.logger.info('analysis_saved', {
        correlationId: req.correlationId,
        userId: req.auth!.userId,
        operation: 'SAVE_ANALYSIS',
        status: 'updated',
        analysisId: analysis.id,
      });

      res.json({ analysis: { ...analysis, access } });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { persisted, access } = await resolveVisibleObject<AnalysisSpec>(
        context.getObjectRepository(),
        'analysis',
        req.params.id,
        req.auth!,
        analysisSharing,
        'Analysis not found.',
      );
      if (access !== 'OWNER' && req.auth!.role !== 'admin') {
        throw new ForbiddenError('Somente quem criou a análise pode excluí-la.');
      }
      await context.getObjectRepository().delete(persisted.userId, 'analysis', persisted.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
