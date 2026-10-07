import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AnalysisSpec, AuditLogEntry, DatasetBundle } from '@bfp/domain';
import { validateAnalysisSpec } from '@bfp/semantic-layer';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';

import {
  DynamoDBAnalyticsQueryEngine,
  InMemoryAnalyticsQueryEngine,
  bucketDateValue,
  matchesFilterCondition,
  recommendVisualization,
  resolveDateRange,
} from './index';

function asRecords<T extends object>(items: readonly T[]) {
  return items as unknown as Array<Record<string, unknown>>;
}

function createFixtureBundle(): DatasetBundle {
  return {
    companies: [
      {
        id: 'company-1',
        cnpjMasked: '10.000.000/0001-**',
        legalName: 'Empresa Um LTDA',
        tradeName: 'Empresa Um',
        segment: 'Serviços',
        industry: 'Consultoria',
        companySize: 'Pequena',
        state: 'SP',
        city: 'São Paulo',
        region: 'Sudeste',
        employeeCountRange: '11-50',
        annualRevenueRange: '4_8M_A_50M',
        acquisitionSource: 'PAID',
        acquisitionChannel: 'GOOGLE_SEARCH',
        acquisitionCampaignId: 'campaign-1',
        leadCreatedAt: '2026-01-15T12:00:00.000Z',
        accountOpeningStartedAt: '2026-01-17T12:00:00.000Z',
        accountOpenedAt: '2026-01-20T12:00:00.000Z',
        onboardingStartedAt: '2026-01-21T12:00:00.000Z',
        onboardingCompletedAt: '2026-01-25T12:00:00.000Z',
        activationDate: '2026-01-28T12:00:00.000Z',
        status: 'ACTIVE',
        relationshipManagerId: 'rm-1',
        lgpdConsent: true,
        riskProfile: 'LOW',
        createdAt: '2026-01-10T12:00:00.000Z',
      },
      {
        id: 'company-2',
        cnpjMasked: '20.000.000/0001-**',
        legalName: 'Empresa Dois LTDA',
        tradeName: 'Empresa Dois',
        segment: 'Serviços',
        industry: 'Educação',
        companySize: 'Média',
        state: 'RJ',
        city: 'Rio de Janeiro',
        region: 'Sudeste',
        employeeCountRange: '51-200',
        annualRevenueRange: '50M_A_300M',
        acquisitionSource: 'PAID',
        acquisitionChannel: 'META',
        acquisitionCampaignId: 'campaign-2',
        leadCreatedAt: '2026-02-01T15:00:00.000Z',
        accountOpeningStartedAt: null,
        accountOpenedAt: null,
        onboardingStartedAt: null,
        onboardingCompletedAt: null,
        activationDate: null,
        status: 'ONBOARDING',
        relationshipManagerId: 'rm-2',
        lgpdConsent: true,
        riskProfile: 'MEDIUM',
        createdAt: '2026-01-31T12:00:00.000Z',
      },
      {
        id: 'company-3',
        cnpjMasked: '30.000.000/0001-**',
        legalName: 'Empresa Três LTDA',
        tradeName: 'Empresa Três',
        segment: 'Tecnologia',
        industry: 'Software',
        companySize: 'Pequena',
        state: 'SP',
        city: 'Campinas',
        region: 'Sudeste',
        employeeCountRange: '11-50',
        annualRevenueRange: '4_8M_A_50M',
        acquisitionSource: 'PAID',
        acquisitionChannel: 'GOOGLE_SEARCH',
        acquisitionCampaignId: 'campaign-1',
        leadCreatedAt: '2026-01-18T12:00:00.000Z',
        accountOpeningStartedAt: '2026-01-22T12:00:00.000Z',
        accountOpenedAt: '2026-01-25T12:00:00.000Z',
        onboardingStartedAt: '2026-01-26T12:00:00.000Z',
        onboardingCompletedAt: '2026-01-29T12:00:00.000Z',
        activationDate: '2026-02-20T12:00:00.000Z',
        status: 'ACTIVE',
        relationshipManagerId: 'rm-3',
        lgpdConsent: true,
        riskProfile: 'LOW',
        createdAt: '2026-01-20T12:00:00.000Z',
      },
    ],
    partners: [],
    accounts: [],
    products: [
      {
        id: 'product-1',
        name: 'Conta PJ',
        shortName: 'Conta',
        category: 'BANKING',
        status: 'ACTIVE',
        monthlyBasePrice: 99,
        isCoreProduct: true,
        createdAt: '2025-12-01T12:00:00.000Z',
      },
      {
        id: 'product-2',
        name: 'Seguro PJ',
        shortName: 'Seguro',
        category: 'INSURANCE',
        status: 'ACTIVE',
        monthlyBasePrice: 49,
        isCoreProduct: false,
        createdAt: '2025-12-01T12:00:00.000Z',
      },
    ],
    companyProducts: [
      {
        id: 'cp-1',
        companyId: 'company-1',
        productId: 'product-1',
        status: 'ACTIVE',
        contractedAt: '2026-01-20T12:00:00.000Z',
        activatedAt: '2026-01-21T12:00:00.000Z',
        cancelledAt: null,
        monthlyRevenueProxy: 100,
      },
      {
        id: 'cp-2',
        companyId: 'company-1',
        productId: 'product-2',
        status: 'CONTRACTED',
        contractedAt: '2026-01-21T12:00:00.000Z',
        activatedAt: null,
        cancelledAt: null,
        monthlyRevenueProxy: 50,
      },
      {
        id: 'cp-3',
        companyId: 'company-3',
        productId: 'product-1',
        status: 'ACTIVE',
        contractedAt: '2026-01-25T12:00:00.000Z',
        activatedAt: '2026-01-25T12:00:00.000Z',
        cancelledAt: null,
        monthlyRevenueProxy: 100,
      },
      {
        id: 'cp-4',
        companyId: 'company-3',
        productId: 'product-2',
        status: 'CANCELLED',
        contractedAt: '2026-01-26T12:00:00.000Z',
        activatedAt: null,
        cancelledAt: '2026-01-29T12:00:00.000Z',
        monthlyRevenueProxy: 50,
      },
    ],
    mediaCampaigns: [
      {
        id: 'campaign-1',
        name: 'Campanha Meta 1',
        channel: 'META',
        source: 'PAID',
        objective: 'LEAD_GENERATION',
        budget: 1000,
        status: 'ACTIVE',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-02-28T23:59:59.999Z',
        createdAt: '2025-12-15T00:00:00.000Z',
      },
      {
        id: 'campaign-2',
        name: 'Campanha LinkedIn 1',
        channel: 'LINKEDIN',
        source: 'PAID',
        objective: 'AWARENESS',
        budget: 500,
        status: 'ACTIVE',
        startDate: '2026-01-15T00:00:00.000Z',
        endDate: '2026-02-15T23:59:59.999Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    mediaTouchpoints: [
      {
        id: 'touchpoint-1',
        companyId: 'company-1',
        campaignId: 'campaign-1',
        channel: 'META',
        touchpointType: 'CLICK',
        occurredAt: '2026-02-01T02:30:00.000Z',
        cost: 100,
        impressions: 1000,
        clicks: 100,
      },
      {
        id: 'touchpoint-2',
        companyId: 'company-2',
        campaignId: 'campaign-2',
        channel: 'LINKEDIN',
        touchpointType: 'CLICK',
        occurredAt: '2026-02-01T03:30:00.000Z',
        cost: 50,
        impressions: 500,
        clicks: 25,
      },
      {
        id: 'touchpoint-3',
        companyId: 'company-3',
        campaignId: 'campaign-1',
        channel: 'META',
        touchpointType: 'CLICK',
        occurredAt: '2026-01-20T12:00:00.000Z',
        cost: 200,
        impressions: 2000,
        clicks: 200,
      },
      {
        id: 'touchpoint-4',
        companyId: 'missing-company',
        campaignId: null,
        channel: 'EMAIL',
        touchpointType: 'CLICK',
        occurredAt: '2026-01-22T12:00:00.000Z',
        cost: 75,
        impressions: 300,
        clicks: 10,
      },
    ],
    funnelEvents: [],
    crmInteractions: [],
    conversations: [
      {
        id: 'conversation-1',
        companyId: 'company-1',
        channel: 'CHAT',
        status: 'OPEN',
        subject: 'Onboarding',
        startedAt: '2026-01-27T12:00:00.000Z',
        resolvedAt: null,
        ownerId: 'owner-1',
        messageCount: 4,
      },
      {
        id: 'conversation-2',
        companyId: 'company-2',
        channel: 'EMAIL',
        status: 'RESOLVED',
        subject: 'Mídia',
        startedAt: '2026-02-02T12:00:00.000Z',
        resolvedAt: '2026-02-02T18:00:00.000Z',
        ownerId: 'owner-2',
        messageCount: 2,
      },
      {
        id: 'conversation-3',
        companyId: 'company-3',
        channel: 'WHATSAPP',
        status: 'ESCALATED',
        subject: 'Produto',
        startedAt: '2026-02-03T12:00:00.000Z',
        resolvedAt: null,
        ownerId: 'owner-3',
        messageCount: 5,
      },
    ],
    digitalEvents: [],
    appNavigationEvents: [],
    transactions: [],
    npsResponses: [],
    qualityStatuses: [],
    auditLogs: [],
  };
}

function validatedQuery(spec: AnalysisSpec) {
  const validation = validateAnalysisSpec(spec, { requireDatasets: false });
  expect(validation.ok).toBe(true);
  expect(validation.errors).toHaveLength(0);
  return validation.resolvedQuery!;
}

describe('@bfp/analytics-engine helpers', () => {
  it('resolves preset date ranges in São Paulo local time', () => {
    const window = resolveDateRange(
      { type: 'THIS_MONTH' },
      { referenceDate: new Date('2026-02-01T03:30:00.000Z') },
    );

    expect(window.from).toBe('2026-02-01T03:00:00.000Z');
    expect(window.to).toBe('2026-03-01T03:00:00.000Z');
  });

  it('buckets dates by day, week, and month using America/Sao_Paulo', () => {
    expect(bucketDateValue('2026-02-01T02:30:00.000Z', 'date')).toBe('2026-01-31');
    expect(bucketDateValue('2026-02-01T03:30:00.000Z', 'month')).toBe('2026-02');
    expect(bucketDateValue('2026-02-01T02:30:00.000Z', 'week')).toBe('2026-W05');
    expect(bucketDateValue('2026-02-01T03:30:00.000Z', 'week')).toBe('2026-W05');
  });

  it('supports every filter operator from the shared domain contract', () => {
    expect(matchesFilterCondition({ field: 'state', operator: 'EQ', value: 'SP' }, ['SP'])).toBe(
      true,
    );
    expect(matchesFilterCondition({ field: 'state', operator: 'NEQ', value: 'RJ' }, ['SP'])).toBe(
      true,
    );
    expect(
      matchesFilterCondition({ field: 'state', operator: 'IN', value: ['SP', 'RJ'] }, ['SP']),
    ).toBe(true);
    expect(
      matchesFilterCondition({ field: 'state', operator: 'NOT_IN', value: ['MG'] }, ['SP']),
    ).toBe(true);
    expect(matchesFilterCondition({ field: 'score', operator: 'GT', value: 10 }, [15])).toBe(true);
    expect(matchesFilterCondition({ field: 'score', operator: 'GTE', value: 15 }, [15])).toBe(true);
    expect(matchesFilterCondition({ field: 'score', operator: 'LT', value: 20 }, [15])).toBe(true);
    expect(matchesFilterCondition({ field: 'score', operator: 'LTE', value: 15 }, [15])).toBe(true);
    expect(
      matchesFilterCondition({ field: 'score', operator: 'BETWEEN', value: [10, 20] }, [15]),
    ).toBe(true);
    expect(
      matchesFilterCondition({ field: 'label', operator: 'CONTAINS', value: 'paul' }, [
        'São Paulo',
      ]),
    ).toBe(true);
    expect(matchesFilterCondition({ field: 'maybe', operator: 'IS_NULL' }, [null])).toBe(true);
    expect(matchesFilterCondition({ field: 'maybe', operator: 'IS_NOT_NULL' }, [1])).toBe(true);
  });

  it('recommends the full visualization rule matrix', () => {
    const singleMetric = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(recommendVisualization(singleMetric, []).recommendedType).toBe('KPI');

    const temporal = validatedQuery({
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'touchpoint_date', granularity: 'date' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(
      recommendVisualization(temporal, [{ touchpoint_date: '2026-01-01', media_spend: 1 }])
        .recommendedType,
    ).toBe('LINE');

    const bar = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'state' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(
      recommendVisualization(bar, [{ state: 'SP' }, { state: 'RJ' }, { state: 'MG' }])
        .recommendedType,
    ).toBe('BAR');

    const limitedBar = recommendVisualization(
      bar,
      Array.from({ length: 9 }, (_, index) => ({ state: `S${index}`, leads: index })),
    );
    expect(limitedBar.recommendedType).toBe('BAR');
    expect(limitedBar.appliedLimit).toBe(20);

    const groupedBar = validatedQuery({
      metrics: [{ id: 'clicks' }, { id: 'impressions' }],
      dimensions: [{ id: 'campaign_channel' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(recommendVisualization(groupedBar, [{ campaign_channel: 'META' }]).recommendedType).toBe(
      'GROUPED_BAR',
    );

    const funnelQuery: ValidatedAnalysisQuery = {
      ...singleMetric,
      dimensions: [
        {
          request: { id: 'eventType' },
          definition: {
            id: 'eventType',
            name: 'Etapa do funil',
            description: 'Dimensão sintética de funil usada pelo recomendador.',
            type: 'string',
            domain: 'acquisition',
            source: 'funnelEvent.eventType',
            allowedOperators: ['EQ', 'IN'],
            sensitivity: 'INTERNAL',
            certificationStatus: 'CERTIFIED',
          },
          baseEntity: 'funnelEvent',
          sourceFields: [{ entityType: 'funnelEvent', field: 'eventType' }],
        },
      ],
    };
    expect(
      recommendVisualization(funnelQuery, [{ eventType: 'LEAD_CREATED' }]).recommendedType,
    ).toBe('FUNNEL');

    const stacked = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'state' }, { id: 'company_size' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(
      recommendVisualization(stacked, [{ state: 'SP', company_size: 'Pequena' }]).recommendedType,
    ).toBe('HEATMAP');

    const stackedOverTime = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'lead_date', granularity: 'month' }, { id: 'company_size' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(
      recommendVisualization(stackedOverTime, [{ lead_date: '2026-09', company_size: 'Pequena' }])
        .recommendedType,
    ).toBe('STACKED_BAR');

    const doubleKpi = validatedQuery({
      metrics: [{ id: 'leads' }, { id: 'accounts_opened' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    expect(recommendVisualization(doubleKpi, []).variant).toBe('DOUBLE_KPI');

    const explicitTable = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'state' }],
      filters: [],
      visualization: { type: 'TABLE' },
    });
    expect(recommendVisualization(explicitTable, []).recommendedType).toBe('TABLE');
  });
});

describe('@bfp/analytics-engine in-memory execution', () => {
  const bundle = createFixtureBundle();

  it('executes hand-computed aggregate metrics correctly', async () => {
    const engine = new InMemoryAnalyticsQueryEngine({
      bundle,
      referenceDate: new Date('2026-02-05T12:00:00.000Z'),
    });

    const query = validatedQuery({
      metrics: [
        { id: 'leads' },
        { id: 'accounts_opened' },
        { id: 'account_conversion_rate' },
        { id: 'products_per_company' },
        { id: 'average_opening_time' },
        { id: 'average_onboarding_time' },
        { id: 'activation_d30' },
        { id: 'activation_d30_rate' },
        { id: 'revenue_proxy' },
        { id: 'unresolved_conversations' },
      ],
      dimensions: [],
      filters: [],
      visualization: { type: 'AUTO' },
    });

    const result = await engine.execute(query);
    const row = result.rows[0] as Record<string, number>;

    expect(result.visualization.recommendedType).toBe('TABLE');
    expect(row.leads).toBe(3);
    expect(row.accounts_opened).toBe(2);
    expect(row.account_conversion_rate).toBeCloseTo(2 / 3, 6);
    expect(row.products_per_company).toBe(1.5);
    expect(row.average_opening_time).toBe(6);
    expect(row.average_onboarding_time).toBe(3.5);
    expect(row.activation_d30).toBe(2);
    expect(row.activation_d30_rate).toBe(1);
    expect(row.revenue_proxy).toBe(250);
    expect(row.unresolved_conversations).toBe(2);
    expect(result.metadata.rowCount).toBe(1);
  });

  it('computes ratio metrics per group and converts division by zero into null plus warning', async () => {
    const engine = new InMemoryAnalyticsQueryEngine({
      bundle,
      referenceDate: new Date('2026-02-05T12:00:00.000Z'),
    });

    const query = validatedQuery({
      metrics: [{ id: 'media_spend' }, { id: 'cpl' }],
      dimensions: [{ id: 'touchpoint_date', granularity: 'date' }],
      filters: [],
      sorting: [{ field: 'touchpoint_date', direction: 'ASC' }],
      visualization: { type: 'AUTO' },
    });

    const result = await engine.execute(query);
    const byDate = Object.fromEntries(
      result.rows.map((row) => [String(row.touchpoint_date), row as Record<string, number | null>]),
    );

    expect(byDate['2026-01-20']?.media_spend).toBe(200);
    expect(byDate['2026-01-20']?.cpl).toBe(200);
    expect(byDate['2026-01-22']?.media_spend).toBe(75);
    expect(byDate['2026-01-22']?.cpl).toBeNull();
    expect(byDate['2026-01-31']?.media_spend).toBe(100);
    expect(byDate['2026-01-31']?.cpl).toBe(100);
    expect(byDate['2026-02-01']?.media_spend).toBe(50);
    expect(byDate['2026-02-01']?.cpl).toBe(50);
    expect(result.metadata.warnings).toContain(
      'Divisão por zero convertida em null para a métrica `cpl`.',
    );
  });

  it('uses Set-based COUNT_DISTINCT semantics', async () => {
    const documentLoader = vi.fn(async () => ({
      company: [
        bundle.companies[0]!,
        structuredClone(bundle.companies[0]!),
        bundle.companies[1]!,
      ] as unknown as Array<Record<string, unknown>>,
    }));
    const engine = new InMemoryAnalyticsQueryEngine({
      documentLoader,
      referenceDate: new Date('2026-02-05T12:00:00.000Z'),
    });

    const query = validatedQuery({
      metrics: [{ id: 'companies_total' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'KPI' },
    });

    const result = await engine.execute(query);
    expect(result.rows[0]?.companies_total).toBe(2);
  });

  it('attaches previous-period comparison columns', async () => {
    const engine = new InMemoryAnalyticsQueryEngine({
      bundle,
      referenceDate: new Date('2026-02-02T12:00:00.000Z'),
    });

    const query = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [],
      filters: [],
      dateRange: {
        type: 'CUSTOM',
        from: '2026-01-25T00:00:00.000Z',
        to: '2026-02-02T00:00:00.000Z',
      },
      comparison: { type: 'PREVIOUS_PERIOD' },
      visualization: { type: 'AUTO' },
    });

    const result = await engine.execute(query);
    expect(result.columns.map((column) => column.key)).toContain('leads__previous_period');
    expect(result.rows[0]?.leads).toBe(1);
    expect(result.rows[0]?.leads__previous_period).toBe(1);
  });

  it('buckets month and week boundaries using São Paulo local time', async () => {
    const engine = new InMemoryAnalyticsQueryEngine({ bundle });

    const monthQuery = validatedQuery({
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'touchpoint_date', granularity: 'month' }],
      filters: [],
      dateRange: {
        type: 'CUSTOM',
        from: '2026-01-31T00:00:00.000Z',
        to: '2026-02-02T00:00:00.000Z',
      },
      sorting: [{ field: 'touchpoint_date', direction: 'ASC' }],
      visualization: { type: 'AUTO' },
    });

    const monthResult = await engine.execute(monthQuery);
    expect(monthResult.rows).toEqual([
      { touchpoint_date: '2026-01', media_spend: 100 },
      { touchpoint_date: '2026-02', media_spend: 50 },
    ]);

    const weekQuery = validatedQuery({
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'touchpoint_date', granularity: 'week' }],
      filters: [],
      dateRange: {
        type: 'CUSTOM',
        from: '2026-01-31T00:00:00.000Z',
        to: '2026-02-02T00:00:00.000Z',
      },
      visualization: { type: 'AUTO' },
    });

    const weekResult = await engine.execute(weekQuery);
    expect(weekResult.rows).toEqual([{ touchpoint_date: '2026-W05', media_spend: 150 }]);
  });

  it('caches identical queries for 60 seconds and invalidates after TTL', async () => {
    let now = new Date('2026-02-05T12:00:00.000Z');
    const documentLoader = vi.fn(async () => ({ company: asRecords(bundle.companies) }));
    const engine = new InMemoryAnalyticsQueryEngine({
      documentLoader,
      clock: () => now,
      referenceDate: () => now,
    });

    const query = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'KPI' },
    });

    await engine.execute(query);
    await engine.execute(query);
    expect(documentLoader).toHaveBeenCalledTimes(1);

    now = new Date('2026-02-05T12:01:01.000Z');
    await engine.execute(query);
    expect(documentLoader).toHaveBeenCalledTimes(2);
  });

  it('emits audit entries through the injected callback', async () => {
    const audits: AuditLogEntry[] = [];
    const engine = new InMemoryAnalyticsQueryEngine({
      bundle,
      referenceDate: new Date('2026-02-05T12:00:00.000Z'),
      onAudit: (entry) => {
        audits.push(entry);
      },
      contextResolver: () => ({
        accessScope: 'role:analyst',
        userId: 'usr-1',
        companyId: 'company-1',
      }),
    });

    const query = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'KPI' },
    });

    const result = await engine.execute(query);

    expect(audits).toHaveLength(1);
    expect(audits[0]?.queryId).toBe(result.metadata.queryId);
    expect(audits[0]?.userId).toBe('usr-1');
    expect(audits[0]?.companyId).toBe('company-1');
    expect(audits[0]?.metrics).toEqual(['leads']);
    expect(audits[0]?.dimensions).toEqual([]);
    expect(audits[0]?.status).toBe('SUCCESS');
    expect(typeof audits[0]?.executionMs).toBe('number');
  });

  it('returns empty rows plus warning instead of throwing on empty result sets', async () => {
    const engine = new InMemoryAnalyticsQueryEngine({ bundle });
    const query = validatedQuery({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'state' }],
      filters: [{ field: 'state', operator: 'EQ', value: 'AM' }],
      visualization: { type: 'TABLE' },
    });

    const result = await engine.execute(query);
    expect(result.rows).toEqual([]);
    expect(result.metadata.warnings).toContain('Nenhum dado encontrado para o recorte solicitado.');
  });

  it('stays comfortably fast on a reduced slice of the real deterministic dataset', async () => {
    const raw = await readFile(resolve(process.cwd(), 'data/dataset.json'), 'utf8');
    const dataset = JSON.parse(raw) as DatasetBundle;
    const engine = new InMemoryAnalyticsQueryEngine({
      bundle: {
        ...dataset,
        companies: dataset.companies.slice(0, 500),
        mediaTouchpoints: dataset.mediaTouchpoints.slice(0, 5000),
        mediaCampaigns: dataset.mediaCampaigns.slice(0, 20),
      },
      referenceDate: new Date('2026-09-30T23:59:59.999Z'),
    });

    const query = validatedQuery({
      metrics: [{ id: 'media_spend' }, { id: 'clicks' }],
      dimensions: [{ id: 'campaign_channel' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });

    const startedAt = performance.now();
    const result = await engine.execute(query);
    const elapsedMs = performance.now() - startedAt;

    expect(result.rows.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(3000);
  }, 10000);
});

describe('@bfp/analytics-engine dynamodb execution', () => {
  it('issues QueryCommand per entity partition with projection expressions and never scans', async () => {
    const send = vi.fn().mockResolvedValue({ Items: [] });
    const engine = new DynamoDBAnalyticsQueryEngine({
      client: { send },
      tableName: 'dataset-table',
      referenceDate: new Date('2026-02-05T12:00:00.000Z'),
    });

    const query = validatedQuery({
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'campaign_channel' }],
      filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
      visualization: { type: 'AUTO' },
    });

    await engine.execute(query);

    expect(send).toHaveBeenCalledTimes(3);
    const commands = send.mock.calls.map((call) => call[0] as { input: Record<string, unknown> });
    const partitionKeys = commands.map(
      (command) =>
        (command.input.ExpressionAttributeValues as Record<string, unknown> | undefined)?.[':pk'],
    );

    expect(partitionKeys).toEqual(
      expect.arrayContaining(['ENTITY#touchpoint', 'ENTITY#campaign', 'ENTITY#company']),
    );
    expect(commands.every((command) => command.input.TableName === 'dataset-table')).toBe(true);
    expect(commands.every((command) => command.input.KeyConditionExpression === '#pk = :pk')).toBe(
      true,
    );
    expect(
      commands.every((command) => typeof command.input.ProjectionExpression === 'string'),
    ).toBe(true);
    expect(
      commands.some((command) =>
        String(command.input.ProjectionExpression).includes('#document.#field'),
      ),
    ).toBe(true);
  });
});
