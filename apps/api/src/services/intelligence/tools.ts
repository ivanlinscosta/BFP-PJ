import { z } from 'zod';
import {
  buildAudienceProfiles,
  previewAudience,
  type AnalyticsInsight,
} from '@bfp/analytics-engine';
import type { AnalysisSpec, BusinessDomain, Company, CompanyProduct, Product } from '@bfp/domain';
import { analysisSpecSchema, audienceRuleGroupSchema } from '@bfp/schemas';
import {
  BUSINESS_GLOSSARY,
  getDataProductForMetric,
  getMetricDefinition,
  listDimensionDefinitions,
  listMetricDefinitions,
  resolveLineage,
  withRequiredDatasets,
} from '@bfp/semantic-layer';
import { getAllowedDomains } from '@api/auth/rbac';
import type { AuthenticatedUser } from '@api/auth/types';
import { NotFoundError, ValidationError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';
import { buildCustomer360 } from '@api/http/customer360';
import { buildDataProductQualityCatalog } from '@api/http/qualitySummary';
import { matchesSearchQuery } from '@api/http/textSearch';
import { executeGovernedQuery, type GovernedQueryResult } from '@api/services/analyticsService';

/** Maximum rows returned to a model; numbers beyond this are summarized by insights. */
export const MAX_TOOL_ROWS = 50;

/** Execution context of a governed tool call. */
export interface ToolContext {
  context: ApiContext;
  auth: AuthenticatedUser;
  correlationId?: string;
  /** Every governed query executed in the turn, used to ground the final answer. */
  queries: Array<{ spec: AnalysisSpec; result: GovernedQueryResult }>;
}

/** Governed tool exposed to AI providers. */
export interface GovernedTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute(input: unknown, toolContext: ToolContext): Promise<unknown>;
}

function domainAllowed(auth: AuthenticatedUser, domain: BusinessDomain) {
  const allowed = getAllowedDomains(auth.role);
  return allowed[0] === '*' || (allowed as readonly BusinessDomain[]).includes(domain);
}

/** Compact, model-friendly view of a governed query result. */
export function summarizeQuery(result: GovernedQueryResult) {
  return {
    columns: result.columns.map((column) => ({
      key: column.key,
      label: column.label,
      format: column.format,
    })),
    rows: result.rows
      .slice(0, MAX_TOOL_ROWS)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            result.valueLabels[key]?.[String(value ?? '')] ?? value,
          ]),
        ),
      ),
    truncated: result.rows.length > MAX_TOOL_ROWS,
    insights: result.insights.map((insight: AnalyticsInsight) => ({
      type: insight.type,
      title: insight.title,
      evidence: insight.evidence,
    })),
    freshness: result.metadata.freshness,
  };
}

const emptyInput = z.object({}).default({});

export const GOVERNED_TOOLS: GovernedTool[] = [
  {
    name: 'getAvailableMetrics',
    description: 'Lista as métricas governadas disponíveis para o perfil do usuário.',
    inputSchema: emptyInput,
    async execute(_input, { auth }) {
      return listMetricDefinitions()
        .filter((metric) => domainAllowed(auth, metric.domain))
        .map((metric) => ({
          id: metric.id,
          name: metric.shortName,
          format: metric.format,
          certification: metric.certificationStatus,
        }));
    },
  },
  {
    name: 'getAvailableDimensions',
    description: 'Lista as dimensões governadas disponíveis para o perfil do usuário.',
    inputSchema: emptyInput,
    async execute(_input, { auth }) {
      return listDimensionDefinitions()
        .filter((dimension) => domainAllowed(auth, dimension.domain))
        .filter((dimension) => dimension.sensitivity !== 'PII')
        .map((dimension) => ({ id: dimension.id, name: dimension.label, type: dimension.type }));
    },
  },
  {
    name: 'getMetricDefinition',
    description: 'Retorna a definição de negócio, fórmula, owner e dimensões de uma métrica.',
    inputSchema: z.object({ metricId: z.string().trim().min(1) }),
    async execute(input, { auth }) {
      const { metricId } = z.object({ metricId: z.string() }).parse(input);
      const metric = getMetricDefinition(metricId);
      if (!metric || !domainAllowed(auth, metric.domain)) {
        throw new NotFoundError('Métrica não encontrada no catálogo governado.');
      }
      return {
        id: metric.id,
        name: metric.shortName,
        businessDefinition: metric.businessDefinition,
        formula: metric.formula,
        owner: metric.owner,
        certification: metric.certificationStatus,
        allowedDimensions: metric.allowedDimensions,
      };
    },
  },
  {
    name: 'runAnalyticsQuery',
    description:
      'Executa uma AnalysisSpec validada pela camada semântica e retorna agregados autorizados e insights determinísticos. Única fonte de números.',
    inputSchema: z.object({ analysisSpec: analysisSpecSchema }),
    async execute(input, toolContext) {
      const parsed = z.object({ analysisSpec: analysisSpecSchema }).safeParse(input);
      if (!parsed.success) {
        throw new ValidationError('AnalysisSpec inválida para runAnalyticsQuery.');
      }
      // The assistant selects the mesh bases it needs and reports them in the answer basis.
      const spec = withRequiredDatasets(parsed.data.analysisSpec);
      const result = await executeGovernedQuery(
        toolContext.context,
        toolContext.auth,
        spec,
        toolContext.correlationId,
      );
      toolContext.queries.push({ spec, result });
      return summarizeQuery(result);
    },
  },
  {
    name: 'getCustomer360',
    description: 'Retorna um resumo agregado (sem PII) de uma empresa PJ sintética.',
    inputSchema: z.object({ companyId: z.string().trim().min(1) }),
    async execute(input, { context, auth }) {
      if (!domainAllowed(auth, 'customer360')) {
        throw new NotFoundError('Cliente não disponível para o seu perfil.');
      }
      const { companyId } = z.object({ companyId: z.string() }).parse(input);
      const customer = await buildCustomer360(context.getDatasetRepository(), companyId);
      return {
        company: {
          id: customer.company.id,
          tradeName: customer.company.tradeName,
          segment: customer.company.segment,
          companySize: customer.company.companySize,
          state: customer.company.state,
          status: customer.company.status,
        },
        summary: customer.summary,
        journey: customer.journey.map((item) => ({ title: item.title, at: item.occurredAt })),
      };
    },
  },
  {
    name: 'searchBusinessGlossary',
    description: 'Busca termos de negócio governados no glossário.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(120) }),
    async execute(input, { auth }) {
      const { query } = z.object({ query: z.string() }).parse(input);
      return BUSINESS_GLOSSARY.filter((term) => domainAllowed(auth, term.domain))
        .filter((term) => matchesSearchQuery([term.term, term.definition, ...term.synonyms], query))
        .slice(0, 5)
        .map((term) => ({ id: term.id, term: term.term, definition: term.definition }));
    },
  },
  {
    name: 'createAudiencePreview',
    description: 'Calcula a prévia agregada de uma audiência a partir de grupos de regras E/OU.',
    inputSchema: z.object({ filterGroups: audienceRuleGroupSchema }),
    async execute(input, { context }) {
      const { filterGroups } = z.object({ filterGroups: audienceRuleGroupSchema }).parse(input);
      const repository = context.getDatasetRepository();
      const [companies, companyProducts, products] = await Promise.all([
        repository.listByType<Company>('company'),
        repository.listByType<CompanyProduct>('companyProduct'),
        repository.listByType<Product>('product'),
      ]);
      const preview = previewAudience(
        buildAudienceProfiles({ companies, companyProducts, products }),
        filterGroups,
        { freshness: await context.getDataLoadedAt(), sources: ['CRM', 'Onboarding'] },
      );
      return { size: preview.size, baseSize: preview.baseSize, share: preview.share };
    },
  },
  {
    name: 'getQualityStatus',
    description: 'Retorna freshness, qualidade e SLO dos produtos de dados.',
    inputSchema: emptyInput,
    async execute(_input, { context, auth }) {
      return (await buildDataProductQualityCatalog(context))
        .filter((product) => domainAllowed(auth, product.domain))
        .map((product) => ({
          name: product.name,
          owner: product.owner,
          freshnessMinutes: product.freshness.minutes,
          sloMinutes: product.freshnessSLOMinutes,
          quality: Number(product.qualityRatio.toFixed(4)),
          status: product.quality.status,
        }));
    },
  },
  {
    name: 'getLineage',
    description: 'Retorna a linhagem de uma métrica: fontes → Gold → métrica → uso.',
    inputSchema: z.object({ metricId: z.string().trim().min(1) }),
    async execute(input, { auth }) {
      const { metricId } = z.object({ metricId: z.string() }).parse(input);
      const metric = getMetricDefinition(metricId);
      if (!metric || !domainAllowed(auth, metric.domain)) {
        throw new NotFoundError('Métrica não encontrada no catálogo governado.');
      }
      const product = getDataProductForMetric(metricId);
      return {
        sources: product?.businessSources ?? [],
        gold: product?.goldDataset ?? null,
        metric: metric.shortName,
        graph: resolveLineage(metricId),
      };
    },
  },
];

/** Finds a governed tool by name; unknown tools are rejected by the caller. */
export function findGovernedTool(name: string) {
  return GOVERNED_TOOLS.find((tool) => tool.name === name);
}
