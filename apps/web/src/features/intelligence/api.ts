import type { AnalyticsInsight } from '@bfp/analytics-engine';
import type { AnalysisSpec } from '@bfp/domain';
import type { AnalysisOperation } from '@bfp/shared';
import { apiRequest } from '@/services/apiClient';
import { toQueryBody } from '@/features/explorer/spec';

export interface IntelligenceReply {
  conversationId: string;
  provider: 'local' | 'bedrock';
  model: string;
  action: 'UPDATE_ANALYSIS' | 'ANSWER_QUESTION' | 'NONE';
  operations: AnalysisOperation[];
  message: string;
  answer: string;
  analysisSpec?: AnalysisSpec;
  basis?: { title: string; items: string[] };
  evidence?: AnalyticsInsight[];
  suggestions: string[];
  explainability: { tools: string[]; note: string; refusal?: string };
}

export async function askIntelligence(input: {
  prompt: string;
  analysisSpec?: AnalysisSpec;
  conversationId?: string;
}) {
  return apiRequest<
    IntelligenceReply,
    { prompt: string; analysisSpec?: AnalysisSpec; conversationId?: string }
  >('/ai/chat', {
    method: 'POST',
    body: {
      prompt: input.prompt,
      conversationId: input.conversationId,
      analysisSpec:
        input.analysisSpec && input.analysisSpec.metrics.length > 0
          ? toQueryBody(input.analysisSpec)
          : undefined,
    },
  });
}
