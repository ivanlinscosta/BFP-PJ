import { createCustomerIntelligenceRouter } from '@api/http/routes/customerIntelligence';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { AuthService } from '@api/auth/authService';
import { loadConfig, type AppConfig } from '@api/common/config';
import { ApiError, NotFoundError, toErrorPayload } from '@api/common/errors';
import { logger, type Logger } from '@api/common/logger';
import { createRateLimitMiddleware } from '@api/common/rateLimit';
import { createAdminRouter } from '@api/http/routes/admin';
import { createTelemetryRouter } from '@api/http/routes/telemetry';
import { createAiRouter } from '@api/http/routes/ai';
import { createAnalysesRouter } from '@api/http/routes/analyses';
import { createAnalyticsRouter } from '@api/http/routes/analytics';
import { createAudiencesRouter } from '@api/http/routes/audiences';
import { createAuthRouter } from '@api/http/routes/auth';
import { createCatalogRouter } from '@api/http/routes/catalog';
import { createCustomersRouter } from '@api/http/routes/customers';
import { createDashboardsRouter } from '@api/http/routes/dashboards';
import { createGovernanceRouter } from '@api/http/routes/governance';
import { createHealthRouter } from '@api/http/routes/health';
import { createIntegrationsRouter, createMeshRouter } from '@api/http/routes/mesh';
import { createQualityRouter } from '@api/http/routes/quality';
import { createApiContext, type ApiContext } from '@api/http/context';

const JSON_BODY_LIMIT = '256kb';

function applySecurityHeaders(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

function normalizeRequestError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    return new ApiError(
      413,
      'payload_too_large',
      'O corpo da requisição excede o limite de 256kb.',
    );
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    return new ApiError(400, 'invalid_json', 'O corpo da requisição contém JSON inválido.');
  }

  return new ApiError(500, 'internal_error', 'An unexpected error occurred.');
}

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  authService: AuthService;
  context: ApiContext;
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const config = overrides.context?.config ?? overrides.config ?? loadConfig();
  const appLogger = overrides.context?.logger ?? overrides.logger ?? logger;
  const authService =
    overrides.context?.authService ?? overrides.authService ?? new AuthService(config);
  const context = overrides.context ?? createApiContext({ config, logger: appLogger, authService });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(applySecurityHeaders);
  app.use(
    cors({
      origin: [config.webOrigin],
      credentials: true,
    }),
  );
  app.use((req, res, next) => {
    const correlationId = req.header('x-request-id') ?? randomUUID();
    const startedAt = performance.now();
    req.correlationId = correlationId;
    res.setHeader('x-request-id', correlationId);

    res.on('finish', () => {
      appLogger.info('http_request', {
        correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });

    next();
  });

  app.use(createRateLimitMiddleware(config.rateLimit));
  app.use('/api', createHealthRouter(context));
  app.use('/api/auth', createAuthRouter(context));
  app.use('/api/analytics', createAnalyticsRouter(context));
  app.use('/api/analyses', createAnalysesRouter(context));
  app.use('/api/catalog', createCatalogRouter(context));
  app.use('/api/customers', createCustomersRouter(context));
  app.use('/api/audiences', createAudiencesRouter(context));
  app.use('/api/dashboards', createDashboardsRouter(context));
  app.use('/api/quality', createQualityRouter(context));
  app.use('/api/governance', createGovernanceRouter(context));
  app.use('/api/admin', createAdminRouter(context));
  app.use('/api/mesh', createMeshRouter(context));
  app.use('/api/integrations', createIntegrationsRouter(context));
  app.use('/api/ai', createAiRouter(context));
  app.use('/api/telemetry', createTelemetryRouter(context));
  app.use('/api', createCustomerIntelligenceRouter(context));

  app.use((_req, _res, next) => {
    next(new NotFoundError());
  });

  app.use(
    (error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
      void next;
      const apiError = normalizeRequestError(error);
      const includeDebugDetails = config.nodeEnv !== 'production';

      appLogger.error('request_failed', {
        correlationId: req.correlationId,
        path: req.path,
        status: apiError.statusCode,
        code: apiError.code,
        details: apiError.details,
        errorMessage: error instanceof Error ? error.message : undefined,
        stack: includeDebugDetails && error instanceof Error ? error.stack : undefined,
      });

      res.status(apiError.statusCode).json(
        toErrorPayload(error, {
          fallback: apiError,
          includeDebugDetails,
        }),
      );
    },
  );

  return app;
}
