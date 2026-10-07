import { Router } from 'express';
import type { ApiContext } from '@api/http/context';

export function createHealthRouter(context: ApiContext) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'bfp-api',
      authMode: context.config.authMode,
      time: context.clock().toISOString(),
    });
  });

  return router;
}
