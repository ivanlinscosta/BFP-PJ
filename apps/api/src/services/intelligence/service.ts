import { runCustomerAssistant } from '@api/services/customerIntelligence/assistant';
import { isStudyRequest } from '@api/services/intelligence/study';
import { startStudyJob } from '@api/services/intelligence/studyJobs';
import { randomUUID } from 'node:crypto';
import type { AnalysisSpec } from '@bfp/domain';
import type { MeshDatasetId } from '@bfp/semantic-layer';
import type { AuthenticatedUser } from '@api/auth/types';
import { ApiError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';
import { detectGuardrailRefusal, hashPrompt } from '@api/services/copilot/guardrails';
import {
  createBedrockClient,
  runBedrockProvider,
  type BedrockConverseClient,
} from '@api/services/intelligence/bedrockProvider';
import { buildSuggestions } from '@api/services/intelligence/compose';
import { runLocalProvider } from '@api/services/intelligence/localProvider';
import {
  createOpenAIClient,
  OpenAIKeyMissingError,
  resolveOpenAIKey,
  runOpenAIProvider,
  type OpenAIChatClient,
} from '@api/services/intelligence/openaiProvider';
import { DatasetScopeError, type ToolContext } from '@api/services/intelligence/tools';
import type {
  IntelligenceResponse,
  ProviderResult,
  StoredConversation,
} from '@api/services/intelligence/types';

const MAX_STORED_TURNS = 30;

export interface IntelligenceRequest {
  prompt: string;
  analysisSpec?: AnalysisSpec;
  conversationId?: string;
  /** Cliente PJ in context: questions are answered from its DNA, signals and NBA. */
  customerId?: string;
  /** Mesh bases the user selected: the answer may only use these. */
  datasets?: MeshDatasetId[];
}

export interface IntelligenceDependencies {
  bedrockClient?: BedrockConverseClient;
  openaiClient?: OpenAIChatClient;
}

async function loadConversation(
  context: ApiContext,
  auth: AuthenticatedUser,
  conversationId: string | undefined,
) {
  if (!conversationId) {
    return undefined;
  }

  const stored = await context
    .getObjectRepository()
    .get<StoredConversation>(auth.userId, 'aiConversation', conversationId);
  return stored?.value;
}

/** Runs one Inteligência PJ turn over the shared AnalysisSpec and persists the conversation. */
export async function runIntelligence(
  context: ApiContext,
  auth: AuthenticatedUser,
  request: IntelligenceRequest,
  correlationId?: string,
  dependencies: IntelligenceDependencies = {},
): Promise<IntelligenceResponse> {
  const startedAt = performance.now();
  const conversation = await loadConversation(context, auth, request.conversationId);
  const conversationId = conversation?.id ?? request.conversationId ?? randomUUID();
  const toolContext: ToolContext = {
    context,
    auth,
    correlationId,
    queries: [],
    datasets: request.datasets?.length ? request.datasets : undefined,
    prompt: request.prompt,
  };
  let provider: 'bedrock' | 'openai' | 'local' =
    context.config.aiProvider === 'bedrock' || context.config.aiProvider === 'openai'
      ? context.config.aiProvider
      : 'local';
  let model =
    provider === 'bedrock'
      ? context.config.bedrockModelId
      : provider === 'openai'
        ? context.config.openai.model
        : 'deterministic-insights';
  const refusal = detectGuardrailRefusal(request.prompt);
  let customerTools: string[] = [];

  let result: ProviderResult;
  if (refusal) {
    context.logger.warn('ai_request_refused', {
      correlationId,
      userId: auth.userId,
      operation: 'AI_REQUEST',
      reason: refusal.code,
      promptHash: hashPrompt(request.prompt),
    });
    result = {
      action: 'NONE',
      operations: [],
      message: refusal.message,
      answer: refusal.message,
      suggestions: buildSuggestions(
        request.analysisSpec ?? {
          metrics: [],
          dimensions: [],
          filters: [],
          visualization: { type: 'AUTO' },
        },
      ),
    };
  } else if (request.customerId) {
    const customer = await runCustomerAssistant(
      context,
      { prompt: request.prompt, customerId: request.customerId },
      dependencies.bedrockClient,
    );
    result = customer.result;
    provider = customer.provider;
    model = customer.model;
    customerTools = customer.tools;
  } else if (isStudyRequest(request.prompt)) {
    // A study is agentic and slow (planning + queries + analysis): it runs as a background job
    // and the client follows its progress.
    const job = await startStudyJob(context, auth, request.prompt, toolContext.datasets);
    result = {
      action: 'NONE',
      operations: [],
      message: 'Estou montando o estudo. Isso leva alguns segundos.',
      answer: 'Estou montando o estudo. Isso leva alguns segundos.',
      suggestions: [],
      studyJob: { id: job.id, status: job.status, progress: job.progress },
    };
  } else {
    try {
      const history = (conversation?.turns ?? []).map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));
      const openaiKey =
        provider === 'openai' && !dependencies.openaiClient
          ? await resolveOpenAIKey(context.config)
          : null;
      if (provider === 'openai' && !dependencies.openaiClient && !openaiKey) {
        throw new OpenAIKeyMissingError();
      }
      result =
        provider === 'openai'
          ? await runOpenAIProvider({
              prompt: request.prompt,
              analysisSpec: request.analysisSpec,
              history,
              toolContext,
              model: context.config.openai.model,
              client: dependencies.openaiClient ?? createOpenAIClient(openaiKey ?? ''),
            })
          : provider === 'bedrock'
            ? await runBedrockProvider({
                prompt: request.prompt,
                analysisSpec: request.analysisSpec,
                history: (conversation?.turns ?? []).map((turn) => ({
                  role: turn.role,
                  content: turn.content,
                })),
                toolContext,
                modelId: context.config.bedrockModelId,
                client:
                  dependencies.bedrockClient ?? createBedrockClient(context.config.bedrockRegion),
              })
            : await runLocalProvider({
                prompt: request.prompt,
                analysisSpec: request.analysisSpec,
                toolContext,
              });
    } catch (error) {
      context.logger.error('ai_request_failed', {
        correlationId,
        userId: auth.userId,
        operation: 'AI_REQUEST',
        provider,
        durationMs: Math.round(performance.now() - startedAt),
        status: 'error',
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error),
      });
      const scopeAnswer = (scope: DatasetScopeError): ProviderResult => ({
        action: 'NONE',
        operations: [],
        message: scope.message,
        answer: scope.message,
        suggestions: [],
      });
      if (error instanceof DatasetScopeError) {
        // Outside the selected bases: an answer (not an error) that says what is missing.
        result = scopeAnswer(error);
      } else {
        if (error instanceof ApiError && error.statusCode < 500) {
          throw error;
        }
        if (provider === 'local') {
          throw new ApiError(
            503,
            'ai_unavailable',
            'A Inteligência PJ está indisponível no momento. Continue a análise no playground.',
          );
        }

        // Generative provider unavailable (key, model access, quota): answer with the
        // deterministic provider over the same governed tools instead of leaving the user without
        // a reply.
        context.logger.warn('ai_provider_fallback', {
          correlationId,
          userId: auth.userId,
          operation: 'AI_REQUEST',
          from: provider,
          to: 'local',
        });
        toolContext.queries.splice(0);
        provider = 'local';
        model = 'deterministic-insights';
        try {
          result = await runLocalProvider({
            prompt: request.prompt,
            analysisSpec: request.analysisSpec,
            toolContext,
          });
        } catch (fallbackError) {
          if (!(fallbackError instanceof DatasetScopeError)) throw fallbackError;
          result = scopeAnswer(fallbackError);
        }
      }
    }
  }

  for (const query of toolContext.queries) {
    context.logger.info('ai_tool_call', {
      correlationId,
      userId: auth.userId,
      operation: 'AI_TOOL_CALL',
      tool: 'runAnalyticsQuery',
      queryId: query.result.metadata.queryId,
    });
  }

  const now = context.clock().toISOString();
  const turns = [
    ...(conversation?.turns ?? []),
    { role: 'user' as const, content: request.prompt, at: now },
    {
      role: 'assistant' as const,
      content: result.message || result.answer,
      at: now,
      action: result.action,
    },
  ].slice(-MAX_STORED_TURNS);
  await context.getObjectRepository().put<StoredConversation>({
    userId: auth.userId,
    type: 'aiConversation',
    id: conversationId,
    value: {
      id: conversationId,
      title: conversation?.title ?? request.prompt.slice(0, 80),
      turns,
      analysisSpec: result.analysisSpec ?? request.analysisSpec,
      createdAt: conversation?.createdAt ?? now,
      updatedAt: now,
    },
  });

  context.logger.info('ai_request_completed', {
    correlationId,
    userId: auth.userId,
    operation: 'AI_REQUEST',
    provider,
    action: result.action,
    toolCalls: toolContext.queries.length,
    durationMs: Math.round(performance.now() - startedAt),
    status: 'success',
    promptHash: hashPrompt(request.prompt),
  });

  return {
    ...result,
    conversationId,
    provider,
    model,
    explainability: {
      tools:
        customerTools.length > 0
          ? customerTools
          : toolContext.queries.length > 0
            ? ['runAnalyticsQuery']
            : [],
      note:
        customerTools.length > 0
          ? 'Fatos obtidos do perfil materializado do cliente (DNA, sinais e NBA determinísticos).'
          : toolContext.queries.length > 0
            ? 'Números obtidos exclusivamente por runAnalyticsQuery sobre métricas certificadas, respeitando filtros e permissões.'
            : 'Nenhum número foi gerado nesta resposta.',
      refusal: refusal?.code,
    },
  };
}
