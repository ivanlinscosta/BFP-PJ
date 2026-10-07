import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type {
  AnalysisSpec,
  AnalyticsResult,
  BusinessTerm,
  DimensionDefinition,
  MetricDefinition,
} from '@bfp/domain';

export type CopilotAction = 'UPDATE_ANALYSIS' | 'ANSWER_QUESTION' | 'NONE';

export type CopilotToolName = 'run_analysis' | 'search_catalog' | 'get_glossary_term';

export interface CopilotHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotRequestPayload {
  prompt: string;
  analysisSpec?: AnalysisSpec;
  history: CopilotHistoryMessage[];
}

export interface CopilotToolSchema {
  name: CopilotToolName;
  description: string;
  inputSchema: Tool['input_schema'];
}

export interface CopilotCitations {
  metricIds: string[];
  dimensionIds: string[];
  glossaryTermIds: string[];
}

export interface CopilotResponse {
  provider: 'anthropic';
  model: string;
  action: CopilotAction;
  operations: Array<Record<string, unknown>>;
  message: string;
  answer: string;
  analysisResult?: AnalyticsResult;
  citations: CopilotCitations;
  suggestions: string[];
  explainability: {
    mode: 'live' | 'refusal';
    tool: CopilotToolName | null;
    note: string;
    reason?: 'prompt_injection' | 'pii_request' | 'iteration_limit' | 'tool_validation';
  };
  toolSurface: readonly CopilotToolSchema[];
}

export interface SearchCatalogToolResult {
  metrics: Array<Pick<MetricDefinition, 'id' | 'name' | 'shortName' | 'description' | 'domain'>>;
  dimensions: Array<Pick<DimensionDefinition, 'id' | 'name' | 'description' | 'domain'>>;
  glossary: Array<Pick<BusinessTerm, 'id' | 'term' | 'definition' | 'domain'>>;
}
