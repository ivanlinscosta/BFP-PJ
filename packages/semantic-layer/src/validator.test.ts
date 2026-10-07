import type { AnalysisSpec } from '@bfp/domain';

import { validateAnalysisSpec } from './index';

describe('@bfp/semantic-layer validator', () => {
  it('accepts a valid semantic spec and resolves engine-friendly metadata', () => {
    const spec: AnalysisSpec = {
      datasets: ['customer_360', 'media_touchpoints'],
      metrics: [{ id: 'cac', alias: 'cac_brl' }, { id: 'activation_d30_rate' }],
      dimensions: [
        { id: 'acquisition_channel' },
        { id: 'company_size' },
        { id: 'state' },
        { id: 'lead_date', granularity: 'month' },
      ],
      filters: [
        { field: 'state', operator: 'IN', value: ['SP', 'RJ'] },
        { field: 'company_size', operator: 'IN', value: ['Pequena', 'Média'] },
      ],
      dateRange: { type: 'LAST_N_DAYS', value: 120 },
      comparison: { type: 'PREVIOUS_PERIOD' },
      sorting: [{ field: 'cac_brl', direction: 'DESC' }],
      visualization: { type: 'AUTO' },
      limit: 25,
    };

    const result = validateAnalysisSpec(spec);

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.resolvedQuery?.metrics).toHaveLength(2);
    expect(result.resolvedQuery?.metrics[0]?.alias).toBe('cac_brl');
    expect(result.resolvedQuery?.dimensions[3]?.granularity).toBe('month');
    expect(result.resolvedQuery?.requiredEntityTypes).toContain('company');
    expect(result.resolvedQuery?.datasets).toEqual(['customer_360', 'media_touchpoints']);
    expect(
      result.resolvedQuery?.requiredSourceFields.some((field) => field.field === 'accountOpenedAt'),
    ).toBe(true);
  });

  it('rejects unknown metric ids with actionable pt-BR messages', () => {
    const result = validateAnalysisSpec({
      metrics: [{ id: 'mrr' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'KPI' },
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('UNKNOWN_METRIC');
    expect(result.errors[0]?.message).toContain('não existe no catálogo governado');
  });

  it('rejects incompatible metric and dimension combinations', () => {
    const result = validateAnalysisSpec({
      metrics: [{ id: 'campaign_conversion_rate' }],
      dimensions: [{ id: 'product' }],
      filters: [],
      visualization: { type: 'TABLE' },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'INCOMPATIBLE_DIMENSION')).toBe(true);
  });

  it('rejects bad filter operators for governed dimensions', () => {
    const result = validateAnalysisSpec({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'company_size' }],
      filters: [{ field: 'company_size', operator: 'GT', value: 'Média' }],
      visualization: { type: 'TABLE' },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'INVALID_FILTER_OPERATOR')).toBe(true);
  });

  it('rejects non-additive metrics at unsupported temporal grain', () => {
    const result = validateAnalysisSpec({
      metrics: [{ id: 'products_per_company' }],
      dimensions: [{ id: 'contracted_date', granularity: 'month' }],
      filters: [],
      visualization: { type: 'LINE' },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'UNSUPPORTED_GRAIN')).toBe(true);
  });

  it('rejects invalid granularity on non-date dimensions and unknown sort fields', () => {
    const result = validateAnalysisSpec({
      metrics: [{ id: 'leads' }],
      dimensions: [{ id: 'state', granularity: 'month' }],
      filters: [],
      sorting: [{ field: 'missing_alias', direction: 'ASC' }],
      visualization: { type: 'TABLE' },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'INVALID_GRANULARITY')).toBe(true);
    expect(result.errors.some((error) => error.code === 'INVALID_SORT_FIELD')).toBe(true);
  });

  it('rejects malformed BETWEEN filters', () => {
    const result = validateAnalysisSpec({
      metrics: [{ id: 'media_spend' }],
      dimensions: [{ id: 'touchpoint_date', granularity: 'week' }],
      filters: [
        {
          field: 'touchpoint_date',
          operator: 'BETWEEN',
          value: ['2026-01-01'] as unknown as [string, string],
        },
      ],
      visualization: { type: 'LINE' },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'INVALID_FILTER_VALUE')).toBe(true);
  });

  it('requires the user to select the mesh datasets before the engine runs', () => {
    const base: AnalysisSpec = {
      metrics: [{ id: 'cac' }],
      dimensions: [{ id: 'company_size' }],
      filters: [],
      visualization: { type: 'AUTO' },
    };

    expect(validateAnalysisSpec(base).errors.map((error) => error.code)).toEqual([
      'MISSING_DATASETS',
    ]);
    const partial = validateAnalysisSpec({ ...base, datasets: ['media_touchpoints'] });
    expect(partial.errors).toMatchObject([
      { code: 'DATASET_NOT_SELECTED', details: { datasetId: 'customer_360' } },
    ]);
    expect(validateAnalysisSpec({ ...base, datasets: ['nope'] }).errors[0]?.code).toBe(
      'UNKNOWN_DATASET',
    );
    expect(
      validateAnalysisSpec({
        ...base,
        datasets: ['media_touchpoints', 'customer_360', 'conversations'],
      }).resolvedQuery?.datasets,
    ).toEqual(['media_touchpoints', 'customer_360']);
  });
});
