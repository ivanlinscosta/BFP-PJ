import { Router } from 'express';
import { loginRequestSchema } from '@bfp/schemas';
import { resolveUserProfile } from '@api/auth/profile';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import type { ApiContext } from '@api/http/context';
import { parseWithZod } from '@api/common/validation';

export function createAuthRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.post('/login', async (req, res, next) => {
    try {
      const payload = parseWithZod(loginRequestSchema, req.body, {
        message: 'Invalid login request.',
      });
      const result = await context.authService.login(payload.email, payload.password);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', verifyJwt, (req, res) => {
    res.json({ user: { ...req.auth, ...resolveUserProfile(req.auth!) } });
  });

  return router;
}
