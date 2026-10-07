import { applyAnalysisOperations } from '@bfp/shared';
import { describeError } from '@/lib/errors';
import { formatMetricValue, formatRelative } from '@/lib/format';
import { pluralizeLabel } from '@/lib/text';
import { ApiClientError } from '@/services/apiClient';
import {
  buildExplorerHref,
  createEmptySpec,
  parseSpecParam,
  resolveMonthDimension,
  resolveVisualization,
  visualizationAvailability,
} from '@/features/explorer/spec';
import { useAnalysisStore } from '@/features/explorer/store';
import { buildCsv } from '@/features/viz/csv';
import { niceScale } from '@/features/viz/model';
import { toHeatmapMatrix } from '@/features/viz/result-view';
import { CONVERSION_BY_CHANNEL, DIMENSIONS, METRICS } from './fixtures';

describe('AnalysisSpec store', () => {
  beforeEach(() => useAnalysisStore.getState().clearAnalysis());

  it('derives every change from the single AnalysisSpec', () => {
    const store = useAnalysisStore.getState();
    store.addMetric('account_conversion_rate');
    store.addDimension('acquisition_channel');
    store.addFilter({ field: 'state', operator: 'EQ', value: 'SP' });
    store.setDateRange({ type: 'LAST_N_DAYS', value: 90 });
    store.setVisualization('BAR');

    const { spec, dirty } = useAnalysisStore.getState();
    expect(spec.metrics).toEqual([{ id: 'account_conversion_rate' }]);
    expect(spec.dimensions).toEqual([{ id: 'acquisition_channel' }]);
    expect(spec.filters).toEqual([{ field: 'state', operator: 'EQ', value: 'SP' }]);
    expect(spec.visualization.type).toBe('BAR');
    expect(dirty).toBe(true);
  });

  it('applies AI operations and exposes a confirmation notice', () => {
    useAnalysisStore.getState().addMetric('account_conversion_rate');
    useAnalysisStore
      .getState()
      .applyOperations(
        [{ type: 'ADD_DIMENSION', dimensionId: 'company_size' }],
        'Porte da empresa adicionado à análise.',
      );

    expect(useAnalysisStore.getState().spec.dimensions.map((dimension) => dimension.id)).toEqual([
      'company_size',
    ]);
    expect(useAnalysisStore.getState().notice?.message).toBe(
      'Porte da empresa adicionado à análise.',
    );
  });

  it('removes filters by index and clears the analysis', () => {
    const store = useAnalysisStore.getState();
    store.addMetric('cac');
    store.addFilter({ field: 'state', operator: 'EQ', value: 'SP' });
    store.removeFilter(0);
    expect(useAnalysisStore.getState().spec.filters).toEqual([]);
    store.clearAnalysis();
    expect(useAnalysisStore.getState().spec).toEqual(createEmptySpec());
  });
});

describe('spec helpers', () => {
  it('round-trips deep links and rejects invalid payloads', () => {
    const href = buildExplorerHref({
      metrics: [{ id: 'cac' }],
      dimensions: [{ id: 'acquisition_channel' }],
    });
    const raw = new URL(href, 'http://localhost').searchParams.get('spec');
    expect(parseSpecParam(raw)?.metrics).toEqual([{ id: 'cac' }]);
    expect(parseSpecParam('{not json')).toBeNull();
  });

  it('resolves "Mês" to the date dimension of the metric time field', () => {
    expect(resolveMonthDimension([METRICS[1]!], DIMENSIONS)).toEqual({
      id: 'lead_date',
      granularity: 'month',
    });
  });

  it('chooses visualizations like the engine and explains unavailable ones', () => {
    const base = { ...createEmptySpec(), metrics: [{ id: 'account_conversion_rate' }] };
    expect(
      resolveVisualization({ ...base, dimensions: [{ id: 'acquisition_channel' }] }, DIMENSIONS),
    ).toBe('BAR');
    expect(
      resolveVisualization(
        { ...base, dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }] },
        DIMENSIONS,
      ),
    ).toBe('HEATMAP');
    const options = visualizationAvailability(
      { ...base, dimensions: [{ id: 'acquisition_channel' }] },
      DIMENSIONS,
    );
    expect(options.find((option) => option.type === 'LINE')).toMatchObject({
      enabled: false,
      requirement: 'Mês',
    });
    expect(options.find((option) => option.type === 'SCATTER')).toMatchObject({
      enabled: false,
      requirement: '2 métricas',
    });
  });

  it('keeps operations immutable for the shared contract', () => {
    const spec = createEmptySpec();
    const next = applyAnalysisOperations(spec, [{ type: 'ADD_METRIC', metricId: 'cac' }]);
    expect(spec.metrics).toEqual([]);
    expect(next.metrics).toEqual([{ id: 'cac' }]);
  });
});

describe('visualization helpers', () => {
  it('builds nice axes for percentages', () => {
    expect(niceScale(0.148)).toEqual({ max: 0.16, ticks: [0, 0.04, 0.08, 0.12, 0.16] });
  });

  it('exports only the aggregated rows with business labels', () => {
    const csv = buildCsv(CONVERSION_BY_CHANNEL);
    expect(csv.split('\n')[0]).toBe('Canal;Conversão de abertura');
    expect(csv).toContain('Google Search;0,148');
    expect(csv.split('\n')).toHaveLength(4);
  });

  it('pivots two-dimension results into a generic heatmap matrix', () => {
    const matrix = toHeatmapMatrix({
      ...CONVERSION_BY_CHANNEL,
      columns: [
        CONVERSION_BY_CHANNEL.columns[0]!,
        {
          key: 'company_size',
          label: 'Porte da empresa',
          type: 'dimension',
          format: 'text',
          role: 'series',
        },
        CONVERSION_BY_CHANNEL.columns[1]!,
      ],
      rows: [
        { acquisition_channel: 'META', company_size: 'Média', account_conversion_rate: 0.1 },
        { acquisition_channel: 'META', company_size: 'Pequena', account_conversion_rate: 0.08 },
        {
          acquisition_channel: 'GOOGLE_SEARCH',
          company_size: 'Média',
          account_conversion_rate: 0.15,
        },
      ],
    });

    expect(matrix?.columns).toEqual(['Pequena', 'Média']);
    expect(matrix?.rows).toEqual(['Google Search', 'Meta']);
    expect(matrix?.values).toEqual([
      [null, 0.15],
      [0.08, 0.1],
    ]);
  });
});

describe('formatting and errors', () => {
  it('formats pt-BR values', () => {
    expect(formatMetricValue(0.148, 'percent')).toBe('14,8%');
    expect(formatMetricValue(2418, 'number')).toBe('2.418');
    expect(formatMetricValue(null, 'number')).toBe('—');
    expect(formatRelative(new Date(Date.now() - 12 * 60_000).toISOString())).toBe('há 12 min');
    expect(pluralizeLabel('Canal', 6)).toBe('canais');
    expect(pluralizeLabel('Porte da empresa', 3)).toBe('portes');
  });

  it('never exposes raw API envelopes', () => {
    const forbidden = describeError(
      new ApiClientError(403, 'forbidden', 'Role business cannot access'),
    );
    expect(forbidden.title).toBe('Acesso restrito ao seu perfil');
    expect(forbidden.description).not.toContain('Role');
    const semantic = describeError(
      new ApiClientError(422, 'invalid_analysis_spec', 'Analysis specification is invalid.', {
        issues: [{ message: 'Produto não é compatível com CAC.' }],
      }),
    );
    expect(semantic.kind).toBe('semantic');
    expect(semantic.issues).toEqual(['Produto não é compatível com CAC.']);
    expect(describeError(new ApiClientError(504, 'timeout', 'x')).kind).toBe('timeout');
  });
});
