import { Router } from 'express';
import type { BusinessDomain } from '@bfp/domain';
import { getAllowedDomains } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import type { ApiContext } from '@api/http/context';
import { buildDataProductQualityCatalog } from '@api/http/qualitySummary';

function domainAllowed(domain: BusinessDomain, allowedDomains: readonly BusinessDomain[] | ['*']) {
  return (
    allowedDomains[0] === '*' || (allowedDomains as readonly BusinessDomain[]).includes(domain)
  );
}

/** Business-facing governance surface: data products, owners, freshness, quality and SLO. */
export function createGovernanceRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt);

  router.get('/freshness', async (_req, res, next) => {
    try {
      const lastLoadedAt = await context.getDataLoadedAt();
      res.json({
        lastLoadedAt,
        minutes: Math.max(
          0,
          Math.round((context.clock().getTime() - new Date(lastLoadedAt).getTime()) / 60_000),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/data-products', async (req, res, next) => {
    try {
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const items = (await buildDataProductQualityCatalog(context))
        .filter((product) => domainAllowed(product.domain, allowedDomains))
        .map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          domain: product.domain,
          owner: product.owner,
          goldDataset: product.goldDataset,
          goldTable: product.goldTable,
          businessSources: product.businessSources,
          metricIds: product.metricIds,
          freshness: product.freshness,
          sloMinutes: product.freshnessSLOMinutes,
          qualityThreshold: product.qualityThreshold,
          qualityRatio: product.qualityRatio,
          measures: product.measures,
          score: product.quality.score,
          status: product.quality.status,
          openIncidentCount: product.openIncidentCount,
          records: product.sourceStats.reduce((sum, entry) => sum + entry.count, 0),
        }));

      res.json({ items, total: items.length });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
