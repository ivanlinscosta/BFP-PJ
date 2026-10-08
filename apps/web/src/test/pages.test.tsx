import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AdminPage } from '@/pages/admin-page';
import { AudienceBuilderPage } from '@/pages/audience-builder-page';
import { CatalogPage } from '@/pages/catalog-page';
import { CustomerDetailPage } from '@/pages/customer-detail-page';
import { DashboardEditorPage } from '@/pages/dashboard-editor-page';
import { DashboardsPage } from '@/pages/dashboards-page';
import { GovernancePage } from '@/pages/governance-page';
import { IntelligencePage } from '@/pages/intelligence-page';
import { MetricDetailPage } from '@/pages/metric-detail-page';
import { useAnalysisStore } from '@/features/explorer/store';
import { CATALOG_ROUTES, CONVERSION_BY_CHANNEL } from './fixtures';
import { mockApi, renderRoute, signIn } from './utils';

const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

function dashboard(overrides: Record<string, unknown>) {
  return {
    id: 'd1',
    name: 'Aquisição por canal',
    description: 'Conversão e custo para acompanhar a aquisição PJ.',
    cards: [
      {
        id: 'c1',
        title: 'Conversão',
        analysisId: 'a1',
        layout: { mode: 'GRID', x: 0, y: 0, w: 6, h: 4 },
      },
    ],
    visibility: 'TEAM',
    team: 'Growth PJ',
    ownerName: 'Mariana Souza',
    createdBy: 'usr-analyst',
    createdAt: iso(600),
    updatedAt: iso(25),
    access: 'OWNER',
    isFavorite: true,
    cardSummaries: [
      {
        cardId: 'c1',
        analysisId: 'a1',
        title: 'Conversão de abertura por canal',
        subtitle: 'Estado = SP · Últimos 90 dias',
        available: true,
      },
    ],
    ...overrides,
  };
}

describe('IntelligencePage', () => {
  beforeEach(() => useAnalysisStore.getState().clearAnalysis());

  it('answers with the governed basis and applies UPDATE_ANALYSIS operations to the shared spec', async () => {
    signIn();
    useAnalysisStore.getState().loadAnalysis({
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
      dateRange: { type: 'LAST_N_DAYS', value: 90 },
      visualization: { type: 'BAR' },
    });
    const calls = mockApi([
      ...CATALOG_ROUTES,
      { method: 'POST', path: '/analytics/query', respond: CONVERSION_BY_CHANNEL },
      {
        method: 'POST',
        path: '/ai/chat',
        respond: ({ body }) =>
          (body as { prompt: string }).prompt.startsWith('Qual')
            ? {
                conversationId: 'c1',
                provider: 'local',
                model: 'x',
                action: 'ANSWER_QUESTION',
                operations: [],
                message: 'Google Search apresenta o melhor equilíbrio no período selecionado.',
                answer: 'Google Search apresenta o melhor equilíbrio no período selecionado.',
                analysisSpec: {
                  datasets: ['customer_360'],
                  metrics: [{ id: 'account_conversion_rate' }],
                  dimensions: [{ id: 'acquisition_channel' }],
                  filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
                  dateRange: { type: 'LAST_N_DAYS', value: 90 },
                  visualization: { type: 'BAR' },
                },
                basis: {
                  title: '',
                  items: ['Conversão de abertura', 'CAC', 'Estado = SP', 'Últimos 90 dias'],
                },
                suggestions: ['Separar por porte'],
                explainability: { tools: ['runAnalyticsQuery'], note: '' },
              }
            : {
                conversationId: 'c1',
                provider: 'local',
                model: 'x',
                action: 'UPDATE_ANALYSIS',
                operations: [{ type: 'ADD_DIMENSION', dimensionId: 'company_size' }],
                message: 'Porte da empresa adicionado à análise.',
                answer: '',
                suggestions: [],
                explainability: { tools: ['runAnalyticsQuery'], note: '' },
              },
      },
    ]);
    renderRoute(<IntelligencePage />, { path: '/inteligencia', url: '/inteligencia' });

    const input = await screen.findByLabelText('Pergunte aos seus dados');
    fireEvent.change(input, {
      target: { value: 'Qual canal combina melhor conversão com menor CAC?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pergunta' }));
    expect(
      await screen.findByText(
        'Google Search apresenta o melhor equilíbrio no período selecionado.',
      ),
    ).toBeInTheDocument();
    // The answer brings the governed analysis behind it (chart/table, source and actions).
    expect(
      await screen.findByRole('region', { name: /Análise: Conversão de abertura por Canal/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir no Explorar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Separar por porte' }));
    expect(await screen.findByText('Porte da empresa adicionado à análise.')).toBeInTheDocument();
    expect(useAnalysisStore.getState().spec.dimensions.map((dimension) => dimension.id)).toEqual([
      'acquisition_channel',
      'company_size',
    ]);
    const aiCall = calls.find((call) => call.url.pathname === '/api/ai/chat');
    expect(aiCall?.body).toMatchObject({
      analysisSpec: { filters: [{ field: 'state', value: 'SP' }] },
    });
  });
});

describe('DashboardsPage', () => {
  it('shows tabs with counts, sharing labels and toggles favorites', async () => {
    signIn();
    let d2Favorite = false;
    const calls = mockApi([
      ...CATALOG_ROUTES,
      {
        path: '/dashboards',
        respond: () => ({
          items: [
            dashboard({}),
            dashboard({
              id: 'd2',
              name: 'Jornada de onboarding',
              access: 'VIEW',
              ownerName: 'Rafael Lima',
              team: 'Onboarding PJ',
              isFavorite: d2Favorite,
              visibility: 'READ_ONLY',
            }),
          ],
        }),
      },
      {
        method: 'PUT',
        path: /\/dashboards\/d2\/favorite/,
        respond: () => {
          d2Favorite = true;
          return { isFavorite: true };
        },
      },
    ]);
    renderRoute(<DashboardsPage />, { path: '/dashboards', url: '/dashboards' });

    expect(await screen.findByRole('tab', { name: 'Todos · 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Compartilhados comigo · 1' })).toBeInTheDocument();
    expect(screen.getByText('Pode editar · Growth PJ')).toBeInTheDocument();
    expect(screen.getByText('Pode visualizar · Onboarding PJ')).toBeInTheDocument();
    expect(screen.getAllByText('Estado = SP · Últimos 90 dias')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar Jornada de onboarding' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'PUT' && call.body && (call.body as { favorite: boolean }).favorite,
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole('tab', { name: /Favoritos/ }));
    expect(await screen.findByText('Jornada de onboarding')).toBeInTheDocument();
  });

  it('persists card order when reordering in the editor', async () => {
    signIn();
    const calls = mockApi([
      {
        path: '/dashboards/d1',
        respond: {
          dashboard: dashboard({
            cards: [
              {
                id: 'c1',
                title: 'Primeira',
                analysisId: 'a1',
                layout: { mode: 'GRID', x: 0, y: 0, w: 6, h: 4 },
              },
              {
                id: 'c2',
                title: 'Segunda',
                analysisId: 'a2',
                layout: { mode: 'GRID', x: 6, y: 0, w: 6, h: 4 },
              },
            ],
          }),
          analyses: {},
        },
      },
      { path: '/analyses', respond: { items: [] } },
      {
        method: 'PUT',
        path: '/dashboards/d1',
        respond: ({ body }) => ({ dashboard: { ...dashboard({}), ...(body as object) } }),
      },
    ]);
    renderRoute(<DashboardEditorPage />, {
      path: '/dashboards/:dashboardId/editar',
      url: '/dashboards/d1/editar',
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Mover Segunda para cima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dashboard' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const put = calls.find((call) => call.method === 'PUT');
    expect(
      (put?.body as { cards: Array<{ id: string; layout: { x: number } }> }).cards.map((card) => [
        card.id,
        card.layout.x,
      ]),
    ).toEqual([
      ['c2', 0],
      ['c1', 6],
    ]);
  });
});

describe('AudienceBuilderPage', () => {
  it('renders the template rules, aggregated preview from the API and simulates activation', async () => {
    signIn();
    const calls = mockApi([
      {
        path: '/audiences/fields',
        respond: {
          items: [
            {
              id: 'state',
              label: 'Estado',
              type: 'enum',
              operators: ['EQ', 'IN'],
              options: [{ value: 'SP', label: 'SP' }],
            },
            {
              id: 'company_size',
              label: 'Porte da empresa',
              type: 'enum',
              operators: ['EQ', 'IN'],
              options: [
                { value: 'Pequena', label: 'Pequena' },
                { value: 'Média', label: 'Média' },
              ],
            },
            {
              id: 'onboarding_status',
              label: 'Onboarding',
              type: 'enum',
              operators: ['EQ'],
              options: [{ value: 'COMPLETED', label: 'Concluído' }],
            },
            {
              id: 'activation_d30',
              label: 'Ativação D30',
              type: 'enum',
              operators: ['EQ'],
              options: [{ value: 'YES', label: 'Sim' }],
            },
            {
              id: 'product',
              label: 'Produto',
              type: 'multi',
              operators: ['IN', 'NOT_IN'],
              options: [{ value: 'Capital de Giro Flex', label: 'Capital de Giro Flex' }],
            },
          ],
        },
      },
      {
        method: 'POST',
        path: '/audiences/preview',
        respond: {
          preview: {
            size: 2418,
            baseSize: 19039,
            share: 0.127,
            distributions: [
              {
                field: 'company_size',
                label: 'Porte',
                buckets: [
                  { value: 'Pequena', label: 'Pequena', count: 1621 },
                  { value: 'Média', label: 'Média', count: 797 },
                ],
              },
              {
                field: 'state',
                label: 'Estado',
                buckets: [{ value: 'SP', label: 'SP', count: 2418 }],
              },
            ],
            freshness: iso(12),
            sources: ['CRM', 'Onboarding', 'Produtos PJ'],
          },
        },
      },
      { method: 'POST', path: '/audiences', respond: { audience: { id: 'aud-1', name: 'x' } } },
      {
        method: 'POST',
        path: '/audiences/aud-1/activate',
        respond: {
          job: {
            id: 'job-1',
            audienceId: 'aud-1',
            audienceName: 'x',
            destination: 'CRM',
            status: 'QUEUED',
            records: 2418,
            createdBy: 'u',
            createdAt: iso(0),
            completedAt: null,
          },
        },
      },
      {
        path: '/audiences/aud-1/activations',
        respond: {
          items: [
            {
              id: 'job-1',
              audienceId: 'aud-1',
              audienceName: 'x',
              destination: 'CRM',
              status: 'COMPLETED',
              records: 2418,
              createdBy: 'u',
              createdAt: iso(0),
              completedAt: iso(0),
            },
          ],
        },
      },
    ]);
    renderRoute(<AudienceBuilderPage />, {
      path: '/audiencias/nova',
      url: '/audiencias/nova?modelo=capital-de-giro',
    });

    expect(
      await screen.findByDisplayValue('Oportunidade Capital de Giro — SP'),
    ).toBeInTheDocument();
    expect(screen.getByText('não contém')).toBeInTheDocument();
    expect(await screen.findByText('2.418')).toBeInTheDocument();
    expect(screen.getByText('12,7% da base analisável')).toBeInTheDocument();
    expect(screen.getByText('1.621')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Enviar para CRM/ }));
    expect(await screen.findByText(/Envio para CRM · /)).toBeInTheDocument();
    await waitFor(
      () => expect(screen.getByText('Envio para CRM · Concluído')).toBeInTheDocument(),
      { timeout: 3000 },
    );
    const preview = calls.find((call) => call.url.pathname === '/api/audiences/preview');
    expect(
      (preview?.body as { filterGroups: { rules: unknown[] } }).filterGroups.rules,
    ).toHaveLength(5);
  });
});

describe('CustomerDetailPage', () => {
  it('renders the 360 summary, the chronological journey and a prefilled explorer link', async () => {
    signIn();
    mockApi([
      ...CATALOG_ROUTES,
      {
        path: '/customers/company-1',
        respond: {
          customer: {
            company: {
              id: 'company-1',
              tradeName: 'Atlas Tecnologia Ltda.',
              legalName: 'Atlas Soluções Tecnológicas Ltda.',
              cnpjMasked: '10.000.045/0001-**',
              companySize: 'Média',
              segment: 'Tecnologia',
              state: 'SP',
              city: 'São Paulo',
              region: 'Sudeste',
              status: 'ACTIVE',
              industry: 'SaaS',
              employeeCountRange: '51-200',
              riskProfile: 'LOW',
              lgpdConsent: true,
            },
            partners: [],
            accounts: [],
            products: [],
            campaigns: [],
            touchpoints: [],
            funnel: [],
            crm: [],
            conversations: [],
            digitalEvents: [],
            journey: [
              {
                id: 'j1',
                occurredAt: '2026-07-12T10:00:00.000Z',
                kind: 'media',
                title: 'Exposição Google Ads',
                category: 'Mídia',
                source: 'Google Ads',
              },
              {
                id: 'j2',
                occurredAt: '2026-07-18T10:00:00.000Z',
                kind: 'account',
                title: 'Conta aberta',
                category: 'Abertura de contas',
                source: 'Cadastro PJ',
              },
            ],
            summary: {
              acquisitionChannel: 'GOOGLE_SEARCH',
              accountOpenedAt: '2026-07-18T10:00:00.000Z',
              onboardingStatus: 'COMPLETED',
              onboardingDays: 2,
              activatedD30: true,
              activeProducts: 4,
              lastInteractionAt: new Date().toISOString(),
            },
          },
        },
      },
    ]);
    renderRoute(<CustomerDetailPage />, {
      path: '/clientes/:companyId',
      url: '/clientes/company-1',
    });

    expect(
      await screen.findByRole('heading', { name: 'Atlas Tecnologia Ltda.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Concluído em 2 dias')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    const journey = screen.getByRole('list', { name: '' }).closest('section') ?? document.body;
    expect(within(journey as HTMLElement).getByText('Exposição Google Ads')).toBeInTheDocument();
    expect(screen.getByText('Mídia · Google Ads')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Explorar empresas semelhantes/ });
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain(
      '"field":"company_size","operator":"EQ","value":"Média"',
    );
  });
});

describe('Catalog and governance', () => {
  it('debounces the unified search for "conversão" across the four catalog domains', async () => {
    signIn();
    const calls = mockApi([
      {
        path: '/mesh/datasets',
        respond: {
          items: [],
          total: 0,
          sources: { mesh: 'glue', datazone: 'disabled', atlan: 'ok' },
        },
      },
      {
        path: '/integrations/status',
        respond: {
          mesh: { source: 'glue', databasePrefix: 'bfp_pj_dev', datasets: 6, available: 6 },
          datazone: 'disabled',
          atlan: 'ok',
          atlanLinkedAssets: 6,
          fullstory: 'configured',
          analyticsEngine: 'athena',
        },
      },
      {
        path: '/catalog/metrics',
        respond: ({ url }) => ({
          items: url.searchParams.get('q')
            ? [
                {
                  id: 'account_conversion_rate',
                  shortName: 'Conversão de abertura',
                  description: 'd',
                  domain: 'acquisition',
                  owner: 'Acquisition PJ',
                  certificationStatus: 'CERTIFIED',
                  tags: [],
                },
              ]
            : [],
          total: 0,
          query: null,
        }),
      },
      { path: '/catalog/dimensions', respond: { items: [], total: 0, query: null } },
      { path: '/catalog/data-products', respond: { items: [], total: 0, query: null } },
      { path: '/catalog/glossary', respond: { items: [], total: 0, query: null } },
    ]);
    renderRoute(<CatalogPage />, { path: '/catalogo', url: '/catalogo' });

    expect(await screen.findByRole('tab', { name: /Bases de dados/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('tab', { name: /Métricas/ }));
    fireEvent.change(screen.getByLabelText('Buscar no catálogo'), {
      target: { value: 'conversão' },
    });
    expect(
      await screen.findByText('Conversão de abertura', {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    const searched = calls
      .filter((call) => call.url.searchParams.get('q') === 'conversão')
      .map((call) => call.url.pathname);
    expect(new Set(searched)).toEqual(
      new Set([
        '/api/catalog/metrics',
        '/api/catalog/dimensions',
        '/api/catalog/data-products',
        '/api/catalog/glossary',
      ]),
    );
    expect(screen.getByText('Certificada')).toBeInTheDocument();
  });

  it('renders the metric definition with formula, trust and lineage', async () => {
    signIn();
    mockApi([
      {
        path: '/catalog/metrics/account_conversion_rate',
        respond: {
          metric: {
            id: 'account_conversion_rate',
            shortName: 'Conversão de abertura',
            description: 'Percentual de empresas…',
            businessDefinition: 'Indica a eficiência…',
            formula: 'a/b',
            format: 'percent',
            domain: 'acquisition',
            version: '2.1',
            certificationStatus: 'CERTIFIED',
            owner: 'Acquisition PJ',
          },
          calculation: {
            kind: 'RATIO',
            numerator: { id: 'converted_leads', label: 'Contas abertas' },
            denominator: { id: 'leads', label: 'Leads elegíveis' },
            multiplier: 100,
          },
          compatibleDimensions: [
            { id: 'acquisition_channel', label: 'Canal' },
            { id: 'month', label: 'Mês' },
          ],
          dataProduct: {
            id: 'acquisition_funnel',
            name: 'Acquisition',
            owner: 'Acquisition PJ',
            goldDataset: 'Acquisition Gold',
            goldTable: 'gold_acquisition_events',
            businessSources: ['CRM', 'Mídia', 'Abertura de contas'],
          },
          trust: {
            owner: 'Acquisition PJ',
            lastLoadedAt: iso(12),
            freshnessMinutes: 12,
            sloMinutes: 15,
            qualityRatio: 0.994,
            qualityStatus: 'HEALTHY',
          },
          lineage: {
            stages: [
              {
                kind: 'SOURCES',
                label: 'Fontes de negócio',
                value: 'CRM + Mídia + Abertura de contas',
              },
              { kind: 'GOLD', label: 'Dados consolidados', value: 'Acquisition Gold' },
              { kind: 'METRIC', label: 'Métrica oficial', value: 'Conversão de abertura' },
              { kind: 'USAGE', label: 'Uso no negócio', value: 'Análises / Audiências' },
            ],
            graph: { nodes: [], edges: [] },
          },
        },
      },
    ]);
    renderRoute(<MetricDetailPage />, {
      path: '/catalogo/metricas/:metricId',
      url: '/catalogo/metricas/account_conversion_rate',
    });

    expect(
      await screen.findByRole('math', {
        name: 'Contas abertas dividido por Leads elegíveis vezes 100',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('99,4%')).toBeInTheDocument();
    expect(screen.getByText('< 15 min')).toBeInTheDocument();
    expect(screen.getByText('Acquisition Gold')).toBeInTheDocument();
    expect(screen.getByText('v2.1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Usar na análise/ }));
    expect(useAnalysisStore.getState().spec.metrics).toEqual([{ id: 'account_conversion_rate' }]);
  });

  it('lists data products with owner, freshness, SLO and quality', async () => {
    signIn();
    mockApi([
      {
        path: '/governance/data-products',
        respond: {
          items: [
            {
              id: 'acquisition_funnel',
              name: 'Acquisition',
              description: '',
              domain: 'acquisition',
              owner: 'Acquisition PJ',
              goldDataset: 'Acquisition Gold',
              goldTable: 't',
              businessSources: ['CRM'],
              metricIds: [],
              freshness: { lastLoadedAt: iso(12), minutes: 12, withinSLO: true },
              sloMinutes: 15,
              qualityThreshold: 0.97,
              qualityRatio: 0.994,
              measures: { completeness: 1, validity: 0.982, uniqueness: 1 },
              score: 99,
              status: 'HEALTHY',
              openIncidentCount: 0,
              records: 1000,
            },
          ],
          total: 1,
        },
      },
    ]);
    renderRoute(<GovernancePage />, { path: '/governanca', url: '/governanca' });

    expect(await screen.findByText('Acquisition')).toBeInTheDocument();
    expect(screen.getByText('há 12 min')).toBeInTheDocument();
    expect(screen.getAllByText('99,4%').length).toBeGreaterThan(0);
    expect(screen.getByText('Saudável')).toBeInTheDocument();
  });

  it('shows a friendly restricted state for non-admin users on Administração', async () => {
    signIn();
    mockApi([
      {
        path: '/admin/overview',
        status: 403,
        respond: {
          error: {
            code: 'forbidden',
            message: 'Role analyst cannot access resources restricted to admin.',
          },
        },
      },
    ]);
    renderRoute(<AdminPage />, { path: '/admin', url: '/admin' });

    expect(await screen.findByText('Acesso restrito ao seu perfil')).toBeInTheDocument();
    expect(screen.queryByText(/Role analyst/)).not.toBeInTheDocument();
  });
});
