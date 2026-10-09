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
  datasetForDimension,
  datasetsForMetric,
  MESH_DATASET_BY_ID,
  type MeshDatasetId,
} from '@bfp/semantic-layer';
import { getAllowedDomains } from '@api/auth/rbac';
import type { AuthenticatedUser } from '@api/auth/types';
import { ApiError, NotFoundError, ValidationError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';
import { buildCustomer360 } from '@api/http/customer360';
import { buildDataProductQualityCatalog } from '@api/http/qualitySummary';
import { matchesSearchQuery } from '@api/http/textSearch';
import { executeGovernedQuery, type GovernedQueryResult } from '@api/services/analyticsService';
import { previewMeshDataset } from '@api/services/mesh/preview';

/** Maximum rows returned to a model; numbers beyond this are summarized by insights. */
export const MAX_TOOL_ROWS = 50;

/** Execution context of a governed tool call. */
export interface ToolContext {
  context: ApiContext;
  auth: AuthenticatedUser;
  correlationId?: string;
  /** Every governed query executed in the turn, used to ground the final answer. */
  queries: Array<{ spec: AnalysisSpec; result: GovernedQueryResult }>;
  /**
   * Bases the user selected for the conversation. When present, every tool only sees and queries
   * these bases (the model cannot answer from data the user did not choose).
   */
  datasets?: MeshDatasetId[];
  /** Row samples read in the turn (they also ground the answer). */
  samples?: number;
  /** User question of the turn (only used to honor an explicit request for a table). */
  prompt?: string;
}

/** A question needs a base the user did not select. */
const previewInput = z.object({
  datasetId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(20).default(10),
  where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/**
 * Models tend to ask for TABLE on every query; the answer card then shows no chart. Unless the
 * user asked for a table, the visualization goes back to AUTO (the chart that fits the result).
 */
export function withChartVisualization(spec: AnalysisSpec, prompt?: string): AnalysisSpec {
  const wantsTable = /\btabela\b|\btable\b/i.test(prompt ?? '');
  const type = spec.visualization.type;
  if (wantsTable || (type !== 'TABLE' && type !== 'KPI')) return spec;
  if (type === 'KPI' && spec.dimensions.length === 0) return spec;
  return { ...spec, visualization: { ...spec.visualization, type: 'AUTO' } };
}

export class DatasetScopeError extends ApiError {
  constructor(message: string) {
    super(422, 'dataset_scope', message);
  }
}

function datasetName(id: string) {
  return MESH_DATASET_BY_ID.get(id as MeshDatasetId)?.name ?? id;
}

/** True when the metric can be computed only with the selected bases. */
function metricInScope(metricId: string, scope?: MeshDatasetId[]) {
  return !scope || datasetsForMetric(metricId).every((dataset) => scope.includes(dataset));
}

function dimensionInScope(dimensionId: string, scope?: MeshDatasetId[]) {
  if (!scope) return true;
  const owner = datasetForDimension(dimensionId);
  return !owner || scope.includes(owner);
}

/** Rejects specs that need bases outside the selection, naming what is missing. */
export function assertSpecInScope(spec: AnalysisSpec, scope?: MeshDatasetId[]) {
  if (!scope) return;
  const needed = withRequiredDatasets(spec).datasets ?? [];
  const missing = needed.filter((dataset) => !scope.includes(dataset as MeshDatasetId));
  if (missing.length > 0) {
    throw new DatasetScopeError(
      `Para responder, seria preciso usar ${missing.map(datasetName).join(', ')}, que não está entre as bases selecionadas (${scope.map(datasetName).join(', ')}). Selecione essa base ou reformule a pergunta.`,
    );
  }
}

/** Governed tool exposed to AI providers. */
export interface GovernedTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute(input: unknown, toolContext: ToolContext): Promise<unknown>;
}

export function domainAllowed(auth: AuthenticatedUser, domain: BusinessDomain) {
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
    name: 'describeSelectedBases',
    description:
      'Descreve as bases de dados selecionadas pelo usuário: o que contêm, colunas, métricas certificadas e dimensões que podem ser usadas em runAnalyticsQuery. Chame primeiro.',
    inputSchema: emptyInput,
    async execute(_input, { auth, datasets }) {
      const scope = datasets ?? [];
      return scope
        .map((id) => MESH_DATASET_BY_ID.get(id))
        .filter((dataset) => dataset && domainAllowed(auth, dataset.domain))
        .map((dataset) => ({
          id: dataset!.id,
          name: dataset!.name,
          description: dataset!.description,
          grain: dataset!.grain,
          columns: dataset!.columns.map((column) => ({
            name: column.name,
            type: column.type,
            description: column.description,
          })),
          metrics: listMetricDefinitions()
            .filter((metric) => datasetsForMetric(metric.id).includes(dataset!.id))
            .filter((metric) => metricInScope(metric.id, datasets))
            .map((metric) => ({
              id: metric.id,
              name: metric.shortName,
              definition: metric.businessDefinition,
              format: metric.format,
            })),
          dimensions: listDimensionDefinitions()
            .filter((dimension) => datasetForDimension(dimension.id) === dataset!.id)
            .filter((dimension) => dimension.sensitivity !== 'PII')
            .map((dimension) => ({
              id: dimension.id,
              name: dimension.label,
              type: dimension.type,
            })),
        }));
    },
  },
  {
    name: 'previewDatasetRows',
    description:
      'Lê uma amostra de até 20 linhas de uma base selecionada (colunas governadas, sem dados pessoais), opcionalmente filtrada por igualdade em colunas (where: {"segment": "Varejo"}). Use para exemplos de registros; para totais, contagens e comparações use runAnalyticsQuery.',
    inputSchema: previewInput,
    async execute(input, toolContext) {
      const { datasetId, limit, where } = previewInput.parse(input);
      const dataset = MESH_DATASET_BY_ID.get(datasetId as MeshDatasetId);
      if (!dataset || !domainAllowed(toolContext.auth, dataset.domain)) {
        throw new NotFoundError('Base de dados não encontrada.');
      }
      if (toolContext.datasets && !toolContext.datasets.includes(dataset.id)) {
        throw new DatasetScopeError(`A base ${dataset.name} não está entre as bases selecionadas.`);
      }
      const filters = Object.entries(where ?? {});
      const unknown = filters.find(([column]) => !dataset.columns.some((c) => c.name === column));
      if (unknown) {
        throw new ApiError(
          422,
          'unknown_column',
          `A coluna ${unknown[0]} não existe em ${dataset.name}. Colunas: ${dataset.columns.map((c) => c.name).join(', ')}.`,
        );
      }
      // Filters run over the preview window (up to 100 rows), never over the whole table.
      const preview = await previewMeshDataset(
        toolContext.context,
        toolContext.auth,
        dataset.id,
        filters.length ? 100 : limit,
      );
      const normalize = (value: unknown) =>
        String(value ?? '')
          .trim()
          .toLowerCase();
      const rows = preview.rows
        .filter((row) =>
          filters.every(([column, value]) => normalize(row[column]) === normalize(value)),
        )
        .slice(0, limit);
      toolContext.samples = (toolContext.samples ?? 0) + rows.length;
      return {
        dataset: dataset.name,
        columns: preview.columns.map((column) => column.name),
        rows,
        note: filters.length
          ? `Filtro aplicado sobre as primeiras ${preview.rows.length} linhas da base; para contagens use runAnalyticsQuery.`
          : undefined,
      };
    },
  },
  {
    name: 'getAvailableMetrics',
    description: 'Lista as métricas governadas disponíveis para o perfil do usuário.',
    inputSchema: emptyInput,
    async execute(_input, { auth, datasets }) {
      return listMetricDefinitions()
        .filter((metric) => domainAllowed(auth, metric.domain))
        .filter((metric) => metricInScope(metric.id, datasets))
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
    async execute(_input, { auth, datasets }) {
      return listDimensionDefinitions()
        .filter((dimension) => domainAllowed(auth, dimension.domain))
        .filter((dimension) => dimensionInScope(dimension.id, datasets))
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
      const spec = withChartVisualization(
        withRequiredDatasets(parsed.data.analysisSpec),
        toolContext.prompt,
      );
      assertSpecInScope(spec, toolContext.datasets);
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
