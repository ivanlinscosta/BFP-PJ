import request from 'supertest';
import { validateAnalysisSpec } from '@bfp/semantic-layer';
import { generateDatasetBundle } from '../../../../scripts/seed/generator';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { DEMO_ANALYSIS_SPECS } from '@api/demo/workspace';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';

const bundle = generateDatasetBundle({ scale: 0.1 });

function createHarness(clock: () => Date = () => new Date('2026-10-01T12:00:00.000Z')) {
  const config = loadConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev',
    JWT_SECRET: 'test-secret',
    RATE_LIMIT_ENABLED: 'false',
    SEED_DEMO_WORKSPACE: 'true',
    DATA_LOADED_AT: '2026-10-01T11:48:00.000Z',
  });
  const authService = new AuthService(config);
  const context = createApiContext({
    config,
    logger,
    authService,
    datasetBundle: bundle,
    clock,
  });

  return createApp({ context });
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'demo-password-123' });
  return `Bearer ${response.body.accessToken as string}`;
}

describe('demo workspace and new routes', () => {
  it('seeds only semantically valid analyses', () => {
    for (const { id, spec } of DEMO_ANALYSIS_SPECS) {
      const validation = validateAnalysisSpec(spec);
      expect(validation.errors, id).toEqual([]);
    }
  });

  it('returns profile data on login and /me', async () => {
    const app = createHarness();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@example.local', password: 'demo-password-123' });

    expect(response.body.user).toMatchObject({ name: 'Mariana Souza', team: 'Growth PJ' });
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken as string}`);
    expect(me.body.user).toMatchObject({ name: 'Mariana Souza', role: 'analyst' });
  });

  it('lists owned and shared dashboards with favorites and card summaries', async () => {
    const app = createHarness();
    const auth = await login(app, 'analyst@example.local');
    const response = await request(app).get('/api/dashboards').set('Authorization', auth);

    expect(response.status).toBe(200);
    const items = response.body.items as Array<{
      name: string;
      access: string;
      isFavorite: boolean;
      cardSummaries: Array<{ subtitle: string }>;
    }>;
    expect(items).toHaveLength(6);
    expect(items.filter((item) => item.access === 'OWNER')).toHaveLength(4);
    expect(items.filter((item) => item.access === 'VIEW')).toHaveLength(2);
    expect(items.filter((item) => item.isFavorite)).toHaveLength(3);
    const acquisition = items.find((item) => item.name === 'Aquisição por canal');
    expect(acquisition?.cardSummaries[0]?.subtitle).toBe('Estado = SP · Últimos 90 dias');
  });

  it('keeps private and team objects hidden from other teams and blocks read-only edits', async () => {
    const app = createHarness();
    const rafael = await login(app, 'business@example.local');
    const list = await request(app).get('/api/dashboards').set('Authorization', rafael);
    const names = (list.body.items as Array<{ name: string }>).map((item) => item.name);

    expect(names).toContain('Jornada de onboarding');
    expect(names).toContain('Clientes PJ por segmento');
    expect(names).not.toContain('Minha leitura da semana');
    expect(names).not.toContain('Aquisição por canal');

    const mariana = await login(app, 'analyst@example.local');
    const update = await request(app)
      .put('/api/dashboards/demo-dashboard-onboarding')
      .set('Authorization', mariana)
      .send({ name: 'Hack', cards: [] });
    expect(update.status).toBe(403);
  });

  it('opens a shared dashboard with its analyses and toggles favorites', async () => {
    const app = createHarness();
    const auth = await login(app, 'analyst@example.local');
    const detail = await request(app)
      .get('/api/dashboards/demo-dashboard-onboarding')
      .set('Authorization', auth);

    expect(detail.status).toBe(200);
    expect(Object.keys(detail.body.analyses)).toHaveLength(3);
    expect(detail.body.dashboard.access).toBe('VIEW');

    const favorite = await request(app)
      .put('/api/dashboards/demo-dashboard-onboarding/favorite')
      .set('Authorization', auth)
      .send({ favorite: true });
    expect(favorite.body.isFavorite).toBe(true);

    const list = await request(app).get('/api/dashboards').set('Authorization', auth);
    expect(
      (list.body.items as Array<{ isFavorite: boolean }>).filter((item) => item.isFavorite),
    ).toHaveLength(4);
  });

  it('enriches analytics results with deterministic insights and business labels', async () => {
    const app = createHarness();
    const auth = await login(app, 'analyst@example.local');
    const response = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', auth)
      .send({
        datasets: ['customer_360'],
        metrics: [{ id: 'account_conversion_rate' }],
        dimensions: [{ id: 'acquisition_channel' }],
        filters: [],
        dateRange: { type: 'ALL_TIME' },
        visualization: { type: 'BAR' },
      });

    expect(response.status).toBe(200);
    expect(response.body.columns[0].label).toBe('Canal');
    expect(response.body.valueLabels.acquisition_channel.GOOGLE_SEARCH).toBe('Google Search');
    expect(response.body.insights.length).toBeGreaterThan(0);
    expect(response.body.insights[0].type).toBe('DIFFERENCE');
    expect(response.body.metadata.plan.datasets).toEqual([
      { id: 'customer_360', name: 'Customer 360' },
    ]);

    const missing = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', auth)
      .send({
        metrics: [{ id: 'cac' }],
        dimensions: [{ id: 'company_size' }],
        filters: [],
        visualization: { type: 'BAR' },
      });
    expect(missing.status).toBe(422);
    expect(missing.body.error.details.issues[0].code).toBe('MISSING_DATASETS');

    const joined = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', auth)
      .send({
        datasets: ['media_touchpoints', 'customer_360'],
        metrics: [{ id: 'cac' }],
        dimensions: [{ id: 'company_size' }],
        filters: [],
        dateRange: { type: 'ALL_TIME' },
        visualization: { type: 'BAR' },
      });
    expect(joined.status).toBe(200);
    expect(
      joined.body.metadata.plan.joins.map((join: { description: string }) => join.description),
    ).toContain('Mídia ⋈ Customer 360 por company_id');
  });

  it('previews, saves and activates audiences through the simulated job lifecycle', async () => {
    let now = new Date('2026-10-01T12:00:00.000Z');
    const app = createHarness(() => now);
    const auth = await login(app, 'analyst@example.local');
    const filterGroups = {
      kind: 'group',
      id: 'root',
      operator: 'AND',
      rules: [
        { kind: 'rule', id: 'r1', field: 'state', operator: 'EQ', value: 'SP' },
        { kind: 'rule', id: 'r2', field: 'onboarding_status', operator: 'EQ', value: 'COMPLETED' },
      ],
    };

    const preview = await request(app)
      .post('/api/audiences/preview')
      .set('Authorization', auth)
      .send({ filterGroups });
    expect(preview.status).toBe(200);
    expect(preview.body.preview.size).toBeGreaterThan(0);
    expect(preview.body.preview.share).toBeLessThan(1);

    const saved = await request(app)
      .post('/api/audiences')
      .set('Authorization', auth)
      .send({ name: 'SP onboarding concluído', filterGroups });
    expect(saved.status).toBe(201);
    expect(saved.body.audience.estimatedSize).toBe(preview.body.preview.size);

    const job = await request(app)
      .post(`/api/audiences/${saved.body.audience.id as string}/activate`)
      .set('Authorization', auth)
      .send({ destination: 'CRM' });
    expect(job.status).toBe(202);
    expect(job.body.job.status).toBe('QUEUED');

    const statusAt = async (offsetMs: number) => {
      now = new Date(new Date('2026-10-01T12:00:00.000Z').getTime() + offsetMs);
      const response = await request(app)
        .get(`/api/audiences/${saved.body.audience.id as string}/activations`)
        .set('Authorization', auth);
      return response.body.items[0].status as string;
    };
    expect(await statusAt(2_000)).toBe('PROCESSING');
    expect(await statusAt(10_000)).toBe('COMPLETED');
  });

  it('rejects unknown audience fields with a typed error', async () => {
    const app = createHarness();
    const auth = await login(app, 'analyst@example.local');
    const response = await request(app)
      .post('/api/audiences/preview')
      .set('Authorization', auth)
      .send({
        filterGroups: {
          kind: 'group',
          id: 'root',
          operator: 'AND',
          rules: [{ kind: 'rule', id: 'x', field: 'cpf', operator: 'EQ', value: '1' }],
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('invalid_audience_rules');
  });

  it('serves catalog metric details with lineage and governance data products', async () => {
    const app = createHarness();
    const auth = await login(app, 'analyst@example.local');
    const metric = await request(app)
      .get('/api/catalog/metrics/account_conversion_rate')
      .set('Authorization', auth);

    expect(metric.status).toBe(200);
    expect(metric.body.calculation).toMatchObject({
      kind: 'RATIO',
      numerator: { label: 'Contas abertas' },
      denominator: { label: 'Leads elegíveis' },
      multiplier: 100,
    });
    expect(metric.body.lineage.stages.map((stage: { value: string }) => stage.value)).toEqual([
      'CRM + Mídia + Abertura de contas',
      'Acquisition Gold',
      'Conversão de abertura',
      'Análises / Audiências',
    ]);
    expect(metric.body.trust.freshnessMinutes).toBe(12);

    const governance = await request(app)
      .get('/api/governance/data-products')
      .set('Authorization', auth);
    expect(governance.body.items).toHaveLength(10);
    expect(governance.body.items[0].qualityRatio).toBeGreaterThan(0.9);
  });

  it('restricts admin overview to admins and persists feature flags', async () => {
    const app = createHarness();
    const analyst = await login(app, 'analyst@example.local');
    const admin = await login(app, 'admin@example.local');

    expect(
      (await request(app).get('/api/admin/overview').set('Authorization', analyst)).status,
    ).toBe(403);
    const overview = await request(app).get('/api/admin/overview').set('Authorization', admin);
    expect(overview.body.users).toHaveLength(3);
    expect(overview.body.semantic.metricCount).toBe(48);

    const flags = {
      aiCopilot: false,
      audienceActivation: true,
      csvExport: true,
      dashboardSharing: true,
    };
    await request(app).put('/api/admin/features').set('Authorization', admin).send(flags);
    const read = await request(app).get('/api/admin/features').set('Authorization', analyst);
    expect(read.body.flags.aiCopilot).toBe(false);
  });

  it('filters customers and exposes facets plus a curated Customer 360 journey', async () => {
    const app = createHarness();
    const auth = await login(app, 'analyst@example.local');
    const list = await request(app)
      .get('/api/customers?state=SP&size=M%C3%A9dia&pageSize=5')
      .set('Authorization', auth);

    expect(list.status).toBe(200);
    expect(
      (list.body.items as Array<{ state: string; companySize: string }>).every(
        (item) => item.state === 'SP' && item.companySize === 'Média',
      ),
    ).toBe(true);
    expect(list.body.facets.sizes).toContain('Média');

    const atlas = await request(app)
      .get('/api/customers?q=Atlas%20Tecnologia')
      .set('Authorization', auth);
    const atlasId = atlas.body.items[0].id as string;
    const detail = await request(app).get(`/api/customers/${atlasId}`).set('Authorization', auth);
    const journey = detail.body.customer.journey as Array<{ title: string; occurredAt: string }>;

    expect(journey.map((item) => item.title)).toContain('Lead criado');
    expect(journey.map((item) => item.title)).toContain('Conta aberta');
    expect([...journey].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))).toEqual(journey);
    expect(detail.body.customer.summary.acquisitionChannel).toBeDefined();
  });
});

describe('feature flags', () => {
  it('turns Inteligência PJ and activation off when disabled by an admin', async () => {
    const app = createHarness();
    const admin = await login(app, 'admin@example.local');
    const analyst = await login(app, 'analyst@example.local');
    await request(app).put('/api/admin/features').set('Authorization', admin).send({
      aiCopilot: false,
      audienceActivation: false,
      csvExport: true,
      dashboardSharing: true,
    });

    const chat = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', analyst)
      .send({ prompt: 'Qual canal converte mais?' });
    expect(chat.status).toBe(403);
    expect(chat.body.error.code).toBe('feature_disabled');

    const activation = await request(app)
      .post('/api/audiences/demo-audience-working-capital/activate')
      .set('Authorization', analyst)
      .send({ destination: 'CRM' });
    expect(activation.status).toBe(403);
  });
});
