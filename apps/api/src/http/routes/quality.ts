import { Router } from 'express';
import type { QualityStatus } from '@bfp/domain';
import { requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import type { ApiContext } from '@api/http/context';
import { buildQualitySummary } from '@api/http/qualitySummary';

export function createQualityRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt, requireRoles('admin', 'analyst'));

  router.get('/summary', async (_req, res, next) => {
    try {
      const summary = await buildQualitySummary(context);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get('/status', async (_req, res, next) => {
    try {
      const items = await context.getDatasetRepository().listByType<QualityStatus>('qualityStatus');
      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  });

  router.get('/data-products', async (_req, res, next) => {
    try {
      const summary = await buildQualitySummary(context);
      res.json({ items: summary.dataProducts, total: summary.dataProducts.length });
    } catch (error) {
      next(error);
    }
  });

  router.get('/incidents', async (_req, res, next) => {
    try {
      const statuses = await context
        .getDatasetRepository()
        .listByType<QualityStatus>('qualityStatus');
      const items = statuses.flatMap((status) =>
        status.incidents.map((incident) => ({
          scopeId: status.scopeId,
          scopeType: status.scopeType,
          statusId: status.id,
          ...incident,
        })),
      );
      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
