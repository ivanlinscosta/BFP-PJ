export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface ToErrorPayloadOptions {
  fallback?: ApiError;
  includeDebugDetails?: boolean;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>, code = 'validation_error') {
    super(422, code, message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required.') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You do not have access to this resource.') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found.') {
    super(404, 'not_found', message);
  }
}

export function toErrorPayload(error: unknown, options: ToErrorPayloadOptions = {}): ErrorPayload {
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  const fallback =
    options.fallback ?? new ApiError(500, 'internal_error', 'An unexpected error occurred.');
  const details =
    options.includeDebugDetails && error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
        }
      : undefined;

  return {
    error: {
      code: fallback.code,
      message: fallback.message,
      details,
    },
  };
}
