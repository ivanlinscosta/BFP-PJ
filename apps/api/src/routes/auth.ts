import { loginRequestSchema } from '@bfp/schemas';
import { Router } from 'express';
import { AuthService } from '@api/auth/authService';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { AppConfig } from '@api/common/config';
import { ValidationError } from '@api/common/errors';

export function createAuthRouter(config: AppConfig, authService: AuthService) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(config);

  router.post('/login', async (req, res, next) => {
    try {
      const parsed = loginRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid login request.');
      }

      const result = await authService.login(parsed.data.email, parsed.data.password);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', verifyJwt, (req, res) => {
    res.json({ user: req.auth });
  });

  return router;
}
