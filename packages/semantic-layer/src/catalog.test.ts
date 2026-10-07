import {
  BUSINESS_GLOSSARY,
  DATA_PRODUCT_CATALOG,
  DIMENSION_CATALOG,
  METRIC_CATALOG,
  compatibility,
  getDataProductForMetric,
  resolveDimensionValueLabel,
  getMetricDefinition,
  listMetricDefinitions,
} from './index';

describe('@bfp/semantic-layer catalog', () => {
  it('exports exactly the 24 governed metrics from the architecture doc', () => {
    expect(METRIC_CATALOG).toHaveLength(24);
    expect(METRIC_CATALOG[0]?.id).toBe('companies_total');
    expect(METRIC_CATALOG.map((metric) => metric.id)).toContain('activation_d30_rate');
    expect(METRIC_CATALOG.map((metric) => metric.id)).toContain('unresolved_conversations');
  });

  it('keeps metric identifiers unique and required governance fields populated', () => {
    const ids = METRIC_CATALOG.map((metric) => metric.id);
    expect(new Set(ids).size).toBe(24);

    for (const metric of METRIC_CATALOG) {
      expect(metric.name.length).toBeGreaterThan(0);
      expect(metric.description.length).toBeGreaterThan(0);
      expect(metric.sourceFields.length).toBeGreaterThan(0);
      expect(metric.allowedFilters.length).toBeGreaterThan(0);
      expect(metric.tags.length).toBeGreaterThan(0);
    }
  });

  it('keeps ratio metrics wired to existing base metrics', () => {
    const metricIds = new Set(METRIC_CATALOG.map((metric) => metric.id));
    const ratioMetrics = METRIC_CATALOG.filter((metric) => metric.aggregation === 'RATIO');

    expect(ratioMetrics.length).toBeGreaterThan(0);
    for (const metric of ratioMetrics) {
      expect(metricIds.has(metric.numerator!)).toBe(true);
      expect(metricIds.has(metric.denominator!)).toBe(true);
    }
  });

  it('exposes governed dimensions with unique ids and temporal metadata', () => {
    expect(DIMENSION_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DIMENSION_CATALOG.map((dimension) => dimension.id)).size).toBe(
      DIMENSION_CATALOG.length,
    );
    expect(
      DIMENSION_CATALOG.find((dimension) => dimension.id === 'lead_date')?.supportedGranularities,
    ).toEqual(['date', 'week', 'month']);
    expect(
      DIMENSION_CATALOG.find((dimension) => dimension.id === 'product')?.sourceFields,
    ).toHaveLength(2);
  });

  it('keeps compatibility rules discoverable for downstream phases', () => {
    expect(compatibility('cac', 'acquisition_channel')).toBe(true);
    expect(compatibility('campaign_conversion_rate', 'product')).toBe(false);
    expect(getMetricDefinition('revenue_proxy')!.format).toBe('currency');
    expect(listMetricDefinitions('media').map((metric) => metric.id)).toContain('ctr');
  });

  it('ships coherent starter data products and glossary terms', () => {
    expect(DATA_PRODUCT_CATALOG.map((product) => product.name)).toEqual([
      'Customer 360',
      'Acquisition',
      'Media',
      'Onboarding',
      'Products',
      'CRM',
      'Conversations',
    ]);
    expect(getDataProductForMetric('cac')?.goldDataset).toBe('Acquisition Gold');
    expect(resolveDimensionValueLabel('acquisition_channel', 'GOOGLE_SEARCH')).toBe(
      'Google Search',
    );
    expect(listMetricDefinitions().filter((metric) => metric.featured)).toHaveLength(7);
    expect(BUSINESS_GLOSSARY.length).toBeGreaterThanOrEqual(8);
    expect(BUSINESS_GLOSSARY.map((term) => term.term)).toContain('CAC');
  });
});
