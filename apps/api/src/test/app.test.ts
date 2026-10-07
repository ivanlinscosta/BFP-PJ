import request from 'supertest';
import express from 'express';
import { createApp } from '@api/http/app';
import { AuthService } from '@api/auth/authService';
import { requireRole } from '@api/auth/rbac';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { loadConfig } from '@api/common/config';
import { createRateLimitMiddleware } from '@api/common/rateLimit';
import { InMemoryObjectRepository } from '@api/repositories/inMemoryObjectRepository';

function createTestConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test-secret',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides,
  });
}

describe('api foundation', () => {
  it('returns health information', async () => {
    const app = createApp({ config: createTestConfig() });
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('bfp-api');
  });

  it('authenticates a dev user', async () => {
    const app = createApp({ config: createTestConfig() });
    const response = await request(app).post('/api/auth/login').send({
      email: 'admin@example.local',
      password: 'demo-password-123',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects invalid dev credentials', async () => {
    const app = createApp({ config: createTestConfig() });
    const response = await request(app).post('/api/auth/login').send({
      email: 'admin@example.local',
      password: 'wrong-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('protects routes with jwt verification', async () => {
    const config = createTestConfig();
    const authService = new AuthService(config);
    const app = express();
    app.use(express.json());
    app.get('/protected', createVerifyJwtMiddleware(config), (req, res) => {
      res.json({ user: req.auth });
    });

    const unauthorized = await request(app).get('/protected');
    expect(unauthorized.status).toBe(401);

    const token = await authService.issueDevAccessToken({
      id: 'usr-1',
      email: 'analyst@example.local',
      role: 'analyst',
    });
    const authorized = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(authorized.status).toBe(200);
    expect(authorized.body.user.role).toBe('analyst');
  });

  it('enforces rbac allow and deny flows', async () => {
    const config = createTestConfig();
    const authService = new AuthService(config);
    const app = express();
    app.use(express.json());
    app.get('/admin-only', createVerifyJwtMiddleware(config), requireRole('admin'), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        void next;
        if (error instanceof Error && 'statusCode' in error) {
          res
            .status(Number(error.statusCode))
            .json({ error: { code: 'error', message: error.message } });
          return;
        }

        res.status(500).json({ error: { code: 'internal', message: 'unexpected' } });
      },
    );

    const adminToken = await authService.issueDevAccessToken({
      id: 'usr-1',
      email: 'admin@example.local',
      role: 'admin',
    });
    const analystToken = await authService.issueDevAccessToken({
      id: 'usr-2',
      email: 'analyst@example.local',
      role: 'analyst',
    });

    await request(app).get('/admin-only').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app)
      .get('/admin-only')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(403);
  });

  it('applies in-memory rate limiting when enabled', async () => {
    const app = express();
    app.use(
      createRateLimitMiddleware({
        enabled: true,
        tokensPerMinute: 0,
        burst: 2,
        now: () => 0,
      }),
    );
    app.get('/limited', (_req, res) => {
      res.json({ ok: true });
    });

    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(429);
  });

  it('stores and lists objects from the in-memory repository', async () => {
    const repository = new InMemoryObjectRepository();
    await repository.put({ userId: '1', type: 'analysis', id: '1', value: { name: 'Analysis 1' } });
    await repository.put({ userId: '1', type: 'analysis', id: '2', value: { name: 'Analysis 2' } });
    await repository.put({
      userId: '1',
      type: 'dashboard',
      id: '1',
      value: { name: 'Dashboard 1' },
    });

    const found = await repository.get('1', 'analysis', '1');
    const analyses = await repository.listByType('1', 'analysis');

    expect(found?.value).toEqual({ name: 'Analysis 1' });
    expect(analyses).toHaveLength(2);
  });
});
