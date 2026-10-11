import { DIMENSION_CATALOG, METRIC_CATALOG } from '@bfp/semantic-layer';
import type { AnalysisSpec } from '@bfp/domain';
import { buildAnalysisShape, checkVisualizationCompatibility, type ChartType } from '@bfp/shared';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';
import { buildVisualizationFix } from '@/features/viz/fixes';

const catalog = {
  metrics: METRIC_CATALOG as unknown as CatalogMetric[],
  dimensions: DIMENSION_CATALOG as unknown as CatalogDimension[],
};
const spec = (metrics: string[], dimensions: string[]): AnalysisSpec =>
  ({
    datasets: ['customer_360'],
    metrics: metrics.map((id) => ({ id })),
    dimensions: dimensions.map((id) => ({ id })),
    filters: [],
    dateRange: { type: 'LAST_N_DAYS', value: 365 },
    visualization: { type: 'AUTO', mode: 'AUTO' },
  }) as unknown as AnalysisSpec;

describe('buildVisualizationFix', () => {
  it('turns any analysis into the journey funnel', () => {
    const fix = buildVisualizationFix(
      'FUNNEL',
      spec(['accounts_opened'], ['acquisition_channel']),
      catalog,
    );
    expect(fix?.spec.metrics.map((metric) => metric.id)).toEqual([
      'leads',
      'accounts_opened',
      'onboarding_completed',
      'activation_d30',
    ]);
    expect(fix?.spec.dimensions).toEqual([]);
    expect(fix?.spec.visualization).toMatchObject({ type: 'FUNNEL', mode: 'MANUAL' });
    expect(fix?.label).toMatch(/remove Canal/);
  });

  it('adds Estado for the map and Mês for the line', () => {
    const base = spec(['accounts_opened'], ['acquisition_channel']);
    expect(buildVisualizationFix('MAP', base, catalog)?.spec.dimensions).toEqual([{ id: 'state' }]);
    const line = buildVisualizationFix('LINE', base, catalog);
    expect(line?.spec.dimensions[0]?.granularity).toBe('month');
  });

  it('falls back to a countable metric when the selected one cannot feed the chart', () => {
    const fix = buildVisualizationFix(
      'DONUT',
      spec(['dna_relationship_strength_score'], ['acquisition_channel']),
      catalog,
    );
    expect(fix?.spec.metrics).toEqual([{ id: 'accounts_opened' }]);
    expect(fix?.label).toMatch(/^Troca .* por Contas abertas/);
  });

  it('only offers fixes that make the chart compatible', () => {
    const bases = [
      spec(['account_conversion_rate'], []),
      spec(['accounts_opened'], ['acquisition_channel']),
      spec(['account_conversion_rate'], ['acquisition_channel']),
    ];
    let offered = 0;
    for (const base of bases) {
      for (const type of [
        'FUNNEL',
        'MAP',
        'LINE',
        'DONUT',
        'SANKEY',
        'HEATMAP',
        'SCATTER',
        'BUBBLE',
        'RADAR',
        'COHORT',
        'TIMELINE',
        'CALENDAR_HEATMAP',
        'BOX_PLOT',
        'HISTOGRAM',
        'KPI',
      ] as ChartType[]) {
        const fix = buildVisualizationFix(type, base, catalog);
        if (!fix) continue;
        offered += 1;
        expect(
          checkVisualizationCompatibility(type, buildAnalysisShape(fix.spec, catalog)).compatible,
        ).toBe(true);
      }
    }
    expect(offered).toBeGreaterThan(30);
  });
});
