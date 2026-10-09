import { z } from 'zod';
import type { AnalysisSpec } from '@bfp/domain';
import type { AppConfig } from '@api/common/config';
import { ApiError } from '@api/common/errors';
import {
  finalizeModelAnswer,
  systemPrompt,
  withTimeout,
} from '@api/services/intelligence/bedrockProvider';
import { runLocalProvider } from '@api/services/intelligence/localProvider';
import {
  GOVERNED_TOOLS,
  findGovernedTool,
  type ToolContext,
} from '@api/services/intelligence/tools';
import type { ProviderResult } from '@api/services/intelligence/types';
import { readJsonSecret } from '@api/services/integrations/secrets';

const MAX_ITERATIONS = 8;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

interface ChatCompletion {
  choices: Array<{
    finish_reason: string;
    message: Extract<ChatMessage, { role: 'assistant' }>;
  }>;
}

/** Minimal client surface so tests can inject a fake OpenAI. */
export interface OpenAIChatClient {
  complete(body: Record<string, unknown>): Promise<ChatCompletion>;
}

/** The API key comes from OPENAI_API_KEY (local) or the Secrets Manager secret `{"apiKey": ...}`. */
export async function resolveOpenAIKey(config: AppConfig) {
  if (config.openai.apiKey) return config.openai.apiKey;
  if (!config.openai.secretId) return null;
  const secret = await readJsonSecret(config.openai.secretId, config.awsRegion);
  return secret.apiKey ?? null;
}

export function createOpenAIClient(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): OpenAIChatClient {
  return {
    async complete(body) {
      const response = await fetchImpl(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // The body may echo request details; only the status is surfaced.
        throw new Error(`OpenAI respondeu ${response.status}.`);
      }
      return (await response.json()) as ChatCompletion;
    },
  };
}

function toOpenAITools() {
  return GOVERNED_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema, { io: 'input', unrepresentable: 'any' }),
    },
  }));
}

/**
 * OpenAI provider with the same governed tool surface and grounding rules as Bedrock: the model
 * calls runAnalyticsQuery and the catalog tools, and numbers are only accepted when a governed
 * query ran in the turn. Falls back to the deterministic provider when no grounded answer comes.
 */
export async function runOpenAIProvider(input: {
  prompt: string;
  analysisSpec?: AnalysisSpec;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  toolContext: ToolContext;
  model: string;
  client: OpenAIChatClient;
}): Promise<ProviderResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(input.analysisSpec, input.toolContext.datasets) },
    ...input.history
      .slice(-12)
      .map((turn): ChatMessage => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: input.prompt },
  ];
  const tools = toOpenAITools();

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const completion = await withTimeout(
      input.client.complete({
        model: input.model,
        messages,
        tools,
        // With bases selected, the first turn must consult them (no answer from memory).
        tool_choice: iteration === 0 && input.toolContext.datasets?.length ? 'required' : 'auto',
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1_500,
      }),
    );
    const choice = completion.choices[0];
    if (!choice) break;
    const message = choice.message;
    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });

    if (!message.tool_calls?.length) {
      const final = finalizeModelAnswer(message.content ?? '', input);
      if (final) return final;
      break;
    }

    for (const call of message.tool_calls) {
      const tool = findGovernedTool(call.function.name);
      let content: string;
      if (!tool) {
        content = JSON.stringify({ error: 'Ferramenta fora da superfície governada.' });
      } else {
        try {
          const args = call.function.arguments
            ? (JSON.parse(call.function.arguments) as unknown)
            : {};
          content = JSON.stringify({ result: await tool.execute(args, input.toolContext) });
        } catch (error) {
          // Validation details tell the model which id or field to fix in the next call.
          content = JSON.stringify({
            error: error instanceof Error ? error.message : 'Falha na ferramenta.',
            details: error instanceof ApiError ? error.details : undefined,
          });
        }
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  // No grounded answer from the model: be explicit instead of improvising.
  if (input.toolContext.datasets?.length) {
    const message =
      'Não consegui montar uma resposta confiável com as bases selecionadas. Tente reformular a pergunta citando uma métrica (por exemplo, contas abertas, volume transacionado, NPS) ou selecione outras bases.';
    return { action: 'NONE', operations: [], message, answer: message, suggestions: [] };
  }
  return runLocalProvider({
    prompt: input.prompt,
    analysisSpec: input.analysisSpec,
    toolContext: input.toolContext,
  });
}

/** Raised when OpenAI is selected but no key was stored yet (the service falls back to local). */
export class OpenAIKeyMissingError extends ApiError {
  constructor() {
    super(503, 'ai_unavailable', 'A chave da OpenAI ainda não foi configurada.');
  }
}
