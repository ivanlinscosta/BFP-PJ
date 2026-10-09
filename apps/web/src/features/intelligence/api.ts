import type { AnalyticsInsight } from '@bfp/analytics-engine';
import type { AnalysisSpec, ColumnFormat, VisualizationType } from '@bfp/domain';
import type { AnalysisOperation } from '@bfp/shared';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { apiRequest } from '@/services/apiClient';
import { toQueryBody } from '@/features/explorer/spec';

/** Complete study returned when the user asks for one (all numbers from governed queries). */
export interface IntelligenceStudy {
  title: string;
  period: string;
  summary: string;
  queryCount: number;
  kpis: Array<{ metricId: string; label: string; value: number | null; format?: ColumnFormat }>;
  sections: Array<{
    id: string;
    title: string;
    question: string;
    visualization: VisualizationType;
    spec: AnalysisSpec;
    result: AnalyticsResponse;
    findings: string[];
  }>;
  recommendations: string[];
  skipped: string[];
  themes: string[];
  generatedBy: 'ai' | 'deterministic';
  model?: string;
  notice?: string;
}

/** Background study started from the chat (polled until it is done). */
export interface IntelligenceStudyJob {
  id: string;
  prompt: string;
  status: 'running' | 'done' | 'error';
  progress: string;
  study?: IntelligenceStudy;
  error?: string;
}

export async function getStudyJob(id: string) {
  return (
    await apiRequest<{ study: IntelligenceStudyJob }>(`/ai/studies/${encodeURIComponent(id)}`)
  ).study;
}

export interface IntelligenceReply {
  conversationId: string;
  provider: 'local' | 'bedrock' | 'openai';
  model: string;
  action: 'UPDATE_ANALYSIS' | 'ANSWER_QUESTION' | 'NONE';
  operations: AnalysisOperation[];
  message: string;
  answer: string;
  analysisSpec?: AnalysisSpec;
  basis?: { title: string; items: string[] };
  evidence?: AnalyticsInsight[];
  suggestions: string[];
  study?: IntelligenceStudy;
  studyJob?: { id: string; status: 'running' | 'done' | 'error'; progress: string };
  /** Customer the answer is about (Cliente PJ context). */
  customer?: { customerId: string; tradeName: string };
  explainability: { tools: string[]; note: string; refusal?: string };
}

export async function askIntelligence(input: {
  prompt: string;
  analysisSpec?: AnalysisSpec;
  conversationId?: string;
  customerId?: string;
  datasets?: string[];
}) {
  return apiRequest<
    IntelligenceReply,
    {
      prompt: string;
      analysisSpec?: AnalysisSpec;
      conversationId?: string;
      customerId?: string;
      datasets?: string[];
    }
  >('/ai/chat', {
    method: 'POST',
    body: {
      prompt: input.prompt,
      conversationId: input.conversationId,
      customerId: input.customerId,
      datasets: input.datasets?.length ? input.datasets : undefined,
      analysisSpec:
        input.analysisSpec && input.analysisSpec.metrics.length > 0
          ? toQueryBody(input.analysisSpec)
          : undefined,
    },
  });
}
