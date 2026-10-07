import { Router } from 'express';
import { AppConfig } from '@api/common/config';

export function createHealthRouter(config: AppConfig) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'bfp-api',
      authMode: config.authMode,
      time: new Date().toISOString(),
    });
  });

  return router;
}
