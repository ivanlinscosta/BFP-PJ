import { describe, expect, it } from 'vitest';
import {
  buildAnalysisShape,
  checkVisualizationCompatibility,
  recommendVisualizations,
  resolveVisualization,
  type DimensionLike,
  type MetricLike,
} from '../index';

const metrics: MetricLike[] = [
  {
    id: 'account_conversion_rate',
    shortName: 'Conversão',
    format: 'percent',
    aggregation: 'RATIO',
    additivity: 'NON_ADDITIVE',
  },
  {
    id: 'cac',
    shortName: 'CAC',
    format: 'currency',
    aggregation: 'RATIO',
    additivity: 'NON_ADDITIVE',
  },
  {
    id: 'new_companies',
    shortName: 'Novos clientes',
    format: 'number',
    aggregation: 'COUNT_DISTINCT',
    additivity: 'ADDITIVE',
  },
  {
    id: 'transaction_volume',
    shortName: 'Volume',
    format: 'currency',
    aggregation: 'SUM',
    additivity: 'ADDITIVE',
  },
  {
    id: 'leads',
    format: 'number',
    aggregation: 'COUNT_DISTINCT',
    additivity: 'ADDITIVE',
    funnelStage: 3,
  },
  {
    id: 'accounts_opened',
    format: 'number',
    aggregation: 'COUNT_DISTINCT',
    additivity: 'ADDITIVE',
    funnelStage: 4,
  },
  {
    id: 'activation_d30',
    format: 'number',
    aggregation: 'COUNT_DISTINCT',
    additivity: 'ADDITIVE',
    funnelStage: 6,
  },
];
const dimensions: DimensionLike[] = [
  { id: 'acquisition_channel', label: 'Canal', type: 'enum', semanticType: 'SOURCE' },
  { id: 'company_size', label: 'Porte', type: 'enum' },
  { id: 'transaction_date', label: 'Data', type: 'date' },
  { id: 'acquisition_campaign', label: 'Campanha', type: 'string' },
  { id: 'state', label: 'Estado', type: 'string', semanticType: 'GEO', geoLevel: 'UF' },
  { id: 'product', label: 'Produto', type: 'enum', semanticType: 'DESTINATION' },
  { id: 'account_opened_date', label: 'Abertura', type: 'date', cohortRole: 'START' },
  { id: 'activation_date', label: 'Ativação', type: 'date', cohortRole: 'EVENT' },
];
const rowsWith = (dimension: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ [dimension]: `v${index}` }));

const shape = (
  metricIds: string[],
  dims: Array<{ id: string; granularity?: 'month' | 'date' }>,
  rows?: Array<Record<string, unknown>>,
) =>
  buildAnalysisShape(
    { metrics: metricIds.map((id) => ({ id })), dimensions: dims },
    { metrics, dimensions },
    rows ? { rows } : undefined,
  );

describe('VisualizationRecommendationEngine', () => {
  it('CASE 1 — 1 metric and no dimension: KPI, then table', () => {
    const top = recommendVisualizations(shape(['account_conversion_rate'], []));
    expect(top.map((item) => item.type).slice(0, 2)).toEqual(['KPI', 'TABLE']);
    expect(top[0]!.recommended).toBe(true);
  });

  it('CASE 2 — 1 metric by a category with 8 values: horizontal bars', () => {
    const top = recommendVisualizations(
      shape(
        ['account_conversion_rate'],
        [{ id: 'acquisition_channel' }],
        rowsWith('acquisition_channel', 8),
      ),
    );
    expect(top[0]!.type).toBe('BAR_HORIZONTAL');
    expect(top[0]!.reason).toMatch(/8 valores/);
  });

  it('CASE 3 — 1 metric over time: line', () => {
    const top = recommendVisualizations(
      shape(['transaction_volume'], [{ id: 'transaction_date', granularity: 'month' }]),
    );
    expect(top[0]!.type).toBe('LINE');
  });

  it('CASE 4 — 1 metric by 2 categories: heatmap', () => {
    const top = recommendVisualizations(
      shape(['account_conversion_rate'], [{ id: 'acquisition_channel' }, { id: 'company_size' }]),
    );
    expect(top[0]!.type).toBe('HEATMAP');
  });

  it('CASE 5 — 2 numeric metrics in different units by campaign: scatter', () => {
    const top = recommendVisualizations(
      shape(
        ['cac', 'account_conversion_rate'],
        [{ id: 'acquisition_campaign' }],
        rowsWith('acquisition_campaign', 20),
      ),
    );
    expect(top[0]!.type).toBe('SCATTER');
  });

  it('CASE 6 — 3 numeric metrics by campaign: bubbles', () => {
    const top = recommendVisualizations(
      shape(['cac', 'account_conversion_rate', 'new_companies'], [{ id: 'acquisition_campaign' }]),
    );
    expect(top[0]!.type).toBe('BUBBLE');
  });

  it('CASE 7 — funnel stage metrics: funnel', () => {
    const top = recommendVisualizations(shape(['leads', 'accounts_opened', 'activation_d30'], []));
    expect(top[0]!.type).toBe('FUNNEL');
  });

  it('CASE 8 — geographic dimension: map available', () => {
    const current = shape(['new_companies'], [{ id: 'state' }]);
    expect(checkVisualizationCompatibility('MAP', current).compatible).toBe(true);
    const missing = checkVisualizationCompatibility(
      'MAP',
      shape(['new_companies'], [{ id: 'company_size' }]),
    );
    expect(missing).toMatchObject({
      compatible: false,
      reason: 'Adicione Estado ou Região para usar o mapa.',
    });
  });

  it('CASE 9 — source and destination: sankey available', () => {
    const current = shape(['new_companies'], [{ id: 'acquisition_channel' }, { id: 'product' }]);
    expect(checkVisualizationCompatibility('SANKEY', current).compatible).toBe(true);
    expect(
      checkVisualizationCompatibility(
        'SANKEY',
        shape(['new_companies'], [{ id: 'company_size' }, { id: 'product' }]),
      ).compatible,
    ).toBe(false);
  });

  it('CASE 10 — cohort start and event dates: cohort', () => {
    const top = recommendVisualizations(
      shape(
        ['new_companies'],
        [
          { id: 'account_opened_date', granularity: 'month' },
          { id: 'activation_date', granularity: 'month' },
        ],
      ),
    );
    expect(top[0]!.type).toBe('COHORT');
  });

  it('never recommends stacking or donuts for non-additive metrics', () => {
    const current = shape(
      ['account_conversion_rate'],
      [{ id: 'acquisition_channel' }, { id: 'company_size' }],
    );
    expect(checkVisualizationCompatibility('COLUMN_STACKED', current).compatible).toBe(false);
    const donut = shape(['account_conversion_rate'], [{ id: 'company_size' }]);
    expect(checkVisualizationCompatibility('DONUT', donut).compatible).toBe(false);
  });
});

describe('AUTO and MANUAL modes', () => {
  it('AUTO follows the analysis; MANUAL keeps the chart and reports incompatibility', () => {
    const kpi = shape(['account_conversion_rate'], []);
    const byChannel = shape(
      ['account_conversion_rate'],
      [{ id: 'acquisition_channel' }],
      rowsWith('acquisition_channel', 7),
    );
    const crossed = shape(
      ['account_conversion_rate'],
      [{ id: 'acquisition_channel' }, { id: 'company_size' }],
    );
    expect(resolveVisualization({ type: 'AUTO' }, kpi).type).toBe('KPI');
    expect(resolveVisualization({ type: 'AUTO' }, byChannel).type).toBe('BAR_HORIZONTAL');
    expect(resolveVisualization({ type: 'AUTO', mode: 'AUTO' }, crossed).type).toBe('HEATMAP');
    expect(resolveVisualization({ type: 'TABLE', mode: 'MANUAL' }, crossed).type).toBe('TABLE');
    const broken = resolveVisualization({ type: 'KPI', mode: 'MANUAL' }, crossed);
    expect(broken.incompatible?.requested).toBe('KPI');
    expect(broken.type).toBe('HEATMAP');
  });

  it('opens legacy saved types', () => {
    expect(
      resolveVisualization({ type: 'BAR' }, shape(['new_companies'], [{ id: 'company_size' }]))
        .type,
    ).toBe('BAR_HORIZONTAL');
  });
});
