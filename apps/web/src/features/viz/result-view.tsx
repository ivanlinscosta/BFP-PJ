import type { VisualizationType } from '@bfp/domain';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { AnalyticsBarChart, type BarSort } from './bar-chart';
import { AnalyticsGroupedBarChart, AnalyticsLineChart, AnalyticsScatterChart } from './charts';
import { AnalyticsKpis, AnalyticsTable } from './data-table';
import { AnalyticsHeatmap } from './heatmap';
import { compareCategory, dimensionColumns, labelOf, metricColumns, numeric } from './model';

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

/** Chooses the renderer for a visualization type; every renderer is generic. */
export function ResultView({
  result,
  type,
  sort,
  showValues = true,
  showLegend = true,
  totalsResult,
}: {
  result: AnalyticsResponse;
  type: VisualizationType | 'KPI';
  sort?: BarSort;
  showValues?: boolean;
  showLegend?: boolean;
  totalsResult?: AnalyticsResponse;
}) {
  if (type === 'KPI') return <AnalyticsKpis result={result} />;
  if (type === 'TABLE') return <AnalyticsTable result={result} />;
  if (type === 'LINE' || type === 'AREA')
    return <AnalyticsLineChart result={result} showLegend={showLegend} />;
  if (type === 'SCATTER') return <AnalyticsScatterChart result={result} />;
  if (type === 'GROUPED_BAR' || (type === 'BAR' && metricColumns(result).length > 1)) {
    return <AnalyticsGroupedBarChart result={result} showLegend={showLegend} />;
  }
  if (type === 'HEATMAP' || type === 'STACKED_BAR') {
    const matrix = toHeatmapMatrix(result, totalsResult);
    return matrix ? (
      <AnalyticsHeatmap
        columns={matrix.columns}
        format={matrix.format}
        rowHeader={matrix.rowHeader}
        rows={matrix.rows}
        totals={matrix.totals}
        values={matrix.values}
      />
    ) : (
      <AnalyticsTable result={result} />
    );
  }
  if (dimensionColumns(result).length === 1) {
    return <AnalyticsBarChart result={result} showValues={showValues} sort={sort} />;
  }
  return <AnalyticsTable result={result} />;
}
