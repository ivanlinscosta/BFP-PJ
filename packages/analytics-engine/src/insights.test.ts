import type { ColumnDef } from '@bfp/domain';
import { formatInsightValue, generateInsights } from './insights';

const channelColumn: ColumnDef = {
  key: 'acquisition_channel',
  label: 'Canal',
  type: 'dimension',
  format: 'text',
  role: 'category',
};
const sizeColumn: ColumnDef = {
  key: 'company_size',
  label: 'Porte da empresa',
  type: 'dimension',
  format: 'text',
  role: 'series',
};
const conversionColumn: ColumnDef = {
  key: 'account_conversion_rate',
  label: 'Conversão de abertura',
  type: 'metric',
  format: 'percent',
  role: 'value',
};
const labels: Record<string, string> = {
  GOOGLE_SEARCH: 'Google Search',
  META: 'Meta',
  ORGANIC: 'Organic',
  LINKEDIN: 'LinkedIn',
};
const labelFor = (_key: string, value: unknown) => labels[String(value)] ?? String(value);

describe('generateInsights', () => {
  it('ranks categories and describes the spread in percentage points', () => {
    const insights = generateInsights({
      result: {
        columns: [channelColumn, conversionColumn],
        rows: [
          { acquisition_channel: 'GOOGLE_SEARCH', account_conversion_rate: 0.148 },
          { acquisition_channel: 'ORGANIC', account_conversion_rate: 0.136 },
          { acquisition_channel: 'META', account_conversion_rate: 0.097 },
          { acquisition_channel: 'LINKEDIN', account_conversion_rate: 0.084 },
        ],
      },
      labelFor,
    });

    expect(insights[0]).toMatchObject({
      type: 'DIFFERENCE',
      evidence: { winner: 'Google Search', loser: 'LinkedIn' },
    });
    expect(insights[0]!.title).toBe('Google Search: 6,4 p.p. acima de LinkedIn');
    expect(insights[1]).toMatchObject({
      type: 'RANKING',
      evidence: { leader: 'Organic', challenger: 'Meta' },
    });
    expect(insights[1]!.title).toContain('3,9 p.p.');
  });

  it('reads lower-is-better metrics such as CAC in the opposite direction', () => {
    const insights = generateInsights({
      result: {
        columns: [
          channelColumn,
          { key: 'cac', label: 'CAC', type: 'metric', format: 'currency', role: 'value' },
        ],
        rows: [
          { acquisition_channel: 'GOOGLE_SEARCH', cac: 820 },
          { acquisition_channel: 'LINKEDIN', cac: 2100 },
          { acquisition_channel: 'ORGANIC', cac: 140 },
        ],
      },
      labelFor,
    });

    expect(insights[0]!.evidence).toMatchObject({ winner: 'Organic', lowerIsBetter: true });
    expect(insights[0]!.title).toContain('abaixo de LinkedIn');
  });

  it('summarizes matrices with peak, consistency and low cells', () => {
    const rows = [
      ['GOOGLE_SEARCH', 'Pequena', 0.143],
      ['GOOGLE_SEARCH', 'Média', 0.153],
      ['ORGANIC', 'Pequena', 0.131],
      ['ORGANIC', 'Média', 0.141],
      ['META', 'Pequena', 0.092],
      ['META', 'Média', 0.102],
    ].map(([channel, size, value]) => ({
      acquisition_channel: channel,
      company_size: size,
      account_conversion_rate: value,
    }));

    const insights = generateInsights({
      result: { columns: [channelColumn, sizeColumn, conversionColumn], rows },
      labelFor,
    });

    expect(insights.map((insight) => insight.type)).toEqual([
      'MATRIX_PEAK',
      'MATRIX_CONSISTENCY',
      'MATRIX_LOW',
    ]);
    expect(insights[0]!.evidence).toMatchObject({ row: 'Google Search', column: 'Média' });
    expect(insights[1]!.evidence).toMatchObject({
      consistent: true,
      ranking: 'Google Search → Organic → Meta',
    });
    expect(insights[2]!.evidence).toMatchObject({ row: 'Meta', column: 'Pequena' });
  });

  it('returns no insight without data and formats values in pt-BR', () => {
    expect(generateInsights({ result: { columns: [conversionColumn], rows: [] } })).toEqual([]);
    expect(formatInsightValue(0.148, 'percent')).toBe('14,8%');
    expect(formatInsightValue(1234.5, 'number')).toBe('1.234,5');
  });
});
