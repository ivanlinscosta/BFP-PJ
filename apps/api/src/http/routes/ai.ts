import { z } from 'zod';
import { Router } from 'express';
import { analysisSpecSchema } from '@bfp/schemas';
import { MESH_DATASET_BY_ID, validateAnalysisSpec, type MeshDatasetId } from '@bfp/semantic-layer';
import { getAllowedDomains, requireRoles } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { createRateLimitMiddleware } from '@api/common/rateLimit';
import { parseWithZod, throwSemanticValidationError } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import { normalizeSearchText } from '@api/http/textSearch';
import { COPILOT_MAX_PROMPT_LENGTH } from '@api/services/copilot/guardrails';
import { getCopilotToolSurface, runCopilot } from '@api/services/copilot';
import { runIntelligence } from '@api/services/intelligence/service';
import { getStudyJob } from '@api/services/intelligence/studyJobs';
import type { StoredConversation } from '@api/services/intelligence/types';
import { ApiError, NotFoundError } from '@api/common/errors';
import { readFeatureFlags } from '@api/http/routes/admin';

const LOCAL_COPILOT_STUB_PROFILE = {
  provider: 'local-deterministic-stub',
  model: 'fase-6-copilot-contract-stub',
} as const;

const COPILOT_TOOL_SURFACE = [
  {
    name: 'getAvailableMetrics',
    description: 'Lists governed metrics available to the current user.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getAvailableDimensions',
    description: 'Lists governed dimensions available to the current user.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getMetricDefinition',
    description: 'Returns a governed metric definition by id.',
    inputSchema: {
      type: 'object',
      required: ['metricId'],
      properties: { metricId: { type: 'string' } },
    },
  },
  {
    name: 'getDimensionDefinition',
    description: 'Returns a governed dimension definition by id.',
    inputSchema: {
      type: 'object',
      required: ['dimensionId'],
      properties: { dimensionId: { type: 'string' } },
    },
  },
  {
    name: 'runAnalyticsQuery',
    description: 'Executes a validated AnalysisSpec and returns governed aggregates.',
    inputSchema: {
      type: 'object',
      required: ['analysisSpec'],
      properties: { analysisSpec: { type: 'object' } },
    },
  },
  {
    name: 'getCustomer360',
    description: 'Fetches a single customer 360 profile by company id.',
    inputSchema: {
      type: 'object',
      required: ['companyId'],
      properties: { companyId: { type: 'string' } },
    },
  },
  {
    name: 'searchBusinessGlossary',
    description: 'Searches the business glossary for governed definitions.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
  },
  {
    name: 'createAudiencePreview',
    description: 'Builds a draft audience preview from governed filters.',
    inputSchema: {
      type: 'object',
      required: ['filters'],
      properties: { filters: { type: 'array' } },
    },
  },
  {
    name: 'getQualityStatus',
    description: 'Returns the current governed quality status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'getLineage',
    description: 'Returns semantic lineage for a metric or metric set.',
    inputSchema: {
      type: 'object',
      properties: { metricIds: { type: 'array', items: { type: 'string' } } },
    },
  },
] as const;

const copilotRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(COPILOT_MAX_PROMPT_LENGTH),
  analysisSpec: analysisSpecSchema.optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1),
      }),
    )
    .default([]),
});

function buildCopilotStubResponse(payload: z.infer<typeof copilotRequestSchema>) {
  const normalizedPrompt = normalizeSearchText(payload.prompt);

  if (normalizedPrompt.includes('convers')) {
    return {
      ...LOCAL_COPILOT_STUB_PROFILE,
      action: 'UPDATE_ANALYSIS' as const,
      operations: [
        { type: 'ADD_METRIC', metricId: 'account_conversion_rate' },
        { type: 'ADD_DIMENSION', dimensionId: 'acquisition_channel' },
      ],
      message:
        'Stub copilot suggests using account conversion rate broken down by acquisition channel.',
      suggestions: ['Compare conversion by state after validating the first slice.'],
      explainability: {
        mode: 'stub',
        tool: 'searchBusinessGlossary',
        note: 'This deterministic response will be replaced by the real AI provider in FASE 13.',
      },
      toolSurface: COPILOT_TOOL_SURFACE,
    };
  }

  if (payload.analysisSpec) {
    return {
      ...LOCAL_COPILOT_STUB_PROFILE,
      action: 'ANSWER_QUESTION' as const,
      operations: [],
      answer: {
        tool: 'runAnalyticsQuery',
        arguments: payload.analysisSpec,
      },
      message: 'Stub copilot would answer by delegating to the governed analytics tool.',
      suggestions: ['Ask for a different dimension or add a date comparison.'],
      explainability: {
        mode: 'stub',
        tool: 'runAnalyticsQuery',
        note: 'This deterministic response will be replaced by the real AI provider in FASE 13.',
      },
      toolSurface: COPILOT_TOOL_SURFACE,
    };
  }

  return {
    ...LOCAL_COPILOT_STUB_PROFILE,
    action: 'NONE' as const,
    operations: [],
    message:
      'Stub copilot did not change the analysis because no governed analysisSpec was provided.',
    suggestions: ['Provide an analysisSpec to receive a tool-oriented answer.'],
    explainability: {
      mode: 'stub',
      tool: null,
      note: 'This deterministic response will be replaced by the real AI provider in FASE 13.',
    },
    toolSurface: COPILOT_TOOL_SURFACE,
  };
}

export function createAiRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);
  const aiRateLimit = createRateLimitMiddleware({
    enabled: context.config.rateLimit.enabled,
    tokensPerMinute: Math.min(context.config.rateLimit.tokensPerMinute, 10),
    burst: Math.min(context.config.rateLimit.burst, 10),
  });

  router.use(verifyJwt, requireRoles('admin', 'analyst'), aiRateLimit);

  const chatRequestSchema = z.object({
    prompt: z.string().trim().min(1).max(COPILOT_MAX_PROMPT_LENGTH),
    analysisSpec: analysisSpecSchema.optional(),
    conversationId: z.string().trim().min(1).max(64).optional(),
    customerId: z
      .string()
      .trim()
      .regex(/^[\w-]{1,64}$/)
      .optional(),
    /** Bases chosen by the user; the answer may only use them. */
    datasets: z.array(z.string().trim().min(1)).max(10).optional(),
  });

  router.post('/chat', async (req, res, next) => {
    try {
      if (!(await readFeatureFlags(context)).aiCopilot) {
        throw new ApiError(
          403,
          'feature_disabled',
          'A Inteligência PJ está desativada pela administração.',
        );
      }
      const payload = parseWithZod(chatRequestSchema, req.body, {
        message: 'Pergunta inválida para a Inteligência PJ.',
      });
      const allowed = getAllowedDomains(req.auth!.role);
      const datasets = (payload.datasets ?? []).filter((id) => {
        const dataset = MESH_DATASET_BY_ID.get(id as MeshDatasetId);
        return (
          dataset && (allowed[0] === '*' || (allowed as readonly string[]).includes(dataset.domain))
        );
      }) as MeshDatasetId[];
      if (payload.datasets?.length && datasets.length === 0) {
        throw new ApiError(
          422,
          'dataset_scope',
          'Nenhuma das bases selecionadas está disponível para o seu perfil.',
        );
      }
      const analysisSpec =
        payload.analysisSpec && payload.analysisSpec.metrics.length > 0
          ? payload.analysisSpec
          : undefined;
      res.json(
        await runIntelligence(
          context,
          req.auth!,
          { ...payload, analysisSpec, datasets: datasets.length ? datasets : undefined },
          req.correlationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/studies/:id', async (req, res, next) => {
    try {
      const job = await getStudyJob(context, req.auth!.userId, req.params.id);
      if (!job) {
        throw new NotFoundError('Estudo não encontrado.');
      }
      // The worker identity stays on the server.
      res.json({
        study: {
          id: job.id,
          prompt: job.prompt,
          status: job.status,
          progress: job.progress,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          study: job.study,
          error: job.error,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/conversations/:id', async (req, res, next) => {
    try {
      const stored = await context
        .getObjectRepository()
        .get<StoredConversation>(req.auth!.userId, 'aiConversation', req.params.id);
      if (!stored) {
        throw new NotFoundError('Conversa não encontrada.');
      }
      res.json({ conversation: stored.value });
    } catch (error) {
      next(error);
    }
  });

  router.get('/tools', (_req, res) => {
    if (!context.config.anthropicApiKey) {
      res.json({
        ...LOCAL_COPILOT_STUB_PROFILE,
        tools: COPILOT_TOOL_SURFACE,
      });
      return;
    }

    res.json({
      provider: 'anthropic',
      model: context.config.anthropicModel,
      tools: getCopilotToolSurface(),
    });
  });

  router.post('/copilot', async (req, res, next) => {
    try {
      const payload = parseWithZod(copilotRequestSchema, req.body, {
        message: 'Invalid copilot payload.',
      });

      if (payload.analysisSpec) {
        const semanticValidation = validateAnalysisSpec(payload.analysisSpec);
        if (!semanticValidation.ok) {
          throwSemanticValidationError(semanticValidation.errors);
        }
      }

      if (!context.config.anthropicApiKey) {
        res.json(buildCopilotStubResponse(payload));
        return;
      }

      const response = await runCopilot({
        context,
        auth: req.auth!,
        payload,
        correlationId: req.correlationId,
      });

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
