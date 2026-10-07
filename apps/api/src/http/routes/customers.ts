import { z } from 'zod';
import { Router } from 'express';
import {
  COMPANY_SIZES,
  COMPANY_STATUSES,
  type Company,
  type CompanyProduct,
  type Conversation,
  type CRMInteraction,
  type DigitalEvent,
  type Product,
} from '@bfp/domain';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import { buildCustomer360 } from '@api/http/customer360';
import { matchesSearchQuery } from '@api/http/textSearch';
import { FullStoryClient, resolveFullStoryKey } from '@api/services/integrations/fullstory';
import type { DatasetRepository } from '@api/repositories/types';

const customerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().optional(),
  size: z.enum(COMPANY_SIZES).optional(),
  segment: z.string().trim().min(1).optional(),
  state: z.string().trim().length(2).optional(),
  status: z.enum(COMPANY_STATUSES).optional(),
  product: z.string().trim().min(1).optional(),
});

interface CustomerIndexEntry {
  products: string[];
  lastActivityAt: string | null;
}

interface CustomerIndex {
  loadedAt: number;
  companies: Company[];
  entries: Map<string, CustomerIndexEntry>;
  productNames: string[];
}

const INDEX_TTL_MS = 5 * 60 * 1000;
const indexCache = new WeakMap<DatasetRepository, CustomerIndex>();

async function loadCustomerIndex(repository: DatasetRepository, nowMs: number) {
  const cached = indexCache.get(repository);
  if (cached && nowMs - cached.loadedAt < INDEX_TTL_MS) {
    return cached;
  }

  const [companies, companyProducts, products, crm, conversations, digitalEvents] =
    await Promise.all([
      repository.listByType<Company>('company'),
      repository.listByType<CompanyProduct>('companyProduct'),
      repository.listByType<Product>('product'),
      repository.listByType<CRMInteraction>('crmInteraction'),
      repository.listByType<Conversation>('conversation'),
      repository.listByType<DigitalEvent>('digitalEvent'),
    ]);
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const entries = new Map<string, CustomerIndexEntry>(
    companies.map((company) => [company.id, { products: [], lastActivityAt: null }]),
  );
  const touch = (companyId: string, at: string) => {
    const entry = entries.get(companyId);
    if (entry && (!entry.lastActivityAt || at > entry.lastActivityAt)) {
      entry.lastActivityAt = at;
    }
  };

  for (const item of companyProducts) {
    const name = productNameById.get(item.productId);
    if (name && item.status !== 'CANCELLED') {
      entries.get(item.companyId)?.products.push(name);
    }
    touch(item.companyId, item.contractedAt);
  }
  crm.forEach((item) => touch(item.companyId, item.occurredAt));
  conversations.forEach((item) => touch(item.companyId, item.startedAt));
  digitalEvents.forEach((item) => touch(item.companyId, item.occurredAt));
  companies.forEach((company) =>
    touch(
      company.id,
      company.activationDate ??
        company.onboardingCompletedAt ??
        company.accountOpenedAt ??
        company.leadCreatedAt,
    ),
  );

  const index: CustomerIndex = {
    loadedAt: nowMs,
    companies: [...companies].sort((left, right) =>
      left.tradeName.localeCompare(right.tradeName, 'pt-BR'),
    ),
    entries,
    productNames: products.map((product) => product.name).sort(),
  };
  indexCache.set(repository, index);
  return index;
}

function distinct(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

export function createCustomersRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.use(verifyJwt);

  router.get('/', async (req, res, next) => {
    try {
      const { page, pageSize, q, size, segment, state, status, product } = parseWithZod(
        customerListQuerySchema,
        req.query,
      );
      const index = await loadCustomerIndex(
        context.getDatasetRepository(),
        context.clock().getTime(),
      );
      const normalizedProduct = product?.toLocaleLowerCase('pt-BR');
      const filtered = index.companies.filter((company) => {
        const entry = index.entries.get(company.id);
        return (
          (!size || company.companySize === size) &&
          (!segment || company.segment === segment) &&
          (!state || company.state === state) &&
          (!status || company.status === status) &&
          (!normalizedProduct ||
            (entry?.products ?? []).some((name) =>
              name.toLocaleLowerCase('pt-BR').includes(normalizedProduct),
            )) &&
          matchesSearchQuery(
            [
              company.id,
              company.tradeName,
              company.legalName,
              company.cnpjMasked,
              company.segment,
              company.industry,
              company.city,
              company.state,
            ],
            q,
          )
        );
      });
      const startIndex = (page - 1) * pageSize;
      const items = filtered.slice(startIndex, startIndex + pageSize).map((company) => {
        const entry = index.entries.get(company.id);
        return {
          ...company,
          productsCount: entry?.products.length ?? 0,
          lastActivityAt: entry?.lastActivityAt ?? null,
        };
      });

      res.json({
        items,
        pagination: {
          page,
          pageSize,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
        },
        facets: {
          sizes: [...COMPANY_SIZES],
          segments: distinct(index.companies.map((company) => company.segment)),
          states: distinct(index.companies.map((company) => company.state)),
          statuses: [...COMPANY_STATUSES],
          products: index.productNames,
        },
        query: q ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const customer = await buildCustomer360(context.getDatasetRepository(), req.params.id);
      const apiKey = await resolveFullStoryKey(context.config).catch(() => null);
      // FullStory identifies visitors with FS.identify(<company_id>): sessions are fetched live.
      const sessions = apiKey
        ? await new FullStoryClient(apiKey).listSessions(customer.company.id, 10).catch(() => null)
        : null;
      res.json({
        customer: {
          ...customer,
          fullstory: {
            status: !apiKey ? 'not_configured' : sessions ? 'ok' : 'error',
            sessions: sessions ?? [],
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
