import request from 'supertest';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
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

describe('Dashboard Routes', () => {
  let app: ReturnType<typeof createApp>;
  let authService: AuthService;

  beforeEach(() => {
    const config = createTestConfig();
    authService = new AuthService(config);
    const context = createApiContext({
      config,
      logger,
      authService,
      objectRepository: new InMemoryObjectRepository(),
    });

    app = createApp({ context });
  });

  it('supports CRUD with owner isolation and admin override', async () => {
    const ownerToken = await authService.issueDevAccessToken({
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });
    const otherAnalystToken = await authService.issueDevAccessToken({
      id: 'usr-analyst-2',
      email: 'analyst2@example.local',
      role: 'analyst',
    });
    const adminToken = await authService.issueDevAccessToken({
      id: 'usr-admin',
      email: 'admin@example.local',
      role: 'admin',
    });

    const ownerPayload = {
      name: 'Dashboard Comercial',
      description: 'Visão principal do funil',
      cards: [
        {
          id: 'card-1',
          title: 'Conversão por canal',
          analysisId: 'analysis-1',
          visualization: { type: 'BAR' },
          layout: { mode: 'GRID', x: 0, y: 0, w: 6, h: 4 },
        },
      ],
    };
    const otherPayload = {
      name: 'Dashboard Operações',
      cards: [
        {
          id: 'card-2',
          title: 'CAC',
          analysisId: 'analysis-2',
          layout: { mode: 'GRID', x: 0, y: 0, w: 4, h: 3 },
        },
      ],
    };

    const created = await request(app)
      .post('/api/dashboards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(ownerPayload);
    const createdOther = await request(app)
      .post('/api/dashboards')
      .set('Authorization', `Bearer ${otherAnalystToken}`)
      .send(otherPayload);

    expect(created.status).toBe(201);
    expect(created.body.dashboard.createdBy).toBe('usr-analyst');
    expect(created.body.dashboard.cards).toHaveLength(1);
    expect(created.body.dashboard.id).toEqual(expect.any(String));
    expect(createdOther.status).toBe(201);

    const dashboardId = created.body.dashboard.id as string;

    const ownerList = await request(app)
      .get('/api/dashboards')
      .set('Authorization', `Bearer ${ownerToken}`);
    const otherList = await request(app)
      .get('/api/dashboards')
      .set('Authorization', `Bearer ${otherAnalystToken}`);

    expect(ownerList.status).toBe(200);
    expect(ownerList.body.items).toHaveLength(1);
    expect(ownerList.body.items[0].name).toBe('Dashboard Comercial');
    expect(otherList.status).toBe(200);
    expect(otherList.body.items).toHaveLength(1);
    expect(otherList.body.items[0].name).toBe('Dashboard Operações');

    const fetched = await request(app)
      .get(`/api/dashboards/${dashboardId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const isolated = await request(app)
      .get(`/api/dashboards/${dashboardId}`)
      .set('Authorization', `Bearer ${otherAnalystToken}`);
    const adminFetch = await request(app)
      .get(`/api/dashboards/${dashboardId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(fetched.status).toBe(200);
    expect(fetched.body.dashboard.id).toBe(dashboardId);
    expect(isolated.status).toBe(404);
    expect(adminFetch.status).toBe(200);
    expect(adminFetch.body.dashboard.id).toBe(dashboardId);

    const updated = await request(app)
      .put(`/api/dashboards/${dashboardId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        ...ownerPayload,
        name: 'Dashboard Comercial Atualizado',
        cards: [
          ...ownerPayload.cards,
          {
            id: 'card-3',
            title: 'Receita proxy',
            analysisId: 'analysis-3',
            visualization: { type: 'LINE' },
            layout: { mode: 'GRID', x: 6, y: 0, w: 6, h: 4 },
          },
        ],
      });

    expect(updated.status).toBe(200);
    expect(updated.body.dashboard.name).toBe('Dashboard Comercial Atualizado');
    expect(updated.body.dashboard.cards).toHaveLength(2);

    const removed = await request(app)
      .delete(`/api/dashboards/${dashboardId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(removed.status).toBe(204);

    const ownerListAfterDelete = await request(app)
      .get('/api/dashboards')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerListAfterDelete.status).toBe(200);
    expect(ownerListAfterDelete.body.items).toHaveLength(0);
  });
});
