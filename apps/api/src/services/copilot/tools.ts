import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { AnalyticsResult, BusinessDomain, MetricDefinition, AnalysisSpec } from '@bfp/domain';
import {
  BUSINESS_GLOSSARY,
  BUSINESS_TERM_BY_ID,
  DIMENSION_CATALOG,
  DIMENSION_DEFINITION_BY_ID,
  METRIC_CATALOG,
  METRIC_DEFINITION_BY_ID,
  listDimensionDefinitions,
  listMetricDefinitions,
  validateAnalysisSpec,
  withRequiredDatasets,
} from '@bfp/semantic-layer';
import {
  analysisMetadataSchema,
  comparisonSpecSchema,
  createAnalysisSpecSchema,
  createDimensionSelectionSchema,
  createMetricSelectionSchema,
  dateRangeSpecSchema,
  filterConditionSchema,
  sortSpecSchema,
  visualizationSpecSchema,
} from '@bfp/schemas';
import { z } from 'zod';
import { assertDomainAccess, getAllowedDomains } from '@api/auth/rbac';
import type { AuthenticatedUser } from '@api/auth/types';
import type { ApiContext } from '@api/http/context';
import { matchesSearchQuery } from '@api/http/textSearch';
import { COPILOT_MAX_MODEL_ROWS } from '@api/services/copilot/guardrails';
import type {
  CopilotCitations,
  CopilotResponse,
  CopilotToolName,
  CopilotToolSchema,
  SearchCatalogToolResult,
} from '@api/services/copilot/types';

const knownMetricIds = METRIC_CATALOG.map((metric) => metric.id);
const knownDimensionIds = DIMENSION_CATALOG.map((dimension) => dimension.id);

const runAnalysisInputSchema = createAnalysisSpecSchema({
  knownMetricIds,
  knownDimensionIds,
});
const runAnalysisInputJsonSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  metrics: z
    .array(
      createMetricSelectionSchema({
        knownMetricIds,
      }),
    )
    .min(1),
  dimensions: z
    .array(
      createDimensionSelectionSchema({
        knownDimensionIds,
      }),
    )
    .default([]),
  filters: z.array(filterConditionSchema).default([]),
  dateRange: dateRangeSpecSchema.optional(),
  comparison: comparisonSpecSchema.optional(),
  sorting: z.array(sortSpecSchema).optional(),
  limit: z.number().int().positive().optional(),
  visualization: visualizationSpecSchema,
  metadata: analysisMetadataSchema.optional(),
});
const searchCatalogInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(10).optional(),
});
const getGlossaryTermInputSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

function toToolInputSchema(schema: z.ZodType): Tool['input_schema'] {
  const jsonSchema = z.toJSONSchema(schema);
  const inputSchema: Tool['input_schema'] = { type: 'object' };

  if (typeof jsonSchema === 'object' && jsonSchema !== null && 'properties' in jsonSchema) {
    inputSchema.properties = jsonSchema.properties;
  }

  if (typeof jsonSchema === 'object' && jsonSchema !== null && 'required' in jsonSchema) {
    inputSchema.required = Array.isArray(jsonSchema.required) ? jsonSchema.required : null;
  }

  return inputSchema;
}

const COPILOT_TOOL_SURFACE: readonly CopilotToolSchema[] = [
  {
    name: 'run_analysis',
    description:
      'Executa uma AnalysisSpec governada, validada por catálogo e semantic layer, retornando colunas e linhas agregadas.',
    inputSchema: toToolInputSchema(runAnalysisInputJsonSchema),
  },
  {
    name: 'search_catalog',
    description: 'Busca métricas, dimensões e termos de negócio governados no catálogo semântico.',
    inputSchema: toToolInputSchema(searchCatalogInputSchema),
  },
  {
    name: 'get_glossary_term',
    description:
      'Retorna o detalhe de um termo de negócio, métrica ou dimensão governada a partir do id.',
    inputSchema: toToolInputSchema(getGlossaryTermInputSchema),
  },
] as const;

interface CopilotToolExecutionState {
  analysisResult?: AnalyticsResult;
  citations: {
    metricIds: Set<string>;
    dimensionIds: Set<string>;
    glossaryTermIds: Set<string>;
  };
  lastTool: CopilotToolName | null;
}

interface CopilotToolExecutionOptions {
  context: ApiContext;
  auth: AuthenticatedUser;
  input: unknown;
  state: CopilotToolExecutionState;
}

interface CopilotToolExecutionResult {
  content: string;
  isError?: boolean;
  terminalResponse?: CopilotResponse;
}

function domainAllowed(domain: BusinessDomain, allowedDomains: readonly BusinessDomain[] | ['*']) {
  return (
    allowedDomains[0] === '*' || (allowedDomains as readonly BusinessDomain[]).includes(domain)
  );
}

function appendUnique(target: Set<string>, values: readonly string[]) {
  for (const value of values) {
    target.add(value);
  }
}

function buildFriendlyValidationMessage(spec: AnalysisSpec) {
  const invalidMetric = spec.metrics.find((metric) => !METRIC_DEFINITION_BY_ID.has(metric.id));
  if (invalidMetric) {
    return `Não encontrei a métrica governada \`${invalidMetric.id}\`. Use apenas métricas do catálogo aprovado.`;
  }

  const invalidDimension = spec.dimensions.find(
    (dimension) => !DIMENSION_DEFINITION_BY_ID.has(dimension.id),
  );
  if (invalidDimension) {
    return `Não encontrei a dimensão governada \`${invalidDimension.id}\`. Use apenas dimensões do catálogo aprovado.`;
  }

  return 'A AnalysisSpec enviada não é válida dentro do catálogo governado.';
}

function buildBoundedAnalyticsResult(
  result: AnalyticsResult,
  requestedLimit?: number,
): AnalyticsResult {
  const rowCap = Math.min(requestedLimit ?? COPILOT_MAX_MODEL_ROWS, COPILOT_MAX_MODEL_ROWS);
  const rows = result.rows.slice(0, rowCap);
  const warnings = [...(result.metadata.warnings ?? [])];

  if (result.rows.length > rowCap) {
    warnings.push(`O Copilot recebeu apenas as primeiras ${rowCap} linhas desta análise.`);
  }

  return {
    ...result,
    rows,
    metadata: {
      ...result.metadata,
      warnings,
    },
  };
}

function buildSearchCatalogResult(
  auth: AuthenticatedUser,
  query: string,
  limit = 5,
): SearchCatalogToolResult {
  const allowedDomains = getAllowedDomains(auth.role);
  const metrics = listMetricDefinitions()
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
        query,
      ),
    )
    .slice(0, limit)
    .map((metric) => ({
      id: metric.id,
      name: metric.name,
      shortName: metric.shortName,
      description: metric.description,
      domain: metric.domain,
    }));

  const dimensions = listDimensionDefinitions()
    .filter((dimension) => domainAllowed(dimension.domain, allowedDomains))
    .filter((dimension) =>
      matchesSearchQuery([dimension.id, dimension.name, dimension.description], query),
    )
    .slice(0, limit)
    .map((dimension) => ({
      id: dimension.id,
      name: dimension.name,
      description: dimension.description,
      domain: dimension.domain,
    }));

  const glossary = BUSINESS_GLOSSARY.filter((term) => domainAllowed(term.domain, allowedDomains))
    .filter((term) =>
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
        query,
      ),
    )
    .slice(0, limit)
    .map((term) => ({
      id: term.id,
      term: term.term,
      definition: term.definition,
      domain: term.domain,
    }));

  return { metrics, dimensions, glossary };
}

function toCitations(state: CopilotToolExecutionState): CopilotCitations {
  return {
    metricIds: [...state.citations.metricIds].sort(),
    dimensionIds: [...state.citations.dimensionIds].sort(),
    glossaryTermIds: [...state.citations.glossaryTermIds].sort(),
  };
}

/** Returns the JSON schemas published by GET /api/ai/tools and used in Anthropic tool definitions. */
export function getCopilotToolSurface() {
  return COPILOT_TOOL_SURFACE;
}

/** Returns the Anthropic tool declarations used by the server-side tool loop. */
export function getAnthropicTools(): Tool[] {
  return COPILOT_TOOL_SURFACE.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

/** Creates mutable execution state used to accumulate citations and bounded analysis results. */
export function createCopilotToolExecutionState(): CopilotToolExecutionState {
  return {
    citations: {
      metricIds: new Set<string>(),
      dimensionIds: new Set<string>(),
      glossaryTermIds: new Set<string>(),
    },
    lastTool: null,
  };
}

/** Executes one governed copilot tool call and returns its tool_result payload. */
export async function executeCopilotTool(
  name: CopilotToolName,
  options: CopilotToolExecutionOptions,
): Promise<CopilotToolExecutionResult> {
  options.state.lastTool = name;

  if (name === 'run_analysis') {
    const parsed = runAnalysisInputSchema.safeParse(options.input);
    if (!parsed.success) {
      return {
        isError: true,
        terminalResponse: {
          provider: 'anthropic',
          model: options.context.config.anthropicModel,
          action: 'NONE',
          operations: [],
          message: buildFriendlyValidationMessage((options.input ?? {}) as AnalysisSpec),
          answer: buildFriendlyValidationMessage((options.input ?? {}) as AnalysisSpec),
          citations: toCitations(options.state),
          suggestions: ['Peça uma métrica ou dimensão existente no catálogo governado.'],
          explainability: {
            mode: 'refusal',
            tool: 'run_analysis',
            note: 'A AnalysisSpec proposta pela IA foi recusada antes da execução.',
            reason: 'tool_validation',
          },
          toolSurface: COPILOT_TOOL_SURFACE,
        },
        content: JSON.stringify({ ok: false, message: 'AnalysisSpec inválida.' }),
      };
    }

    const semanticValidation = validateAnalysisSpec(withRequiredDatasets(parsed.data));
    if (!semanticValidation.ok || !semanticValidation.resolvedQuery) {
      const friendlyMessage = buildFriendlyValidationMessage(parsed.data);
      return {
        isError: true,
        terminalResponse: {
          provider: 'anthropic',
          model: options.context.config.anthropicModel,
          action: 'NONE',
          operations: [],
          message: friendlyMessage,
          answer: friendlyMessage,
          citations: toCitations(options.state),
          suggestions: ['Posso procurar a métrica certa no catálogo antes de montar a análise.'],
          explainability: {
            mode: 'refusal',
            tool: 'run_analysis',
            note: 'A AnalysisSpec não passou na validação semântica governada.',
            reason: 'tool_validation',
          },
          toolSurface: COPILOT_TOOL_SURFACE,
        },
        content: JSON.stringify({
          ok: false,
          message: friendlyMessage,
          issues: semanticValidation.errors,
        }),
      };
    }

    const domains = [
      ...new Set([
        ...semanticValidation.resolvedQuery.metrics.map(
          (metric: { definition: MetricDefinition }) => metric.definition.domain,
        ),
        ...semanticValidation.resolvedQuery.dimensions.map(
          (dimension) => dimension.definition.domain,
        ),
        ...semanticValidation.resolvedQuery.filters.map((filter) => filter.definition.domain),
      ]),
    ];
    assertDomainAccess(options.auth.role, domains);

    const result = await options.context
      .getAnalyticsEngine(options.auth)
      .execute(semanticValidation.resolvedQuery);
    const boundedResult = buildBoundedAnalyticsResult(result, parsed.data.limit);

    options.state.analysisResult = boundedResult;
    appendUnique(
      options.state.citations.metricIds,
      semanticValidation.resolvedQuery.metrics.map((metric) => metric.definition.id),
    );
    appendUnique(
      options.state.citations.dimensionIds,
      semanticValidation.resolvedQuery.dimensions.map((dimension) => dimension.definition.id),
    );

    return {
      content: JSON.stringify({
        ok: true,
        analysisSpec: parsed.data,
        result: boundedResult,
      }),
    };
  }

  if (name === 'search_catalog') {
    const parsed = searchCatalogInputSchema.safeParse(options.input);
    if (!parsed.success) {
      return {
        isError: true,
        content: JSON.stringify({
          ok: false,
          message: 'Use uma busca curta e objetiva para consultar o catálogo governado.',
        }),
      };
    }

    const result = buildSearchCatalogResult(options.auth, parsed.data.query, parsed.data.limit);
    appendUnique(
      options.state.citations.metricIds,
      result.metrics.map((metric) => metric.id),
    );
    appendUnique(
      options.state.citations.dimensionIds,
      result.dimensions.map((dimension) => dimension.id),
    );
    appendUnique(
      options.state.citations.glossaryTermIds,
      result.glossary.map((term) => term.id),
    );

    return {
      content: JSON.stringify({ ok: true, query: parsed.data.query, result }),
    };
  }

  const parsed = getGlossaryTermInputSchema.safeParse(options.input);
  if (!parsed.success) {
    return {
      isError: true,
      content: JSON.stringify({
        ok: false,
        message: 'Informe um id governado válido do catálogo.',
      }),
    };
  }

  const allowedDomains = getAllowedDomains(options.auth.role);
  const glossaryTerm = BUSINESS_TERM_BY_ID.get(parsed.data.id);
  if (glossaryTerm && domainAllowed(glossaryTerm.domain, allowedDomains)) {
    options.state.citations.glossaryTermIds.add(glossaryTerm.id);
    appendUnique(options.state.citations.metricIds, glossaryTerm.relatedMetricIds);
    appendUnique(options.state.citations.dimensionIds, glossaryTerm.relatedDimensionIds);

    return {
      content: JSON.stringify({ ok: true, kind: 'glossary', item: glossaryTerm }),
    };
  }

  const metricDefinition = METRIC_DEFINITION_BY_ID.get(parsed.data.id);
  if (metricDefinition && domainAllowed(metricDefinition.domain, allowedDomains)) {
    options.state.citations.metricIds.add(metricDefinition.id);
    return {
      content: JSON.stringify({ ok: true, kind: 'metric', item: metricDefinition }),
    };
  }

  const dimensionDefinition = DIMENSION_DEFINITION_BY_ID.get(parsed.data.id);
  if (dimensionDefinition && domainAllowed(dimensionDefinition.domain, allowedDomains)) {
    options.state.citations.dimensionIds.add(dimensionDefinition.id);
    return {
      content: JSON.stringify({ ok: true, kind: 'dimension', item: dimensionDefinition }),
    };
  }

  return {
    isError: true,
    content: JSON.stringify({
      ok: false,
      message: `Não encontrei o id governado \`${parsed.data.id}\` no catálogo acessível ao seu papel.`,
    }),
  };
}
