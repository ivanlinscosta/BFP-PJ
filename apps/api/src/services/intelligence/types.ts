import type { Study } from '@api/services/intelligence/study';
import type { AnalyticsInsight } from '@bfp/analytics-engine';
import type { AnalysisSpec } from '@bfp/domain';
import type { AnalysisOperation } from '@bfp/shared';

/** Action proposed by Inteligência PJ over the shared AnalysisSpec. */
export type IntelligenceAction = 'UPDATE_ANALYSIS' | 'ANSWER_QUESTION' | 'NONE';

/** Result produced by an AI provider before persistence. */
export interface ProviderResult {
  action: IntelligenceAction;
  operations: AnalysisOperation[];
  message: string;
  answer: string;
  analysisSpec?: AnalysisSpec;
  basis?: { title: string; items: string[] };
  evidence?: AnalyticsInsight[];
  suggestions: string[];
  /** Complete multi-chapter study, when the user asked for one. */
  study?: Study;
  /** Background study being built (poll GET /api/ai/studies/:id). */
  studyJob?: { id: string; status: 'running' | 'done' | 'error'; progress: string };
  /** Customer the answer is about (Cliente PJ context). */
  customer?: { customerId: string; tradeName: string };
}

/** One stored turn of an Inteligência PJ conversation. */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  action?: IntelligenceAction;
}

/** Persisted conversation (DynamoDB objects table, type aiConversation). */
export interface StoredConversation {
  id: string;
  title: string;
  turns: ConversationTurn[];
  analysisSpec?: AnalysisSpec;
  createdAt: string;
  updatedAt: string;
}

/** Response returned by POST /api/ai/chat. */
export interface IntelligenceResponse extends ProviderResult {
  conversationId: string;
  provider: 'local' | 'bedrock';
  model: string;
  explainability: {
    tools: string[];
    note: string;
    refusal?: 'prompt_injection' | 'pii_request';
  };
}
