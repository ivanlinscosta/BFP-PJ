import request from 'supertest';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import type { ObjectRepository } from '@api/repositories/types';
import { InMemoryObjectRepository } from '@api/repositories/inMemoryObjectRepository';

function createTestConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test-secret',
    RATE_LIMIT_ENABLED: 'false',
    DATASET_TABLE: '',
    OBJECTS_TABLE: '',
    ...overrides,
  });
}

function createHarness(
  configOverrides: Record<string, string> = {},
  objectRepository?: ObjectRepository,
) {
  const config = createTestConfig(configOverrides);
  const authService = new AuthService(config);
  const context = createApiContext({
    config,
    logger,
    authService,
    objectRepository: objectRepository ?? new InMemoryObjectRepository(),
  });

  return {
    app: createApp({ context }),
    authService,
  };
}

async function issueToken(authService: AuthService, role: 'admin' | 'analyst' | 'business') {
  return authService.issueDevAccessToken({
    id: `usr-${role}`,
    email: `${role}@example.local`,
    role,
  });
}

type RouteCase = {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  body?: Record<string, unknown>;
};

const protectedRoutes: RouteCase[] = [
  { method: 'get', path: '/api/auth/me' },
  {
    method: 'post',
    path: '/api/analytics/query',
    body: {
      datasets: ['customer_360'],
      metrics: [{ id: 'companies_total' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'AUTO' },
    },
  },
  { method: 'get', path: '/api/analyses' },
  {
    method: 'post',
    path: '/api/analyses',
    body: { metrics: [], dimensions: [], visualization: { type: 'AUTO' } },
  },
  { method: 'get', path: '/api/analyses/analysis-1' },
  {
    method: 'put',
    path: '/api/analyses/analysis-1',
    body: { metrics: [], dimensions: [], visualization: { type: 'AUTO' } },
  },
  { method: 'delete', path: '/api/analyses/analysis-1' },
  { method: 'get', path: '/api/catalog/metrics' },
  { method: 'get', path: '/api/catalog/dimensions' },
  { method: 'get', path: '/api/catalog/glossary' },
  { method: 'get', path: '/api/catalog/data-products' },
  { method: 'get', path: '/api/catalog/lineage' },
  { method: 'get', path: '/api/catalog/quality' },
  { method: 'get', path: '/api/customers' },
  { method: 'get', path: '/api/customers/company-0001' },
  { method: 'get', path: '/api/audiences' },
  { method: 'post', path: '/api/audiences', body: { name: 'Audiência', filters: [] } },
  { method: 'get', path: '/api/audiences/audience-1' },
  { method: 'put', path: '/api/audiences/audience-1', body: { name: 'Audiência', filters: [] } },
  { method: 'delete', path: '/api/audiences/audience-1' },
  { method: 'get', path: '/api/dashboards' },
  {
    method: 'post',
    path: '/api/dashboards',
    body: {
      name: 'Dashboard',
      cards: [
        {
          id: 'card-1',
          title: 'Card',
          analysisId: 'analysis-1',
          layout: { mode: 'GRID', x: 0, y: 0, w: 4, h: 3 },
        },
      ],
    },
  },
  { method: 'get', path: '/api/dashboards/dashboard-1' },
  {
    method: 'put',
    path: '/api/dashboards/dashboard-1',
    body: {
      name: 'Dashboard',
      cards: [
        {
          id: 'card-1',
          title: 'Card',
          analysisId: 'analysis-1',
          layout: { mode: 'GRID', x: 0, y: 0, w: 4, h: 3 },
        },
      ],
    },
  },
  { method: 'delete', path: '/api/dashboards/dashboard-1' },
  { method: 'get', path: '/api/quality/summary' },
  { method: 'get', path: '/api/quality/status' },
  { method: 'get', path: '/api/quality/data-products' },
  { method: 'get', path: '/api/quality/incidents' },
  { method: 'get', path: '/api/ai/tools' },
  { method: 'post', path: '/api/ai/copilot', body: { prompt: 'Quero ver conversão por canal' } },
];

async function performRoute(route: RouteCase, app: ReturnType<typeof createApp>) {
  const req = request(app)[route.method](route.path);
  if (route.body) {
    req.send(route.body);
  }
  return req;
}

describe('security hardening', () => {
  it.each(protectedRoutes)('returns 401 without token for $method $path', async (route) => {
    const { app } = createHarness();

    const response = await performRoute(route, app);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('keeps public routes public', async () => {
    const { app } = createHarness();

    const health = await request(app).get('/api/health');
    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@example.local',
      password: 'demo-password-123',
    });

    expect(health.status).toBe(200);
    expect(login.status).toBe(200);
  });

  it('enforces explicit role restrictions on protected mutations while keeping analytics available to business users', async () => {
    const { app, authService } = createHarness();
    const businessToken = await issueToken(authService, 'business');

    const restrictedResponses = await Promise.all([
      request(app)
        .post('/api/analyses')
        .set('Authorization', `Bearer ${businessToken}`)
        .send({ metrics: [], dimensions: [], visualization: { type: 'AUTO' } }),
      request(app)
        .post('/api/audiences')
        .set('Authorization', `Bearer ${businessToken}`)
        .send({ name: 'Audiência', filters: [] }),
      request(app)
        .post('/api/dashboards')
        .set('Authorization', `Bearer ${businessToken}`)
        .send({
          name: 'Dashboard',
          cards: [
            {
              id: 'card-1',
              title: 'Card',
              analysisId: 'analysis-1',
              layout: { mode: 'GRID', x: 0, y: 0, w: 4, h: 3 },
            },
          ],
        }),
      request(app)
        .post('/api/ai/copilot')
        .set('Authorization', `Bearer ${businessToken}`)
        .send({ prompt: 'Quero ver conversão por canal' }),
    ]);
    const analytics = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', `Bearer ${businessToken}`)
      .send({
        datasets: ['company_products', 'customer_360'],
        metrics: [{ id: 'products_per_company' }],
        dimensions: [{ id: 'company_size' }],
        filters: [],
        visualization: { type: 'AUTO' },
      });

    for (const response of restrictedResponses) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('forbidden');
    }

    expect(analytics.status).toBe(200);
  });

  it('does not expose internal stack traces in production responses and keeps debug details in test', async () => {
    const failingObjectRepository: ObjectRepository = {
      async get() {
        return undefined;
      },
      async put() {},
      async delete() {},
      async listByType() {
        throw new Error('repository exploded');
      },
      async findById() {
        return [];
      },
      async listShared() {
        return [];
      },
    };

    const productionHarness = createHarness(
      { NODE_ENV: 'production', RATE_LIMIT_ENABLED: 'true' },
      failingObjectRepository,
    );
    const testHarness = createHarness(
      { NODE_ENV: 'test', RATE_LIMIT_ENABLED: 'false' },
      failingObjectRepository,
    );
    const productionToken = await issueToken(productionHarness.authService, 'analyst');
    const testToken = await issueToken(testHarness.authService, 'analyst');

    const productionResponse = await request(productionHarness.app)
      .get('/api/dashboards')
      .set('Authorization', `Bearer ${productionToken}`);
    const testResponse = await request(testHarness.app)
      .get('/api/dashboards')
      .set('Authorization', `Bearer ${testToken}`);

    expect(productionResponse.status).toBe(500);
    expect(productionResponse.body.error.code).toBe('internal_error');
    expect(productionResponse.body.error).not.toHaveProperty('details');

    expect(testResponse.status).toBe(500);
    expect(testResponse.body.error.code).toBe('internal_error');
    expect(testResponse.body.error.details.message).toBe('repository exploded');
    expect(testResponse.body.error.details.stack).toContain('repository exploded');
  });

  it('returns a typed error when the JSON body exceeds the configured limit', async () => {
    const { app } = createHarness();

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.local',
        password: 'x'.repeat(300_000),
      });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('payload_too_large');
  });

  it('applies the global rate limiter to regular routes', async () => {
    const { app, authService } = createHarness({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_TOKENS_PER_MINUTE: '0',
      RATE_LIMIT_BURST: '2',
    });
    const token = await issueToken(authService, 'analyst');

    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);

    const limited = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
  });

  it('keeps the AI routes stricter than the global limiter', async () => {
    const { app, authService } = createHarness({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_TOKENS_PER_MINUTE: '0',
      RATE_LIMIT_BURST: '50',
    });
    const token = await issueToken(authService, 'analyst');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).get('/api/ai/tools').set('Authorization', `Bearer ${token}`).expect(200);
    }

    const limited = await request(app).get('/api/ai/tools').set('Authorization', `Bearer ${token}`);

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate_limited');
  });

  it('does not allow production config to silently disable the rate limiter', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const productionConfig = loadConfig({
      NODE_ENV: 'production',
      AUTH_MODE: 'dev',
      JWT_SECRET: 'prod-secret',
      RATE_LIMIT_ENABLED: 'false',
    });
    const testConfig = loadConfig({
      NODE_ENV: 'test',
      AUTH_MODE: 'dev',
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_ENABLED: 'false',
    });

    expect(productionConfig.rateLimit.enabled).toBe(true);
    expect(testConfig.rateLimit.enabled).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('RATE_LIMIT_ENABLED=false é permitido apenas em NODE_ENV=test'),
    );

    warnSpy.mockRestore();
  });

  it('warns when cognito mode runs with the default development JWT secret', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    loadConfig({
      NODE_ENV: 'production',
      AUTH_MODE: 'cognito',
      JWT_SECRET: 'dev-only-secret-change-me',
      COGNITO_USER_POOL_ID: 'pool',
      COGNITO_CLIENT_ID: 'client',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('JWT_SECRET padrão detectado com AUTH_MODE=cognito'),
    );

    warnSpy.mockRestore();
  });

  it('adds baseline security headers to API responses', async () => {
    const { app } = createHarness();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });
});
