import type { SemanticError } from '@bfp/semantic-layer';
import type { ZodIssue, ZodType } from 'zod';
import { ValidationError } from './errors';

function toIssuePath(path: readonly PropertyKey[]) {
  return path.map(String).join('.') || 'root';
}

export function mapZodIssues(issues: ZodIssue[]) {
  return issues.map((issue) => ({
    code: issue.code,
    path: toIssuePath(issue.path),
    message: issue.message,
  }));
}

export function parseWithZod<TOutput>(
  schema: ZodType<TOutput>,
  payload: unknown,
  options: {
    code?: string;
    message?: string;
  } = {},
) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(
      options.message ?? 'Request validation failed.',
      {
        issues: mapZodIssues(result.error.issues),
      },
      options.code,
    );
  }

  return result.data;
}

export function throwSemanticValidationError(errors: SemanticError[]): never {
  throw new ValidationError(
    'Analysis specification is invalid.',
    {
      issues: errors.map((error) => ({
        code: error.code,
        path: error.path,
        message: error.message,
        details: error.details,
      })),
    },
    'invalid_analysis_spec',
  );
}
