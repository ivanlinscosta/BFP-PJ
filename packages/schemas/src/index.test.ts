import {
  analysisSpecSchema,
  apiErrorEnvelopeSchema,
  createAnalysisSpecSchema,
  loginRequestSchema,
  loginResponseSchema,
} from './index';

describe('@bfp/schemas', () => {
  it('parses a valid analysis spec', () => {
    const result = analysisSpecSchema.safeParse({
      id: 'analysis-1',
      name: 'CAC por canal',
      metrics: [{ id: 'cac', alias: 'CAC' }],
      dimensions: [{ id: 'acquisition_channel' }, { id: 'lead_created_at', granularity: 'month' }],
      filters: [
        { field: 'state', operator: 'IN', value: ['SP', 'RJ'] },
        { field: 'risk_profile', operator: 'EQ', value: 'LOW' },
      ],
      dateRange: { type: 'LAST_N_DAYS', value: 120 },
      comparison: { type: 'PREVIOUS_PERIOD' },
      sorting: [{ field: 'cac', direction: 'ASC' }],
      limit: 20,
      visualization: { type: 'AUTO' },
      metadata: {
        createdBy: 'usr-admin',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metrics[0]?.id).toBe('cac');
      expect(result.data.filters).toHaveLength(2);
      expect(result.data.visualization.type).toBe('AUTO');
    }
  });

  it('rejects empty metric selections', () => {
    const result = analysisSpecSchema.safeParse({
      metrics: [],
      dimensions: [],
      filters: [],
      visualization: { type: 'TABLE' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid operators', () => {
    const result = analysisSpecSchema.safeParse({
      metrics: [{ id: 'companies_total' }],
      dimensions: [],
      filters: [{ field: 'state', operator: 'LIKE', value: 'SP' }],
      visualization: { type: 'TABLE' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid custom date ranges', () => {
    const result = analysisSpecSchema.safeParse({
      metrics: [{ id: 'companies_total' }],
      dimensions: [],
      filters: [],
      dateRange: {
        type: 'CUSTOM',
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      },
      visualization: { type: 'TABLE' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown metric ids when an allowlist is provided', () => {
    const schema = createAnalysisSpecSchema({ knownMetricIds: ['companies_total', 'cac'] });
    const result = schema.safeParse({
      metrics: [{ id: 'unknown_metric' }],
      dimensions: [],
      filters: [],
      visualization: { type: 'KPI' },
    });

    expect(result.success).toBe(false);
  });

  it('validates auth requests and responses', () => {
    expect(
      loginRequestSchema.safeParse({
        email: 'admin@example.local',
        password: 'demo-password-123',
      }).success,
    ).toBe(true);

    expect(
      loginResponseSchema.safeParse({
        accessToken: 'token',
        expiresIn: 3600,
        tokenType: 'Bearer',
        user: {
          id: 'usr-admin',
          email: 'admin@example.local',
          role: 'admin',
          groups: ['admin'],
        },
      }).success,
    ).toBe(true);
  });

  it('validates the normalized API error envelope', () => {
    const result = apiErrorEnvelopeSchema.safeParse({
      error: {
        code: 'validation_error',
        message: 'Invalid request.',
        details: { field: 'metrics' },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error.code).toBe('validation_error');
    }
  });
});
