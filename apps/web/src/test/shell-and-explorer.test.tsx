import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AppShell } from '@/layouts/app-shell';
import { ExplorerPage } from '@/pages/explorer-page';
import { useAnalysisStore } from '@/features/explorer/store';
import { buildExplorerHref } from '@/features/explorer/spec';
import { CATALOG_ROUTES, CONVERSION_BY_CHANNEL } from './fixtures';
import { mockApi, renderRoute, signIn } from './utils';

describe('AppShell', () => {
  it('renders the Itaú sidebar, every navigation entry and the profile', async () => {
    signIn();
    mockApi(CATALOG_ROUTES);
    renderRoute(<AppShell />);

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    for (const label of [
      'Explorar',
      'Inteligência PJ',
      'Minhas análises',
      'Dashboards',
      'Audiências',
      'Clientes PJ',
      'Catálogo',
      'Governança',
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Administração').length).toBeGreaterThan(0);
    expect(screen.getByText('BFP - PJ')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar análises, empresas e dados')).toBeInTheDocument();
    expect(await screen.findByText('Dados atualizados há 12 min')).toBeInTheDocument();
  });
});

describe('ExplorerPage', () => {
  beforeEach(() => useAnalysisStore.getState().clearAnalysis());

  it('shows the empty playground with the curated library in catalog order', async () => {
    signIn();
    mockApi(CATALOG_ROUTES);
    renderRoute(<ExplorerPage />, { path: '/explorar', url: '/explorar' });

    expect(await screen.findByText('Comece sua análise')).toBeInTheDocument();
    expect(screen.getByText('Construtor de análise')).toBeInTheDocument();
    const library = screen.getByRole('complementary', { name: 'Biblioteca de dados' });
    await waitFor(() =>
      expect(within(library).getByText('Conversão de abertura')).toBeInTheDocument(),
    );
    const metricLabels = within(within(library).getByRole('region', { name: 'Métricas' }))
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(metricLabels[0]).toContain('Conversão de abertura');
    expect(metricLabels[1]).toContain('CAC');
    expect(within(library).queryByText('Leads')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Adicionar uma métrica/ })).toHaveAttribute(
      'href',
      '/explorar/adicionar',
    );
  });

  it('adds a metric and a dimension by click and renders governed results with insights', async () => {
    signIn();
    const calls = mockApi([
      ...CATALOG_ROUTES,
      { method: 'POST', path: '/analytics/query', respond: CONVERSION_BY_CHANNEL },
      {
        path: /\/catalog\/metrics\/.+/,
        respond: {
          metric: {
            id: 'account_conversion_rate',
            shortName: 'Conversão de abertura',
            certificationStatus: 'CERTIFIED',
          },
          trust: {
            owner: 'Acquisition PJ',
            freshnessMinutes: 12,
            qualityRatio: 0.994,
            sloMinutes: 15,
          },
          dataProduct: { goldDataset: 'Acquisition Gold' },
          lineage: { stages: [] },
          compatibleDimensions: [],
          calculation: { kind: 'RATIO' },
        },
      },
    ]);
    renderRoute(<ExplorerPage />, { path: '/explorar', url: '/explorar' });
    const library = await screen.findByRole('complementary', { name: 'Biblioteca de dados' });

    // The engine only runs after the user selects the data mesh bases.
    await waitFor(() =>
      expect(within(library).getByRole('button', { name: /Conversão de abertura/ })).toBeDisabled(),
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Selecionar bases de dados/ })[0]!);
    const picker = await screen.findByRole('dialog', { name: 'Bases de dados do data mesh' });
    expect(within(picker).getByText('Atlan · Verificado')).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('checkbox', { name: /Customer 360/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Usar 1 base' }));
    expect(calls.some((call) => call.url.pathname === '/api/analytics/query')).toBe(false);

    fireEvent.click(await within(library).findByText('Conversão de abertura'));
    fireEvent.click(within(library).getByText('Canal'));

    expect(
      await screen.findByRole('heading', { name: 'Conversão de abertura por canal' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Google Search: 5,1 p.p. acima de Meta')).toBeInTheDocument();
    expect(screen.getAllByText('14,8%').length).toBeGreaterThan(0);
    const query = [...calls]
      .reverse()
      .find((call) => call.method === 'POST' && call.url.pathname === '/api/analytics/query');
    expect(query?.body).toMatchObject({
      datasets: ['customer_360'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      dateRange: { type: 'LAST_N_DAYS', value: 90 },
    });
    expect(screen.getByRole('button', { name: /Salvar análise/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeEnabled();
  });

  it('accepts drag and drop from the library into the builder', async () => {
    signIn();
    mockApi([
      ...CATALOG_ROUTES,
      { method: 'POST', path: '/analytics/query', respond: CONVERSION_BY_CHANNEL },
    ]);
    renderRoute(<ExplorerPage />, { path: '/explorar', url: '/explorar' });
    const slot = await screen.findByRole('button', {
      name: /Métricas: Arraste uma métrica para começar/,
    });
    const data = new Map<string, string>([
      ['application/x-bfp-item', JSON.stringify({ kind: 'metric', id: 'cac' })],
    ]);
    const dataTransfer = {
      types: [...data.keys()],
      getData: (type: string) => data.get(type) ?? '',
      setData: () => undefined,
      dropEffect: 'copy',
    };
    fireEvent.dragOver(slot, { dataTransfer });
    fireEvent.drop(slot, { dataTransfer });

    await waitFor(() => expect(useAnalysisStore.getState().spec.metrics).toEqual([{ id: 'cac' }]));
  });

  it('loads deep links (?spec=) into the shared store', async () => {
    signIn();
    mockApi([
      ...CATALOG_ROUTES,
      { method: 'POST', path: '/analytics/query', respond: CONVERSION_BY_CHANNEL },
    ]);
    const href = buildExplorerHref({
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
    });
    renderRoute(<ExplorerPage />, { path: '/explorar', url: href });

    await waitFor(() =>
      expect(useAnalysisStore.getState().spec.filters).toEqual([
        { field: 'state', operator: 'EQ', value: 'SP' },
      ]),
    );
    expect(await screen.findByText('Estado = SP')).toBeInTheDocument();
  });

  it('shows a human message for semantic incompatibilities', async () => {
    signIn();
    mockApi([
      ...CATALOG_ROUTES,
      {
        method: 'POST',
        path: '/analytics/query',
        status: 422,
        respond: {
          error: {
            code: 'invalid_analysis_spec',
            message: 'Analysis specification is invalid.',
            details: {
              issues: [{ message: 'Produto não é compatível com Conversão de abertura.' }],
            },
          },
        },
      },
    ]);
    useAnalysisStore.getState().loadAnalysis({
      datasets: ['customer_360', 'company_products'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'product' }],
      filters: [],
      visualization: { type: 'AUTO' },
    });
    renderRoute(<ExplorerPage />, { path: '/explorar', url: '/explorar' });

    expect(await screen.findByText('Essa combinação não é compatível')).toBeInTheDocument();
    expect(
      screen.getByText('Produto não é compatível com Conversão de abertura.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/invalid_analysis_spec/)).not.toBeInTheDocument();
  });
});
