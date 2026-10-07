import {
  applyAnalysisOperations,
  createErrorResponse,
  describeAnalysisSpec,
  describeDateRange,
  describeFilter,
} from './index';

describe('@bfp/shared', () => {
  it('builds normalized error responses', () => {
    expect(createErrorResponse('demo', 'message')).toEqual({
      error: { code: 'demo', message: 'message' },
    });
  });
});

describe('describeAnalysisSpec', () => {
  const resolver = {
    metric: (id: string) => ({ account_conversion_rate: 'Conversão de abertura' })[id] ?? id,
    dimension: (id: string) =>
      ({ acquisition_channel: 'Canal', company_size: 'Porte da empresa', state: 'Estado' })[id] ??
      id,
    value: (_field: string, value: unknown) => String(value),
  };

  it('builds the same sentence shown above the Explorer canvas', () => {
    const description = describeAnalysisSpec(
      {
        metrics: [{ id: 'account_conversion_rate' }],
        dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }],
        filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
        dateRange: { type: 'LAST_N_DAYS', value: 90 },
        visualization: { type: 'HEATMAP' },
      },
      resolver,
    );

    expect(description.sentence).toBe(
      'Conversão de abertura por Canal e Porte da empresa onde Estado = SP nos últimos 90 dias',
    );
    expect(description.filters).toEqual(['Estado = SP']);
  });

  it('describes presets and list filters', () => {
    expect(describeDateRange({ type: 'THIS_MONTH' })).toBe('este mês');
    expect(
      describeFilter(
        { field: 'company_size', operator: 'IN', value: ['Pequena', 'Média'] },
        resolver,
      ),
    ).toBe('Porte da empresa em Pequena, Média');
  });
});

describe('applyAnalysisOperations', () => {
  it('applies AI operations immutably and ignores duplicates', () => {
    const base = {
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      filters: [],
      visualization: { type: 'BAR' as const },
    };
    const next = applyAnalysisOperations(base, [
      { type: 'ADD_DIMENSION', dimensionId: 'company_size' },
      { type: 'ADD_DIMENSION', dimensionId: 'company_size' },
      { type: 'ADD_FILTER', filter: { field: 'state', operator: 'EQ', value: 'SP' } },
      { type: 'SET_DATE_RANGE', dateRange: { type: 'LAST_N_DAYS', value: 120 } },
    ]);

    expect(next.dimensions.map((dimension) => dimension.id)).toEqual([
      'acquisition_channel',
      'company_size',
    ]);
    expect(next.visualization.type).toBe('AUTO');
    expect(next.filters).toHaveLength(1);
    expect(base.dimensions).toHaveLength(1);
    expect(applyAnalysisOperations(next, [{ type: 'CLEAR' }]).metrics).toEqual([]);
  });
});
