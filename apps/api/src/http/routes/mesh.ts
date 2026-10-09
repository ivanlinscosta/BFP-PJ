import { Router } from 'express';
import type { BusinessDomain } from '@bfp/domain';
import { listMetricDefinitions, datasetsForMetric } from '@bfp/semantic-layer';
import { getAllowedDomains, requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { NotFoundError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';
import { resolveFullStoryKey } from '@api/services/integrations/fullstory';
import { AtlanClient, resolveAtlanConnection } from '@api/services/integrations/atlan';
import { getMeshCatalog } from '@api/services/mesh/catalog';
import { previewMeshDataset } from '@api/services/mesh/preview';
import { MESH_DATASET_BY_ID, type MeshDatasetId } from '@bfp/semantic-layer';

function domainAllowed(domain: BusinessDomain, allowed: readonly BusinessDomain[] | ['*']) {
  return allowed[0] === '*' || (allowed as readonly BusinessDomain[]).includes(domain);
}

/** AWS data mesh catalog (Glue + Lake Formation + DataZone) enriched by Atlan. */
export function createMeshRouter(context: ApiContext) {
  const router = Router();
  router.use(createVerifyJwtMiddleware(context.config));

  router.get('/datasets', async (req, res, next) => {
    try {
      const catalog = await getMeshCatalog(context, { refresh: req.query.refresh === 'true' });
      const allowed = getAllowedDomains(req.auth!.role);
      const items = catalog.datasets
        .filter((dataset) => domainAllowed(dataset.domain, allowed))
        .map((dataset) => ({
          ...dataset,
          metricIds: listMetricDefinitions()
            .filter((metric) =>
              (datasetsForMetric(metric.id) as readonly string[]).includes(dataset.id),
            )
            .map((metric) => metric.id),
        }));
      res.json({
        items,
        total: items.length,
        sources: { mesh: catalog.source, datazone: catalog.datazone, atlan: catalog.atlan },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/datasets/:id', async (req, res, next) => {
    try {
      const catalog = await getMeshCatalog(context);
      const dataset = catalog.datasets.find((item) => item.id === req.params.id);
      if (!dataset || !domainAllowed(dataset.domain, getAllowedDomains(req.auth!.role))) {
        throw new NotFoundError('Base de dados não encontrada no data mesh.');
      }
      res.json({ dataset });
    } catch (error) {
      next(error);
    }
  });

  // Data preview of a base (up to 100 rows, governed columns only), with the same domain rules.
  router.get('/datasets/:id/preview', async (req, res, next) => {
    try {
      const id = String(req.params.id);
      const definition = MESH_DATASET_BY_ID.get(id as MeshDatasetId);
      if (!definition || !domainAllowed(definition.domain, getAllowedDomains(req.auth!.role))) {
        throw new NotFoundError('Base de dados não encontrada no data mesh.');
      }
      const limit = Number(req.query.limit ?? 100);
      const preview = await previewMeshDataset(
        context,
        req.auth!,
        id as MeshDatasetId,
        Number.isFinite(limit) ? limit : 100,
      );
      context.logger.info('dataset_preview', {
        operation: 'DATASET_PREVIEW',
        userId: req.auth!.userId,
        dataset: id,
        rows: preview.rows.length,
        source: preview.source,
      });
      res.json({ preview });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/** Status of the external integrations and admin actions (Atlan publication). */
export function createIntegrationsRouter(context: ApiContext) {
  const router = Router();
  router.use(createVerifyJwtMiddleware(context.config));

  router.get('/status', async (_req, res, next) => {
    try {
      const catalog = await getMeshCatalog(context);
      const fullstory = await resolveFullStoryKey(context.config).catch(() => null);
      res.json({
        mesh: {
          source: catalog.source,
          databasePrefix: context.config.mesh.databasePrefix,
          datasets: catalog.datasets.length,
          available: catalog.datasets.filter((dataset) => dataset.available).length,
        },
        datazone: catalog.datazone,
        atlan: catalog.atlan,
        atlanLinkedAssets: catalog.datasets.filter((dataset) => dataset.atlan).length,
        fullstory: fullstory ? 'configured' : 'not_configured',
        analyticsEngine: context.config.analyticsEngine,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/atlan/sync', requireRoles('admin'), async (req, res, next) => {
    try {
      const connection = await resolveAtlanConnection(context.config);
      if (!connection) {
        res.status(409).json({
          error: {
            code: 'atlan_not_configured',
            message: 'Configure a conexão com o Atlan antes de publicar.',
          },
        });
        return;
      }
      const published = await new AtlanClient(connection).upsertGlossaryTerms(
        listMetricDefinitions().map((metric) => ({
          name: metric.shortName,
          description: `${metric.businessDefinition} Fórmula: ${metric.formula}.`,
          certified: metric.certificationStatus === 'CERTIFIED',
          owner: metric.owner,
        })),
      );
      context.logger.info('atlan_sync', {
        correlationId: req.correlationId,
        userId: req.auth!.userId,
        operation: 'ATLAN_SYNC',
        status: 'success',
        published,
      });
      res.json({ published });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
