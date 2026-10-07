import type { AnalysisSpec } from '@bfp/domain';
import { validateAnalysisSpec } from '@bfp/semantic-layer';
import { AthenaCompilationError, compileAthenaQuery, toParameterLiteral } from './compiler';

function validated(spec: AnalysisSpec) {
  const validation = validateAnalysisSpec(spec);
  if (!validation.ok || !validation.resolvedQuery) {
    throw new Error(JSON.stringify(validation.errors));
  }
  return validation.resolvedQuery;
}

const window = { from: '2026-07-02T03:00:00.000Z', to: '2026-10-01T03:00:00.000Z' };
const resolveTable = (dataset: string) => `bfp_pj_dev_mesh.${dataset}`;

describe('compileAthenaQuery', () => {
  it('compiles a ratio metric on Customer 360 without joins', () => {
    const compiled = compileAthenaQuery(
      validated({
        datasets: ['customer_360'],
        metrics: [{ id: 'account_conversion_rate' }],
        dimensions: [{ id: 'acquisition_channel' }],
        filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
        visualization: { type: 'BAR' },
      }),
      { resolveTable, window },
    );

    expect(compiled.sql).toContain('FROM bfp_pj_dev_mesh.customer_360 f');
    expect(compiled.sql).not.toContain('JOIN bfp_pj_dev_mesh.customer_360 c');
    expect(compiled.sql).toContain('f.acquisition_channel AS d0');
    expect(compiled.sql).toContain('f.state = ?');
    expect(compiled.sql).toContain(
      'CAST(f0.m_converted_leads AS DOUBLE) / NULLIF(CAST(f1.m_leads AS DOUBLE), 0)',
    );
    expect(compiled.parameters).toEqual([
      `'${window.from}'`,
      `'${window.to}'`,
      "'SP'",
      `'${window.from}'`,
      `'${window.to}'`,
      "'SP'",
    ]);
    expect(compiled.joins).toEqual([]);
    expect(compiled.datasets).toEqual(['customer_360']);
  });

  it('joins the selected media data product with Customer 360 by company_id (CAC by size)', () => {
    const compiled = compileAthenaQuery(
      validated({
        datasets: ['customer_360', 'media_touchpoints'],
        metrics: [{ id: 'cac' }, { id: 'activation_d30_rate' }],
        dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }, { id: 'state' }],
        filters: [],
        visualization: { type: 'TABLE' },
      }),
      { resolveTable, window: { from: null, to: null } },
    );

    expect(compiled.sql).toContain(
      'FROM bfp_pj_dev_mesh.media_touchpoints f INNER JOIN bfp_pj_dev_mesh.customer_360 c ON c.company_id = f.company_id',
    );
    expect(compiled.sql).toContain('c.company_size AS d1');
    expect(compiled.sql).toContain('FULL OUTER JOIN');
    expect(compiled.joins).toContainEqual({
      left: 'media_touchpoints',
      right: 'customer_360',
      key: 'company_id',
    });
    expect(compiled.columns.map((column) => column.key)).toEqual([
      'acquisition_channel',
      'company_size',
      'state',
      'cac',
      'activation_d30_rate',
    ]);
  });

  it('never places user values or aliases in SQL text', () => {
    const compiled = compileAthenaQuery(
      validated({
        datasets: ['customer_360'],
        metrics: [{ id: 'leads', alias: "x'; DROP TABLE media; --" }],
        dimensions: [{ id: 'lead_date', granularity: 'month' }],
        filters: [
          {
            field: 'segment',
            operator: 'IN',
            value: ["Varejo'); DELETE FROM x; --", 'Tecnologia'],
          },
        ],
        visualization: { type: 'LINE' },
      }),
      { resolveTable, window },
    );

    expect(compiled.sql).not.toContain('DROP');
    expect(compiled.sql).not.toContain('DELETE');
    expect(compiled.sql).toContain(
      "date_format((f.lead_created_at AT TIME ZONE 'America/Sao_Paulo'), '%Y-%m')",
    );
    expect(compiled.sql).toContain('f.segment IN (?, ?)');
    expect(compiled.parameters).toContain("'Varejo''); DELETE FROM x; --'");
  });

  it('only reads datasets the user selected and rejects unsafe table names', () => {
    const query = validated({
      datasets: ['company_products', 'customer_360'],
      metrics: [{ id: 'products_per_company' }],
      dimensions: [{ id: 'segment' }],
      filters: [],
      visualization: { type: 'BAR' },
    });
    expect(compileAthenaQuery(query, { resolveTable, window }).sql).toContain(
      'INNER JOIN bfp_pj_dev_mesh.customer_360 c',
    );
    expect(() => compileAthenaQuery(query, { resolveTable: () => 'bad; drop', window })).toThrow(
      AthenaCompilationError,
    );
    expect(() =>
      compileAthenaQuery({ ...query, datasets: ['company_products'] }, { resolveTable, window }),
    ).toThrow('não foi selecionada');
    expect(toParameterLiteral("O'Reilly")).toBe("'O''Reilly'");
  });
});
