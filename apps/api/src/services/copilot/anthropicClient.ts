import Anthropic from '@anthropic-ai/sdk';

/** Creates the Anthropic SDK client for server-side copilot orchestration. */
export function createAnthropicClient(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 0 });
}
