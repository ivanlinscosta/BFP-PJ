/**
 * Shared API contracts and utility types.
 */

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export function createErrorResponse(code: string, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

export {
  describeAnalysisSpec,
  describeDateRange,
  describeFilter,
  type SpecLabelResolver,
} from './describe';

export { applyAnalysisOperations, type AnalysisOperation } from './operations';
