import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { ApiError } from '@api/common/errors';
import type { AuthenticatedUser } from '@api/auth/types';
import type { ApiContext } from '@api/http/context';
import { createAnthropicClient } from '@api/services/copilot/anthropicClient';
import {
  buildCopilotSystemPrompt,
  COPILOT_MAX_TOOL_ITERATIONS,
  COPILOT_MODEL_TIMEOUT_MS,
  detectGuardrailRefusal,
  hashPrompt,
} from '@api/services/copilot/guardrails';
import {
  createCopilotToolExecutionState,
  executeCopilotTool,
  getAnthropicTools,
  getCopilotToolSurface,
} from '@api/services/copilot/tools';
import type {
  CopilotRequestPayload,
  CopilotResponse,
  CopilotToolName,
} from '@api/services/copilot/types';

const finalResponseSchema = z.object({
  action: z.enum(['UPDATE_ANALYSIS', 'ANSWER_QUESTION', 'NONE']).default('NONE'),
  operations: z.array(z.record(z.string(), z.unknown())).default([]),
  message: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  suggestions: z.array(z.string().trim().min(1)).default([]),
  explainability: z.object({
    note: z.string().trim().min(1),
    tool: z.string().trim().min(1).nullable(),
  }),
});

interface CopilotServiceOptions {
  context: ApiContext;
  auth: AuthenticatedUser;
  payload: CopilotRequestPayload;
  correlationId?: string;
}

function buildUserPrompt(payload: CopilotRequestPayload) {
  const sections = [`Pergunta do usuário: ${payload.prompt}`];

  if (payload.analysisSpec) {
    sections.push(`AnalysisSpec atual em JSON: ${JSON.stringify(payload.analysisSpec)}`);
  }

  sections.push('Se precisar de números ou definições, use somente as ferramentas governadas.');
  return sections.join('\n\n');
}

function mapHistoryToMessages(payload: CopilotRequestPayload): MessageParam[] {
  return [
    ...payload.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: 'user',
      content: buildUserPrompt(payload),
    },
  ];
}

function getTextContent(message: Message) {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function getToolUseBlocks(message: Message) {
  return message.content.filter((block): block is ToolUseBlock => block.type === 'tool_use');
}

function isToolUseBlock(block: Message['content'][number]): block is ToolUseBlock {
  return block.type === 'tool_use';
}

function toAssistantMessage(message: Message): MessageParam {
  const content: ContentBlockParam[] = [];

  for (const block of message.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text });
      continue;
    }

    if (isToolUseBlock(block)) {
      content.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }
  }

  return {
    role: 'assistant',
    content,
  };
}

function buildToolResultMessage(toolUseId: string, content: string, isError = false): MessageParam {
  const toolResult: ToolResultBlockParam = {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  };

  return {
    role: 'user',
    content: [toolResult],
  };
}

function isCopilotToolName(value: string): value is CopilotToolName {
  return value === 'run_analysis' || value === 'search_catalog' || value === 'get_glossary_term';
}

function parseFinalResponse(text: string) {
  const parsed = finalResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function buildRefusalResponse(
  model: string,
  tool: CopilotToolName | null,
  reason: 'prompt_injection' | 'pii_request' | 'iteration_limit' | 'tool_validation',
  message: string,
): CopilotResponse {
  return {
    provider: 'anthropic',
    model,
    action: 'NONE',
    operations: [],
    message,
    answer: message,
    citations: {
      metricIds: [],
      dimensionIds: [],
      glossaryTermIds: [],
    },
    suggestions: ['Reformule o pedido dentro das métricas, dimensões e termos governados.'],
    explainability: {
      mode: 'refusal',
      tool,
      note: 'O Copilot recusou a solicitação antes de gerar uma resposta analítica.',
      reason,
    },
    toolSurface: getCopilotToolSurface(),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ApiError(504, 'copilot_timeout', 'O provedor de IA excedeu o tempo limite.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function toProviderApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error && /time(?:d)?\s*out|timeout/i.test(error.message)) {
    return new ApiError(504, 'copilot_timeout', 'O provedor de IA excedeu o tempo limite.');
  }

  return new ApiError(
    502,
    'copilot_provider_error',
    'O provedor de IA não conseguiu concluir a solicitação.',
  );
}

/** Runs the Anthropic tool loop and returns the governed copilot response envelope. */
export async function runCopilot(options: CopilotServiceOptions): Promise<CopilotResponse> {
  const refusal = detectGuardrailRefusal(options.payload.prompt);
  if (refusal) {
    options.context.logger.warn('copilot_refused', {
      correlationId: options.correlationId,
      userId: options.auth.userId,
      reason: refusal.code,
      promptLength: options.payload.prompt.length,
      promptHash: hashPrompt(options.payload.prompt),
    });
    return buildRefusalResponse(
      options.context.config.anthropicModel,
      null,
      refusal.code,
      refusal.message,
    );
  }

  const anthropic = createAnthropicClient(options.context.config.anthropicApiKey);
  const messages = mapHistoryToMessages(options.payload);
  const state = createCopilotToolExecutionState();
  const startedAt = Date.now();
  const tools: Tool[] = getAnthropicTools();

  options.context.logger.info('copilot_request_started', {
    correlationId: options.correlationId,
    userId: options.auth.userId,
    operation: 'copilot',
    promptLength: options.payload.prompt.length,
    promptHash: hashPrompt(options.payload.prompt),
  });

  try {
    for (let iteration = 0; iteration < COPILOT_MAX_TOOL_ITERATIONS; iteration += 1) {
      const request: MessageCreateParamsNonStreaming = {
        model: options.context.config.anthropicModel,
        max_tokens: 1_200,
        system: buildCopilotSystemPrompt(),
        messages,
        stream: false,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        tools,
        metadata: {
          user_id: options.auth.userId,
        },
      };

      const message = await withTimeout<Message>(
        anthropic.messages.create(request, {
          timeout: COPILOT_MODEL_TIMEOUT_MS,
          maxRetries: 0,
        }),
        COPILOT_MODEL_TIMEOUT_MS,
      );

      messages.push(toAssistantMessage(message));
      const toolUseBlocks = getToolUseBlocks(message);
      if (toolUseBlocks.length === 0) {
        const text = getTextContent(message);
        const parsed = text ? parseFinalResponse(text) : null;
        const answer =
          parsed?.answer ??
          text ??
          'Não consegui produzir uma resposta governada para essa solicitação.';
        const response: CopilotResponse = {
          provider: 'anthropic',
          model: options.context.config.anthropicModel,
          action: parsed?.action ?? (state.analysisResult ? 'ANSWER_QUESTION' : 'NONE'),
          operations: parsed?.operations ?? [],
          message: parsed?.message ?? answer,
          answer,
          analysisResult: state.analysisResult,
          citations: {
            metricIds: [...state.citations.metricIds].sort(),
            dimensionIds: [...state.citations.dimensionIds].sort(),
            glossaryTermIds: [...state.citations.glossaryTermIds].sort(),
          },
          suggestions: parsed?.suggestions ?? [],
          explainability: {
            mode: 'live',
            tool:
              (parsed?.explainability.tool as CopilotToolName | null | undefined) ?? state.lastTool,
            note:
              parsed?.explainability.note ??
              'Resposta gerada somente com ferramentas governadas, validação semântica e dados limitados pelo backend.',
          },
          toolSurface: getCopilotToolSurface(),
        };

        options.context.logger.info('copilot_request_completed', {
          correlationId: options.correlationId,
          userId: options.auth.userId,
          operation: 'copilot',
          durationMs: Date.now() - startedAt,
          status: 'success',
          tool: state.lastTool,
        });

        return response;
      }

      for (const toolUse of toolUseBlocks) {
        options.context.logger.info('copilot_tool_invoked', {
          correlationId: options.correlationId,
          userId: options.auth.userId,
          operation: 'copilot_tool',
          tool: toolUse.name,
        });

        if (!isCopilotToolName(toolUse.name)) {
          return buildRefusalResponse(
            options.context.config.anthropicModel,
            null,
            'tool_validation',
            `A ferramenta \`${toolUse.name}\` não faz parte da superfície governada do Copilot.`,
          );
        }

        const toolResult = await executeCopilotTool(toolUse.name, {
          context: options.context,
          auth: options.auth,
          input: toolUse.input,
          state,
        });

        if (toolResult.terminalResponse) {
          options.context.logger.warn('copilot_tool_refused', {
            correlationId: options.correlationId,
            userId: options.auth.userId,
            operation: 'copilot_tool',
            tool: toolUse.name,
          });
          return toolResult.terminalResponse;
        }

        messages.push(buildToolResultMessage(toolUse.id, toolResult.content, toolResult.isError));
      }
    }
  } catch (error) {
    throw toProviderApiError(error);
  }

  options.context.logger.warn('copilot_iteration_limit_reached', {
    correlationId: options.correlationId,
    userId: options.auth.userId,
    operation: 'copilot',
    durationMs: Date.now() - startedAt,
  });

  return buildRefusalResponse(
    options.context.config.anthropicModel,
    state.lastTool,
    'iteration_limit',
    'Interrompi a execução porque a conversa com ferramentas excedeu o limite seguro de iterações.',
  );
}
