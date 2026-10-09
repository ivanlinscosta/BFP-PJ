import type { ColumnFormat } from '@bfp/domain';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { formatMetricValue } from '@/lib/format';
import { cn } from '@/lib/utils';
import { compareCategory, dimensionColumns, labelOf, metricColumns, numeric } from './model';

export interface HeatmapProps {
  rows: string[];
  columns: string[];
  /** values[rowIndex][columnIndex]; null when the combination has no data. */
  values: Array<Array<number | null>>;
  format: ColumnFormat | undefined;
  rowHeader: string;
  /** Optional per-row total computed by the API (non-additive metrics are not summed). */
  totals?: Array<number | null>;
  totalLabel?: string;
}

type Level = 'low' | 'mid' | 'high' | 'max';

const LEVEL_CLASSES: Record<Level, string> = {
  low: 'bg-card text-ink-faint',
  mid: 'bg-peach-soft text-ink',
  high: 'bg-peach text-ink',
  max: 'bg-brand-orange text-white',
};

export const HEATMAP_LEGEND: Array<{ level: Level; label: string }> = [
  { level: 'low', label: 'Baixa' },
  { level: 'mid', label: 'Média' },
  { level: 'high', label: 'Alta' },
  { level: 'max', label: 'Máxima' },
];

function levelFor(value: number, min: number, max: number): Level {
  if (max === min) return 'mid';
  const ratio = (value - min) / (max - min);
  if (ratio >= 0.97) return 'max';
  if (ratio >= 0.6) return 'high';
  if (ratio >= 0.3) return 'mid';
  return 'low';
}

/** Generic heatmap: rows × columns × values with a format. Not tied to any screen. */
export function AnalyticsHeatmap({
  rows,
  columns,
  values,
  format,
  rowHeader,
  totals,
  totalLabel = 'Total',
}: HeatmapProps) {
  const flat = values.flat().filter((value): value is number => value !== null);
  const min = Math.min(...flat);
  const max = Math.max(...flat);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <th
              className="h-[30px] px-3 text-left text-[13px] font-semibold text-brand-navy"
              scope="col"
            >
              {rowHeader}
            </th>
            {columns.map((column) => (
              <th
                className="h-[30px] px-3 text-center text-[13px] font-semibold text-brand-navy"
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
            {totals ? (
              <th
                className="h-[30px] w-20 px-3 text-right text-[13px] font-semibold text-ink-soft"
                scope="col"
              >
                {totalLabel}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-t border-line" key={row}>
              <th className="h-[29px] bg-card px-3 text-left font-normal text-ink" scope="row">
                {row}
              </th>
              {columns.map((column, columnIndex) => {
                const value = values[rowIndex]?.[columnIndex] ?? null;
                const level = value === null ? null : levelFor(value, min, max);
                return (
                  <td
                    className={cn(
                      'h-[29px] px-3 text-center tabular-nums',
                      level ? LEVEL_CLASSES[level] : 'bg-card text-ink-faint',
                      level === 'max' || level === 'high' ? 'font-semibold' : undefined,
                    )}
                    data-level={level ?? 'empty'}
                    key={column}
                  >
                    {formatMetricValue(value, format)}
                  </td>
                );
              })}
              {totals ? (
                <td className="h-[29px] bg-muted px-3 text-right font-semibold text-brand-navy tabular-nums">
                  {formatMetricValue(totals[rowIndex] ?? null, format)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-ink-soft">
      <span>Intensidade:</span>
      {HEATMAP_LEGEND.map((item) => (
        <span className="inline-flex items-center gap-1.5" key={item.level}>
          <span
            aria-hidden
            className={cn('h-3 w-3 border border-line', LEVEL_CLASSES[item.level])}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Pivots a 2-dimension result into the generic heatmap matrix. */
export function toHeatmapMatrix(result: AnalyticsResponse, totalsResult?: AnalyticsResponse) {
  const [rowDimension, columnDimension] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!rowDimension || !columnDimension || !metric) {
    return null;
  }

  const rowLabelByRaw = new Map<string, string>();
  const columnLabels = new Set<string>();
  const cell = new Map<string, number | null>();
  for (const row of result.rows) {
    const rowLabel = labelOf(result, rowDimension.key, row[rowDimension.key]);
    const columnLabel = labelOf(result, columnDimension.key, row[columnDimension.key]);
    rowLabelByRaw.set(String(row[rowDimension.key] ?? ''), rowLabel);
    columnLabels.add(columnLabel);
    cell.set(`${rowLabel}\u0000${columnLabel}`, numeric(row[metric.key]));
  }

  const totalsByLabel = new Map<string, number | null>();
  for (const row of totalsResult?.rows ?? []) {
    totalsByLabel.set(
      labelOf(totalsResult!, rowDimension.key, row[rowDimension.key]),
      numeric(row[metric.key]),
    );
  }

  const rowAverage = (label: string) => {
    const values = [...columnLabels]
      .map((column) => cell.get(`${label}\u0000${column}`))
      .filter((value): value is number => typeof value === 'number');
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  };
  const rows = [...new Set(rowLabelByRaw.values())].sort((left, right) =>
    totalsByLabel.size > 0
      ? (totalsByLabel.get(right) ?? 0) - (totalsByLabel.get(left) ?? 0)
      : rowAverage(right) - rowAverage(left),
  );
  const columns = [...columnLabels].sort((left, right) =>
    compareCategory(columnDimension, left, right),
  );

  return {
    rowHeader: rowDimension.label,
    columnHeader: columnDimension.label,
    rows,
    columns,
    values: rows.map((row) => columns.map((column) => cell.get(`${row}\u0000${column}`) ?? null)),
    totals: totalsByLabel.size > 0 ? rows.map((row) => totalsByLabel.get(row) ?? null) : undefined,
    format: metric.format,
    metricLabel: metric.label,
  };
}
