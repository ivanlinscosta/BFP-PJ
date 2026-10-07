import request from 'supertest';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';
import { AtlanClient } from '@api/services/integrations/atlan';
import { FullStoryClient } from '@api/services/integrations/fullstory';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Atlan client', () => {
  it('searches assets with the index search DSL and maps governance metadata', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new AtlanClient(
      { baseUrl: 'https://itau.atlan.com', apiToken: 'token-x', glossaryGuid: 'g-1' },
      (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse({
          entities: [
            {
              guid: 'abc',
              typeName: 'Table',
              attributes: {
                name: 'customer_360',
                qualifiedName: 'default/athena/bfp_pj_dev_customer360/customer_360',
                certificateStatus: 'VERIFIED',
                userDescription: 'Visão única da empresa PJ',
                ownerGroups: ['clientes-pj'],
                meanings: [{ displayText: 'Cliente PJ' }],
              },
            },
          ],
        });
      }) as typeof fetch,
    );

    const [asset] = await client.findByNames('Table', ['customer_360']);
    expect(calls[0]!.url).toBe('https://itau.atlan.com/api/meta/search/indexsearch');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer token-x');
    expect(JSON.parse(String(calls[0]!.init.body)).dsl.query.bool.filter).toContainEqual({
      terms: { 'name.keyword': ['customer_360'] },
    });
    expect(asset).toMatchObject({
      certificateStatus: 'VERIFIED',
      owners: ['clientes-pj'],
      terms: ['Cliente PJ'],
      url: 'https://itau.atlan.com/assets/abc/overview',
    });

    await client.upsertGlossaryTerms([
      { name: 'CAC', description: 'Custo', certified: false, owner: 'Acquisition PJ' },
    ]);
    const body = JSON.parse(String(calls[1]!.init.body));
    expect(calls[1]!.url).toContain('/api/meta/entity/bulk');
    expect(body.entities[0]).toMatchObject({
      typeName: 'AtlasGlossaryTerm',
      attributes: { name: 'CAC', certificateStatus: 'DRAFT', anchor: { guid: 'g-1' } },
    });
  });
});

describe('FullStory client', () => {
  it('lists session replays by uid with Basic auth and runs segment exports', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const responses: unknown[] = [
      {
        sessions: [
          {
            userId: 1,
            sessionId: 's-1',
            createdTime: 1783000000,
            fsUrl: 'https://app.fullstory.com/ui/o/session/s-1',
          },
        ],
      },
      { operationId: 'op-1' },
      { state: 'COMPLETED', results: { searchExportId: 'exp-1' } },
      { location: 'https://export.fullstory.com/exp-1.ndjson.gz' },
    ];
    const client = new FullStoryClient('fs-key', (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(responses.shift());
    }) as typeof fetch);

    const sessions = await client.listSessions('company-0027', 5);
    expect(calls[0]!.url).toBe('https://api.fullstory.com/sessions/v2?uid=company-0027&limit=5');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Basic fs-key');
    expect(sessions[0]).toMatchObject({ sessionId: 's-1', url: expect.stringContaining('s-1') });

    expect(
      await client.startEventExport('seg', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'),
    ).toBe('op-1');
    expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({
      segmentId: 'seg',
      type: 'TYPE_EVENT',
      format: 'FORMAT_NDJSON',
    });
    expect(await client.getExportLocation('op-1')).toBe(
      'https://export.fullstory.com/exp-1.ndjson.gz',
    );
  });
});

describe('mesh and integrations routes', () => {
  const bundle = generateDatasetBundle({ scale: 0.05 });
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test',
    RATE_LIMIT_ENABLED: 'false',
  });
  const app = createApp({
    context: createApiContext({
      config,
      logger,
      authService: new AuthService(config),
      datasetBundle: bundle,
    }),
  });

  async function login(email: string) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'demo-password-123' });
    return `Bearer ${response.body.accessToken as string}`;
  }

  it('lists mesh data products with schema, join key, LF tags and the metrics they publish', async () => {
    const response = await request(app)
      .get('/api/mesh/datasets')
      .set('Authorization', await login('analyst@example.local'));

    expect(response.status).toBe(200);
    expect(response.body.sources).toEqual({
      mesh: 'local',
      datazone: 'disabled',
      atlan: 'not_configured',
    });
    const media = response.body.items.find(
      (item: { id: string }) => item.id === 'media_touchpoints',
    );
    expect(media).toMatchObject({
      joinKey: 'company_id',
      location: { database: 'bfp_pj_dev_media', table: 'media_touchpoints' },
    });
    expect(media.metricIds).toContain('media_spend');
    expect(media.columns.map((column: { name: string }) => column.name)).toContain('company_id');
  });

  it('reports integration status and hides restricted domains from business users', async () => {
    const status = await request(app)
      .get('/api/integrations/status')
      .set('Authorization', await login('analyst@example.local'));
    expect(status.body).toMatchObject({
      atlan: 'not_configured',
      fullstory: 'not_configured',
      mesh: { datasets: 9 },
    });

    const business = await request(app)
      .get('/api/mesh/datasets')
      .set('Authorization', await login('business@example.local'));
    expect(business.body.items.map((item: { id: string }) => item.id)).not.toContain(
      'media_touchpoints',
    );

    const sync = await request(app)
      .post('/api/integrations/atlan/sync')
      .set('Authorization', await login('admin@example.local'));
    expect(sync.status).toBe(409);
  });
});
