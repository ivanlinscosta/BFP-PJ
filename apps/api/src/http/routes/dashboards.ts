import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Router, type Request } from 'express';
import {
  DASHBOARD_LAYOUT_MODES,
  SHARING_LEVELS,
  VISUALIZATION_TYPES,
  type AnalysisSpec,
  type DashboardDefinition,
} from '@bfp/domain';
import { resolveUserProfile } from '@api/auth/profile';
import { requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { ForbiddenError, UnauthorizedError } from '@api/common/errors';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import {
  assertCanEdit,
  isShared,
  listVisibleObjects,
  resolveVisibleObject,
  type ObjectAccess,
  type SharingFields,
} from '@api/http/objectAccess';
import { describeSpec } from '@api/http/specLabels';

const visualizationSchema = z.object({
  type: z.enum(VISUALIZATION_TYPES),
});

const dashboardCardSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  analysisId: z.string().trim().min(1),
  visualization: visualizationSchema.optional(),
  layout: z.object({
    mode: z.enum(DASHBOARD_LAYOUT_MODES),
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
});

const dashboardPayloadSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  cards: z.array(dashboardCardSchema).max(24),
  visibility: z.enum(SHARING_LEVELS).optional(),
  team: z.string().trim().min(1).optional(),
  createdBy: z.string().trim().min(1).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

const favoritePayloadSchema = z.object({
  favorite: z.boolean(),
});

const dashboardSharing = (dashboard: DashboardDefinition): SharingFields => ({
  visibility: dashboard.visibility,
  team: dashboard.team,
});

function requireAuth(req: Request) {
  if (!req.auth) {
    throw new UnauthorizedError();
  }

  return req.auth;
}

function favoriteId(dashboardId: string) {
  return `dashboard:${dashboardId}`;
}

async function loadCardAnalyses(context: ApiContext, dashboard: DashboardDefinition) {
  const repository = context.getObjectRepository();
  const entries = await Promise.all(
    dashboard.cards.map(async (card) => {
      const match = (await repository.findById<AnalysisSpec>(card.analysisId)).find(
        (item) => item.type === 'analysis',
      );
      return match ? ([card.analysisId, match.value] as const) : null;
    }),
  );

  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

async function toDashboardView(
  context: ApiContext,
  dashboard: DashboardDefinition,
  access: ObjectAccess,
  isFavorite: boolean,
) {
  const analyses = await loadCardAnalyses(context, dashboard);
  return {
    ...dashboard,
    access,
    isFavorite,
    cardSummaries: dashboard.cards.map((card) => {
      const analysis = analyses.get(card.analysisId);
      const description = analysis ? describeSpec(analysis) : null;
      return {
        cardId: card.id,
        analysisId: card.analysisId,
        title: analysis?.name ?? card.title,
        subtitle: description
          ? [...description.filters, description.period.replace(/^./, (c) => c.toUpperCase())]
              .filter(Boolean)
              .join(' · ')
          : 'Análise indisponível',
        available: Boolean(analysis),
      };
    }),
  };
}

export function createDashboardsRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt);

  router.get('/', async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const repository = context.getObjectRepository();
      const [visible, favorites] = await Promise.all([
        listVisibleObjects<DashboardDefinition>(repository, 'dashboard', auth, dashboardSharing),
        repository.listByType<{ targetId: string }>(auth.userId, 'favorite'),
      ]);
      const favoriteIds = new Set(favorites.map((favorite) => favorite.id));
      const items = await Promise.all(
        visible.map(({ persisted, access }) =>
          toDashboardView(
            context,
            persisted.value,
            access,
            favoriteIds.has(favoriteId(persisted.id)),
          ),
        ),
      );

      res.json({
        items: items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireRoles('admin', 'analyst'), async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const payload = parseWithZod(dashboardPayloadSchema, req.body, {
        message: 'Payload de dashboard inválido.',
      });
      const profile = resolveUserProfile(auth);
      const now = context.clock().toISOString();
      const visibility = payload.visibility ?? 'PRIVATE';
      const dashboard: DashboardDefinition = {
        id: randomUUID(),
        name: payload.name,
        description: payload.description,
        cards: payload.cards,
        visibility,
        team: payload.team ?? profile.team,
        ownerName: profile.name,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
      };

      await context.getObjectRepository().put({
        userId: auth.userId,
        type: 'dashboard',
        id: dashboard.id,
        value: dashboard,
        shared: isShared(visibility),
      });
      context.logger.info('dashboard_saved', {
        correlationId: req.correlationId,
        userId: auth.userId,
        operation: 'CREATE_DASHBOARD',
        status: 'created',
        dashboardId: dashboard.id,
      });

      res.status(201).json({ dashboard: { ...dashboard, access: 'OWNER', isFavorite: false } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const repository = context.getObjectRepository();
      const { persisted, access } = await resolveVisibleObject<DashboardDefinition>(
        repository,
        'dashboard',
        String(req.params.id),
        auth,
        dashboardSharing,
        'Dashboard not found.',
      );
      const favorite = await repository.get(auth.userId, 'favorite', favoriteId(persisted.id));
      const view = await toDashboardView(context, persisted.value, access, Boolean(favorite));
      const analyses = Object.fromEntries(await loadCardAnalyses(context, persisted.value));

      res.json({ dashboard: view, analyses });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', requireRoles('admin', 'analyst'), async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const { persisted, access } = await resolveVisibleObject<DashboardDefinition>(
        context.getObjectRepository(),
        'dashboard',
        String(req.params.id),
        auth,
        dashboardSharing,
        'Dashboard not found.',
      );
      assertCanEdit(access, 'Você tem acesso somente leitura a este dashboard.');
      const payload = parseWithZod(dashboardPayloadSchema, req.body, {
        message: 'Payload de dashboard inválido.',
      });
      const current = persisted.value;
      const visibility =
        access === 'OWNER'
          ? (payload.visibility ?? current.visibility ?? 'PRIVATE')
          : (current.visibility ?? 'PRIVATE');
      const dashboard: DashboardDefinition = {
        ...current,
        name: payload.name,
        description: payload.description,
        cards: payload.cards,
        visibility,
        team: access === 'OWNER' ? (payload.team ?? current.team) : current.team,
        updatedAt: context.clock().toISOString(),
      };

      await context.getObjectRepository().put({
        userId: persisted.userId,
        type: 'dashboard',
        id: dashboard.id,
        value: dashboard,
        shared: isShared(visibility),
      });
      context.logger.info('dashboard_saved', {
        correlationId: req.correlationId,
        userId: auth.userId,
        operation: 'CREATE_DASHBOARD',
        status: 'updated',
        dashboardId: dashboard.id,
      });

      res.json({ dashboard: { ...dashboard, access } });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id/favorite', async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const repository = context.getObjectRepository();
      const { persisted } = await resolveVisibleObject<DashboardDefinition>(
        repository,
        'dashboard',
        String(req.params.id),
        auth,
        dashboardSharing,
        'Dashboard not found.',
      );
      const { favorite } = parseWithZod(favoritePayloadSchema, req.body, {
        message: 'Payload de favorito inválido.',
      });
      const id = favoriteId(persisted.id);

      if (favorite) {
        await repository.put({
          userId: auth.userId,
          type: 'favorite',
          id,
          value: { targetId: persisted.id, targetType: 'dashboard' },
        });
      } else {
        await repository.delete(auth.userId, 'favorite', id);
      }

      res.json({ dashboardId: persisted.id, isFavorite: favorite });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', requireRoles('admin', 'analyst'), async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const { persisted, access } = await resolveVisibleObject<DashboardDefinition>(
        context.getObjectRepository(),
        'dashboard',
        String(req.params.id),
        auth,
        dashboardSharing,
        'Dashboard not found.',
      );
      if (access !== 'OWNER' && auth.role !== 'admin') {
        throw new ForbiddenError('Somente quem criou o dashboard pode excluí-lo.');
      }
      await context.getObjectRepository().delete(persisted.userId, 'dashboard', persisted.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
