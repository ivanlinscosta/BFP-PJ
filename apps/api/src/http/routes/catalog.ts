import { z } from 'zod';
import { Router } from 'express';
import type { BusinessDomain, MediaCampaign, Product } from '@bfp/domain';
import {
  BUSINESS_GLOSSARY,
  DATA_PRODUCT_CATALOG,
  buildLineage,
  compatibility,
  datasetForDimension,
  datasetsForMetric,
  getDataProductForMetric,
  getDimensionDefinition,
  getMetricDefinition,
  listDimensionDefinitions,
  listMetricDefinitions,
  resolveDimensionValueLabel,
} from '@bfp/semantic-layer';
import { NotFoundError } from '@api/common/errors';
import { getAllowedDomains } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import { buildDataProductQualityCatalog } from '@api/http/qualitySummary';
import { matchesSearchQuery } from '@api/http/textSearch';

const catalogQuerySchema = z.object({
  q: z.string().trim().optional(),
});

function domainAllowed(domain: BusinessDomain, allowedDomains: readonly BusinessDomain[] | ['*']) {
  return (
    allowedDomains[0] === '*' || (allowedDomains as readonly BusinessDomain[]).includes(domain)
  );
}

export function createCatalogRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt);

  router.get('/metrics', (req, res, next) => {
    try {
      const { q } = parseWithZod(catalogQuerySchema, req.query);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const items = listMetricDefinitions()
        .filter((metric) => domainAllowed(metric.domain, allowedDomains))
        .filter((metric) =>
          matchesSearchQuery(
            [
              metric.id,
              metric.name,
              metric.shortName,
              metric.description,
              metric.businessDefinition,
              metric.formula,
              ...metric.tags,
            ],
            q,
          ),
        );

      res.json({
        items: items.map((metric) => ({ ...metric, datasets: datasetsForMetric(metric.id) })),
        total: items.length,
        query: q ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/metrics/:metricId', async (req, res, next) => {
    try {
      const metric = getMetricDefinition(req.params.metricId);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      if (!metric || !domainAllowed(metric.domain, allowedDomains)) {
        throw new NotFoundError('Métrica não encontrada no catálogo.');
      }

      const dataProduct = getDataProductForMetric(metric.id);
      const qualityCatalog = await buildDataProductQualityCatalog(context);
      const productQuality = qualityCatalog.find((item) => item.id === dataProduct?.id);
      const compatibleDimensions = listDimensionDefinitions()
        .filter((dimension) => dimension.type !== 'date' && compatibility(metric.id, dimension.id))
        .filter((dimension) => domainAllowed(dimension.domain, allowedDomains))
        .sort(
          (left, right) =>
            (left.libraryOrder ?? 99) - (right.libraryOrder ?? 99) ||
            left.ordering - right.ordering,
        )
        .map((dimension) => ({ id: dimension.id, label: dimension.label }));
      const supportsMonth = listDimensionDefinitions().some(
        (dimension) => dimension.type === 'date' && compatibility(metric.id, dimension.id),
      );
      const numerator =
        metric.aggregation === 'RATIO' ? getMetricDefinition(metric.numerator) : undefined;
      const denominator =
        metric.aggregation === 'RATIO' ? getMetricDefinition(metric.denominator) : undefined;

      res.json({
        metric: { ...metric, datasets: datasetsForMetric(metric.id) },
        calculation:
          numerator && denominator
            ? {
                kind: 'RATIO',
                numerator: {
                  id: numerator.id,
                  label:
                    numerator.id === 'converted_leads' ? 'Contas abertas' : numerator.shortName,
                },
                denominator: {
                  id: denominator.id,
                  label: denominator.id === 'leads' ? 'Leads elegíveis' : denominator.shortName,
                },
                multiplier: metric.format === 'percent' ? 100 : 1,
              }
            : { kind: metric.aggregation, expression: metric.formula },
        compatibleDimensions: supportsMonth
          ? [...compatibleDimensions, { id: 'month', label: 'Mês' }]
          : compatibleDimensions,
        dataProduct: dataProduct
          ? {
              id: dataProduct.id,
              name: dataProduct.name,
              owner: dataProduct.owner,
              goldDataset: dataProduct.goldDataset,
              goldTable: dataProduct.goldTable,
              businessSources: dataProduct.businessSources,
            }
          : null,
        trust: {
          owner: metric.owner,
          lastLoadedAt: productQuality?.freshness.lastLoadedAt ?? null,
          freshnessMinutes: productQuality?.freshness.minutes ?? null,
          sloMinutes: dataProduct?.freshnessSLOMinutes ?? metric.freshnessSLOMinutes,
          qualityRatio: productQuality?.qualityRatio ?? null,
          qualityStatus: productQuality?.quality.status ?? null,
        },
        lineage: {
          stages: [
            {
              kind: 'SOURCES',
              label: 'Fontes de negócio',
              value: (dataProduct?.businessSources ?? [metric.source]).join(' + '),
            },
            {
              kind: 'GOLD',
              label: 'Dados consolidados',
              value: dataProduct?.goldDataset ?? metric.source,
            },
            { kind: 'METRIC', label: 'Métrica oficial', value: metric.shortName },
            { kind: 'USAGE', label: 'Uso no negócio', value: 'Análises / Audiências' },
          ],
          graph: buildLineage({ metricIds: [metric.id] }),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/dimensions/:dimensionId/values', async (req, res, next) => {
    try {
      const dimension = getDimensionDefinition(req.params.dimensionId);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      if (!dimension || !domainAllowed(dimension.domain, allowedDomains)) {
        throw new NotFoundError('Dimensão não encontrada no catálogo.');
      }
      if (dimension.sensitivity === 'PII' || dimension.type === 'date') {
        res.json({ items: [], total: 0 });
        return;
      }

      const repository = context.getDatasetRepository();
      const source = dimension.sourceFields[0]!;
      let entries: Array<{ value: string; label: string }>;

      if (dimension.id === 'product' || dimension.id === 'product_category') {
        const products = await repository.listByType<Product>('product');
        entries = products.map((product) =>
          dimension.id === 'product'
            ? { value: product.name, label: product.name }
            : {
                value: product.category,
                label: resolveDimensionValueLabel(dimension.id, product.category),
              },
        );
      } else if (dimension.id === 'acquisition_campaign') {
        const campaigns = await repository.listByType<MediaCampaign>('campaign');
        entries = campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }));
      } else {
        const records = await repository.listByType(source.entityType);
        entries = records
          .map((record) => (record as unknown as Record<string, unknown>)[source.field])
          .filter((value) => value !== null && value !== undefined && value !== '')
          .map((value) => ({
            value: String(value),
            label: resolveDimensionValueLabel(dimension.id, value),
          }));
      }

      const unique = [...new Map(entries.map((entry) => [entry.value, entry])).values()]
        .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'))
        .slice(0, 200);
      res.json({ items: unique, total: unique.length });
    } catch (error) {
      next(error);
    }
  });

  router.get('/dimensions', (req, res, next) => {
    try {
      const { q } = parseWithZod(catalogQuerySchema, req.query);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const items = listDimensionDefinitions()
        .filter((dimension) => domainAllowed(dimension.domain, allowedDomains))
        .filter((dimension) =>
          matchesSearchQuery(
            [dimension.id, dimension.label, dimension.name, dimension.description],
            q,
          ),
        );

      res.json({
        items: items.map((dimension) => ({
          ...dimension,
          dataset: datasetForDimension(dimension.id),
        })),
        total: items.length,
        query: q ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/glossary', (req, res, next) => {
    try {
      const { q } = parseWithZod(catalogQuerySchema, req.query);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const items = BUSINESS_GLOSSARY.filter((term) =>
        domainAllowed(term.domain, allowedDomains),
      ).filter((term) =>
        matchesSearchQuery(
          [
            term.id,
            term.term,
            term.definition,
            term.owner,
            ...term.synonyms,
            ...term.relatedMetricIds,
            ...term.relatedDimensionIds,
          ],
          q,
        ),
      );

      res.json({ items, total: items.length, query: q ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.get('/data-products', (req, res, next) => {
    try {
      const { q } = parseWithZod(catalogQuerySchema, req.query);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const items = DATA_PRODUCT_CATALOG.filter((product) =>
        domainAllowed(product.domain, allowedDomains),
      ).filter((product) =>
        matchesSearchQuery(
          [product.id, product.name, product.description, product.owner, product.domain],
          q,
        ),
      );

      res.json({ items, total: items.length, query: q ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.get('/lineage', (req, res, next) => {
    try {
      const { q } = parseWithZod(catalogQuerySchema, req.query);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const allowedMetrics = listMetricDefinitions().filter((metric) =>
        domainAllowed(metric.domain, allowedDomains),
      );
      const filteredMetricIds = allowedMetrics
        .filter((metric) =>
          matchesSearchQuery(
            [
              metric.id,
              metric.name,
              metric.shortName,
              metric.description,
              metric.businessDefinition,
            ],
            q,
          ),
        )
        .map((metric) => metric.id);

      const graph = buildLineage(
        filteredMetricIds.length > 0 || q ? { metricIds: filteredMetricIds } : undefined,
      );
      res.json({
        graph,
        metricCount: filteredMetricIds.length || allowedMetrics.length,
        query: q ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/quality', async (req, res, next) => {
    try {
      const { q } = parseWithZod(catalogQuerySchema, req.query);
      const allowedDomains = getAllowedDomains(req.auth!.role);
      const items = (await buildDataProductQualityCatalog(context))
        .filter((product) => domainAllowed(product.domain, allowedDomains))
        .filter((product) =>
          matchesSearchQuery([product.id, product.name, product.description, product.domain], q),
        );

      res.json({ items, total: items.length, query: q ?? null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
