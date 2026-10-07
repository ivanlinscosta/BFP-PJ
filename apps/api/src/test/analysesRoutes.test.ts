import request from 'supertest';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import { InMemoryObjectRepository } from '@api/repositories/inMemoryObjectRepository';

describe('Analyses Routes', () => {
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeEach(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AUTH_MODE: 'dev',
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_ENABLED: 'false',
      DATASET_TABLE: '',
      OBJECTS_TABLE: '',
    });
    const authService = new AuthService(config);
    const context = createApiContext({
      config,
      logger,
      authService,
      objectRepository: new InMemoryObjectRepository(),
    });

    app = createApp({ context });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@example.local', password: 'demo-password-123' });

    token = loginRes.body.accessToken;
  });

  it('should create and retrieve an analysis', async () => {
    const payload = {
      name: 'Test Analysis',
      metrics: [{ id: 'cac' }],
      dimensions: [{ id: 'acquisition_channel' }],
      visualization: { type: 'AUTO' },
    };

    const createRes = await request(app)
      .post('/api/analyses')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(createRes.status).toBe(201);
    expect(createRes.body.analysis.id).toBeDefined();
    expect(createRes.body.analysis.name).toBe('Test Analysis');

    const id = createRes.body.analysis.id;

    const getRes = await request(app)
      .get(`/api/analyses/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.analysis.id).toBe(id);
  });

  it('should list analyses for the owner and delete them', async () => {
    const createRes = await request(app)
      .post('/api/analyses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Listed Analysis',
        metrics: [{ id: 'cac' }],
        dimensions: [],
        visualization: { type: 'AUTO' },
      });

    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/analyses').set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].name).toBe('Listed Analysis');

    const deleteRes = await request(app)
      .delete(`/api/analyses/${createRes.body.analysis.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(204);

    const listAfterDelete = await request(app)
      .get('/api/analyses')
      .set('Authorization', `Bearer ${token}`);

    expect(listAfterDelete.body.items).toHaveLength(0);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/analyses');
    expect(res.status).toBe(401);
  });
});
