import { Router } from 'express';
import { analysisSpecSchema } from '@bfp/schemas';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import { executeGovernedQuery } from '@api/services/analyticsService';

export function createAnalyticsRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.post('/query', verifyJwt, async (req, res, next) => {
    try {
      const spec = parseWithZod(analysisSpecSchema, req.body, {
        message: 'Invalid analytics query payload.',
      });
      res.json(await executeGovernedQuery(context, req.auth!, spec, req.correlationId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
