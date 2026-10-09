import request from 'supertest';
import type { AuditLogEntry, DemoUser, DatasetBundle } from '@bfp/domain';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { createApiContext } from '@api/http/context';
import { createApp } from '@api/http/app';

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

function createFixtureBundle(): DatasetBundle {
  return {
    companies: [
      {
        id: 'company-0001',
        cnpjMasked: '10.000.000/0001-**',
        legalName: 'Grupo Exemplo Logistica LTDA',
        tradeName: 'Nova Armazenagem',
        segment: 'Logística',
        industry: 'Armazenagem',
        companySize: 'Micro',
        state: 'MG',
        city: 'Uberlândia',
        region: 'Sudeste',
        employeeCountRange: '1-5',
        annualRevenueRange: 'ATE_360K',
        acquisitionSource: 'PAID',
        acquisitionChannel: 'GOOGLE_SEARCH',
        acquisitionCampaignId: 'campaign-001',
        leadCreatedAt: '2026-01-01T08:00:00.000Z',
        accountOpeningStartedAt: '2026-01-02T08:00:00.000Z',
        accountOpenedAt: '2026-01-03T08:00:00.000Z',
        onboardingStartedAt: '2026-01-04T08:00:00.000Z',
        onboardingCompletedAt: '2026-01-05T08:00:00.000Z',
        activationDate: '2026-01-10T08:00:00.000Z',
        status: 'ACTIVE',
        relationshipManagerId: 'rm-01',
        lgpdConsent: true,
        riskProfile: 'LOW',
        createdAt: '2026-01-01T08:00:00.000Z',
      },
      {
        id: 'company-0002',
        cnpjMasked: '20.000.000/0001-**',
        legalName: 'Servicos Alpha LTDA',
        tradeName: 'Alpha Servicos',
        segment: 'Serviços',
        industry: 'Tecnologia',
        companySize: 'Pequena',
        state: 'SP',
        city: 'São Paulo',
        region: 'Sudeste',
        employeeCountRange: '11-50',
        annualRevenueRange: '360K_A_4_8M',
        acquisitionSource: 'ORGANIC',
        acquisitionChannel: 'ORGANIC',
        acquisitionCampaignId: null,
        leadCreatedAt: '2026-01-06T08:00:00.000Z',
        accountOpeningStartedAt: '2026-01-07T08:00:00.000Z',
        accountOpenedAt: '2026-01-08T08:00:00.000Z',
        onboardingStartedAt: '2026-01-09T08:00:00.000Z',
        onboardingCompletedAt: '2026-01-10T08:00:00.000Z',
        activationDate: '2026-01-12T08:00:00.000Z',
        status: 'ACTIVE',
        relationshipManagerId: 'rm-02',
        lgpdConsent: true,
        riskProfile: 'MEDIUM',
        createdAt: '2026-01-06T08:00:00.000Z',
      },
    ],
    partners: [
      {
        id: 'partner-001',
        companyId: 'company-0001',
        name: 'Maria Silva',
        role: 'OWNER',
        ownershipPercentage: 70,
        ageRange: '36-45',
        state: 'MG',
        joinedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        id: 'partner-002',
        companyId: 'company-0002',
        name: 'João Souza',
        role: 'ADMINISTRATOR',
        ownershipPercentage: 100,
        ageRange: '26-35',
        state: 'SP',
        joinedAt: '2026-01-06T12:00:00.000Z',
      },
    ],
    accounts: [
      {
        id: 'account-001',
        companyId: 'company-0001',
        provider: 'BFP Bank',
        type: 'CHECKING',
        status: 'OPEN',
        accountNumberMasked: '****1234',
        openedAt: '2026-01-03T08:00:00.000Z',
        createdAt: '2026-01-02T08:00:00.000Z',
        closedAt: null,
      },
      {
        id: 'account-002',
        companyId: 'company-0002',
        provider: 'BFP Bank',
        type: 'PAYMENT',
        status: 'OPEN',
        accountNumberMasked: '****5678',
        openedAt: '2026-01-08T08:00:00.000Z',
        createdAt: '2026-01-07T08:00:00.000Z',
        closedAt: null,
      },
    ],
    products: [
      {
        id: 'product-001',
        name: 'Conta PJ',
        shortName: 'Conta',
        category: 'BANKING',
        status: 'ACTIVE',
        monthlyBasePrice: 0,
        isCoreProduct: true,
        createdAt: '2025-12-01T00:00:00.000Z',
      },
      {
        id: 'product-002',
        name: 'Cartão Empresarial',
        shortName: 'Cartão',
        category: 'PAYMENTS',
        status: 'ACTIVE',
        monthlyBasePrice: 39,
        isCoreProduct: false,
        createdAt: '2025-12-02T00:00:00.000Z',
      },
    ],
    companyProducts: [
      {
        id: 'company-product-001',
        companyId: 'company-0001',
        productId: 'product-001',
        status: 'ACTIVE',
        contractedAt: '2026-01-05T08:00:00.000Z',
        activatedAt: '2026-01-06T08:00:00.000Z',
        cancelledAt: null,
        monthlyRevenueProxy: 100,
      },
      {
        id: 'company-product-002',
        companyId: 'company-0002',
        productId: 'product-002',
        status: 'ACTIVE',
        contractedAt: '2026-01-10T08:00:00.000Z',
        activatedAt: '2026-01-11T08:00:00.000Z',
        cancelledAt: null,
        monthlyRevenueProxy: 140,
      },
    ],
    mediaCampaigns: [
      {
        id: 'campaign-001',
        name: 'Search Janeiro',
        channel: 'GOOGLE_SEARCH',
        source: 'PAID',
        objective: 'LEAD_GENERATION',
        budget: 10000,
        status: 'ACTIVE',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T23:59:59.999Z',
        createdAt: '2025-12-15T00:00:00.000Z',
      },
    ],
    mediaTouchpoints: [
      {
        id: 'touchpoint-001',
        companyId: 'company-0001',
        campaignId: 'campaign-001',
        channel: 'GOOGLE_SEARCH',
        touchpointType: 'CLICK',
        occurredAt: '2026-01-01T09:00:00.000Z',
        cost: 15,
        impressions: 120,
        clicks: 1,
      },
      {
        id: 'touchpoint-002',
        companyId: 'company-0002',
        campaignId: null,
        channel: 'ORGANIC',
        touchpointType: 'LANDING_PAGE_VISIT',
        occurredAt: '2026-01-06T09:00:00.000Z',
        cost: 0,
        impressions: 60,
        clicks: 1,
      },
    ],
    funnelEvents: [
      {
        id: 'funnel-001',
        companyId: 'company-0001',
        eventType: 'ACCOUNT_OPENED',
        occurredAt: '2026-01-03T10:00:00.000Z',
        sourceChannel: 'GOOGLE_SEARCH',
        campaignId: 'campaign-001',
      },
      {
        id: 'funnel-002',
        companyId: 'company-0002',
        eventType: 'ACCOUNT_OPENED',
        occurredAt: '2026-01-08T10:00:00.000Z',
        sourceChannel: 'ORGANIC',
        campaignId: null,
      },
    ],
    crmInteractions: [
      {
        id: 'crm-001',
        companyId: 'company-0001',
        interactionType: 'CALL',
        direction: 'OUTBOUND',
        outcome: 'CONNECTED',
        occurredAt: '2026-01-04T09:00:00.000Z',
        ownerId: 'rm-01',
        relatedConversationId: null,
      },
    ],
    conversations: [
      {
        id: 'conversation-001',
        companyId: 'company-0001',
        channel: 'WHATSAPP',
        status: 'OPEN',
        subject: 'Dúvida sobre onboarding',
        startedAt: '2026-01-04T10:00:00.000Z',
        resolvedAt: null,
        ownerId: 'rm-01',
        messageCount: 3,
      },
    ],
    digitalEvents: [
      {
        id: 'digital-001',
        companyId: 'company-0001',
        eventType: 'LOGIN',
        channel: 'WEB',
        productId: 'product-001',
        occurredAt: '2026-01-10T11:00:00.000Z',
        sessionId: 'session-001',
        value: null,
      },
      {
        id: 'digital-002',
        companyId: 'company-0002',
        eventType: 'FEATURE_USE',
        channel: 'WEB',
        productId: 'product-002',
        occurredAt: '2026-01-12T11:00:00.000Z',
        sessionId: 'session-002',
        value: 1,
      },
    ],
    appNavigationEvents: [],
    transactions: [],
    npsResponses: [],
    customerIntelligence: [],
    qualityStatuses: [
      {
        id: 'quality-001',
        companyId: 'company-0001',
        scopeType: 'company',
        scopeId: 'company-0001',
        status: 'WARNING',
        score: 88,
        checkedAt: '2026-01-12T12:00:00.000Z',
        summary: 'Uma conversa segue em aberto.',
        incidents: [
          {
            id: 'incident-001',
            severity: 'MEDIUM',
            status: 'OPEN',
            title: 'Conversa em aberto',
            description: 'Uma conversa ainda não foi resolvida.',
            detectedAt: '2026-01-12T12:00:00.000Z',
            resolvedAt: null,
          },
        ],
      },
    ],
    auditLogs: [],
  };
}

function createTestHarness() {
  const config = createTestConfig();
  const auditSpy: Array<{ queryId: string; status: string }> = [];
  const context = createApiContext({
    config,
    datasetBundle: createFixtureBundle(),
    clock: () => new Date('2026-01-15T12:00:00.000Z'),
    auditSpy: (entry) => {
      auditSpy.push({ queryId: entry.queryId, status: entry.status });
    },
  });

  return {
    app: createApp({ context }),
    authService: context.authService,
    context,
    auditSpy,
  };
}

async function issueToken(authService: AuthService, user: Pick<DemoUser, 'id' | 'email' | 'role'>) {
  return authService.issueDevAccessToken(user);
}

describe('fase 6 api routes', () => {
  it('supports dev login and me', async () => {
    const { app } = createTestHarness();

    const login = await request(app).post('/api/auth/login').send({
      email: 'admin@example.local',
      password: 'demo-password-123',
    });

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe('admin@example.local');
    expect(login.body.user.role).toBe('admin');
    expect(login.body.accessToken).toEqual(expect.any(String));

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.user.userId).toBe('usr-admin');
    expect(me.body.user.role).toBe('admin');
  });

  it('returns 401 and 403 for protected and role-restricted routes', async () => {
    const { app, authService } = createTestHarness();
    const businessToken = await issueToken(authService, {
      id: 'usr-business',
      email: 'business@example.local',
      role: 'business',
    });

    const unauthorized = await request(app).post('/api/analytics/query').send({});
    const forbiddenAudience = await request(app)
      .get('/api/audiences')
      .set('Authorization', `Bearer ${businessToken}`);
    const forbiddenAi = await request(app)
      .post('/api/ai/copilot')
      .set('Authorization', `Bearer ${businessToken}`)
      .send({ prompt: 'conversão por canal' });

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error.code).toBe('unauthorized');
    expect(forbiddenAudience.status).toBe(403);
    expect(forbiddenAudience.body.error.code).toBe('forbidden');
    expect(forbiddenAi.status).toBe(403);
    expect(forbiddenAi.body.error.code).toBe('forbidden');
  });

  it('executes analytics queries and persists audit entries', async () => {
    const { app, authService, context, auditSpy } = createTestHarness();
    const analystToken = await issueToken(authService, {
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });

    const response = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        datasets: ['customer_360'],
        metrics: [{ id: 'companies_total' }],
        dimensions: [{ id: 'state' }],
        filters: [],
        visualization: { type: 'AUTO' },
      });

    expect(response.status).toBe(200);
    expect(response.body.columns.map((column: { key: string }) => column.key)).toEqual([
      'state',
      'companies_total',
    ]);
    expect(response.body.rows).toHaveLength(2);
    expect(response.body.rows[0]).toHaveProperty('state');
    expect(response.body.rows[0]).toHaveProperty('companies_total');
    expect(response.body.metadata.rowCount).toBe(2);
    expect(response.body.visualization.recommendedType).toBeDefined();

    const audits = await context.getDatasetRepository().listByType<AuditLogEntry>('auditLog');
    expect(audits).toHaveLength(1);
    expect(audits[0].userId).toBe('usr-analyst');
    expect(audits[0].status).toBe('SUCCESS');
    expect(audits[0].metrics).toEqual(['companies_total']);
    expect(auditSpy).toHaveLength(1);
    expect(auditSpy[0].status).toBe('SUCCESS');
  });

  it('returns 422 typed errors for invalid analytics specs', async () => {
    const { app, authService } = createTestHarness();
    const analystToken = await issueToken(authService, {
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });

    const response = await request(app)
      .post('/api/analytics/query')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        metrics: [{ id: 'metric-that-does-not-exist' }],
        dimensions: [],
        filters: [],
        visualization: { type: 'AUTO' },
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('invalid_analysis_spec');
    expect(response.body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'UNKNOWN_METRIC' })]),
    );
  });

  it('lists catalog resources and supports accent-insensitive search', async () => {
    const { app, authService } = createTestHarness();
    const analystToken = await issueToken(authService, {
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });

    const metrics = await request(app)
      .get('/api/catalog/metrics?q=conversão')
      .set('Authorization', `Bearer ${analystToken}`);
    const glossary = await request(app)
      .get('/api/catalog/glossary?q=conversa')
      .set('Authorization', `Bearer ${analystToken}`);
    const lineage = await request(app)
      .get('/api/catalog/lineage?q=conversion')
      .set('Authorization', `Bearer ${analystToken}`);

    expect(metrics.status).toBe(200);
    expect(metrics.body.total).toBeGreaterThan(0);
    expect(metrics.body.items.some((item: { id: string }) => item.id.includes('conversion'))).toBe(
      true,
    );
    expect(glossary.status).toBe(200);
    expect(glossary.body.total).toBeGreaterThan(0);
    expect(
      glossary.body.items.some((item: { term: string }) =>
        item.term.toLowerCase().includes('convers'),
      ),
    ).toBe(true);
    expect(lineage.status).toBe(200);
    expect(Array.isArray(lineage.body.graph.nodes)).toBe(true);
    expect(Array.isArray(lineage.body.graph.edges)).toBe(true);
  });

  it('lists customers and returns the assembled customer360 shape', async () => {
    const { app, authService } = createTestHarness();
    const businessToken = await issueToken(authService, {
      id: 'usr-business',
      email: 'business@example.local',
      role: 'business',
    });

    const list = await request(app)
      .get('/api/customers?page=1&pageSize=1&q=alpha')
      .set('Authorization', `Bearer ${businessToken}`);
    const detail = await request(app)
      .get('/api/customers/company-0001')
      .set('Authorization', `Bearer ${businessToken}`);

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe('company-0002');
    expect(list.body.pagination.total).toBe(1);

    expect(detail.status).toBe(200);
    expect(detail.body.customer.company.id).toBe('company-0001');
    expect(detail.body.customer.partners).toHaveLength(1);
    expect(detail.body.customer.accounts).toHaveLength(1);
    expect(detail.body.customer.products).toHaveLength(1);
    expect(detail.body.customer.campaigns).toHaveLength(1);
    expect(detail.body.customer.touchpoints).toHaveLength(1);
    expect(detail.body.customer.funnel).toHaveLength(1);
    expect(detail.body.customer.crm).toHaveLength(1);
    expect(detail.body.customer.conversations).toHaveLength(1);
    expect(detail.body.customer.digitalEvents).toHaveLength(1);
    expect(detail.body.customer.timeline.length).toBeGreaterThan(5);
  });

  it('supports audiences CRUD and isolates ownership for non-admin users', async () => {
    const { app, authService } = createTestHarness();
    const ownerToken = await issueToken(authService, {
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });
    const otherAnalystToken = await issueToken(authService, {
      id: 'usr-analyst-2',
      email: 'analyst2@example.local',
      role: 'analyst',
    });

    const created = await request(app)
      .post('/api/audiences')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Empresas SP',
        filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
      });

    expect(created.status).toBe(201);
    expect(created.body.audience.createdBy).toBe('usr-analyst');
    expect(created.body.audience.name).toBe('Empresas SP');
    const audienceId = created.body.audience.id as string;

    const list = await request(app)
      .get('/api/audiences')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const fetched = await request(app)
      .get(`/api/audiences/${audienceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.audience.id).toBe(audienceId);

    const isolated = await request(app)
      .get(`/api/audiences/${audienceId}`)
      .set('Authorization', `Bearer ${otherAnalystToken}`);
    expect(isolated.status).toBe(404);

    const updated = await request(app)
      .put(`/api/audiences/${audienceId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Empresas SP Atualizadas',
        filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
        status: 'READY',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.audience.status).toBe('READY');
    expect(updated.body.audience.name).toBe('Empresas SP Atualizadas');

    const removed = await request(app)
      .delete(`/api/audiences/${audienceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(removed.status).toBe(204);

    const afterDelete = await request(app)
      .get('/api/audiences')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(afterDelete.body.items).toHaveLength(0);
  });

  it('returns quality summaries and quality catalog views', async () => {
    const { app, authService } = createTestHarness();
    const analystToken = await issueToken(authService, {
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });

    const summary = await request(app)
      .get('/api/quality/summary')
      .set('Authorization', `Bearer ${analystToken}`);
    const catalogQuality = await request(app)
      .get('/api/catalog/quality')
      .set('Authorization', `Bearer ${analystToken}`);

    expect(summary.status).toBe(200);
    expect(summary.body.overview.score).toBeGreaterThan(0);
    expect(summary.body.overview.trackedScopes).toBeGreaterThan(0);
    expect(Array.isArray(summary.body.statuses)).toBe(true);
    expect(Array.isArray(summary.body.dataProducts)).toBe(true);

    expect(catalogQuality.status).toBe(200);
    expect(catalogQuality.body.total).toBeGreaterThan(0);
    expect(catalogQuality.body.items[0]).toHaveProperty('quality');
  });

  it('returns the deterministic AI stub contract and tool surface', async () => {
    const { app, authService } = createTestHarness();
    const analystToken = await issueToken(authService, {
      id: 'usr-analyst',
      email: 'analyst@example.local',
      role: 'analyst',
    });

    const tools = await request(app)
      .get('/api/ai/tools')
      .set('Authorization', `Bearer ${analystToken}`);
    const copilot = await request(app)
      .post('/api/ai/copilot')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ prompt: 'Quero ver conversão por canal' });

    expect(tools.status).toBe(200);
    expect(tools.body.provider).toBe('local-deterministic-stub');
    expect(tools.body.tools).toHaveLength(10);
    expect(tools.body.tools[0]).toHaveProperty('inputSchema');

    expect(copilot.status).toBe(200);
    expect(copilot.body.action).toBe('UPDATE_ANALYSIS');
    expect(copilot.body.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ADD_METRIC', metricId: 'account_conversion_rate' }),
      ]),
    );
    expect(copilot.body.toolSurface).toHaveLength(10);
    expect(copilot.body.explainability.mode).toBe('stub');
  });
});
