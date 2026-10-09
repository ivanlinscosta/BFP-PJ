import type { ColumnDef } from '@bfp/domain';
import type { AnalyticsResponse } from '@/features/explorer/api';
import {
  compareCategory,
  compareDimensionValues,
  dimensionColumns,
  labelOf,
  metricColumns,
  numeric,
} from './model';

/** Institutional chart palette (design tokens in styles.css; no hex codes in charts). */
export const SERIES_PALETTE = Array.from(
  { length: 8 },
  (_, index) => `var(--color-chart-${index + 1})`,
);

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  axis: 'left' | 'right';
  format: ColumnDef['format'];
}

export interface ChartData {
  categoryLabel: string;
  /** One row per category; series values keyed by `ChartSeries.key`. */
  rows: Array<Record<string, string | number | null>>;
  series: ChartSeries[];
  temporal: boolean;
  /** Notes about what was trimmed to keep the chart readable. */
  notes: string[];
}

const MAX_SERIES = 8;
const MAX_CATEGORIES = 40;

function isTemporal(result: AnalyticsResponse, column: ColumnDef) {
  const sample = result.rows.find(
    (row) => row[column.key] !== null && row[column.key] !== undefined,
  );
  return /^\d{4}-\d{2}/.test(String(sample?.[column.key] ?? ''));
}

/**
 * Shapes any analytics result into category × series for the charts: the first dimension gives the
 * categories (chronological for dates, business order for sizes, largest first otherwise); the
 * second dimension or the extra metrics become the series. Two metrics with very different scales
 * get a right axis so neither line is flattened.
 */
export function shapeSeries(result: AnalyticsResponse): ChartData | null {
  const [category, split] = dimensionColumns(result);
  const metrics = metricColumns(result);
  if (!category || metrics.length === 0) return null;
  const notes: string[] = [];
  const temporal = isTemporal(result, category);

  const rawCategories = [...new Set(result.rows.map((row) => String(row[category.key] ?? '')))];
  const firstMetric = metrics[0]!;
  const totalByCategory = new Map<string, number>();
  for (const row of result.rows) {
    const key = String(row[category.key] ?? '');
    totalByCategory.set(
      key,
      (totalByCategory.get(key) ?? 0) + (numeric(row[firstMetric.key]) ?? 0),
    );
  }
  rawCategories.sort((left, right) => {
    if (temporal) return compareDimensionValues(left, right);
    if (category.key === 'company_size')
      return compareCategory(
        category,
        labelOf(result, category.key, left),
        labelOf(result, category.key, right),
      );
    return (totalByCategory.get(right) ?? 0) - (totalByCategory.get(left) ?? 0);
  });
  let categories = rawCategories;
  if (categories.length > MAX_CATEGORIES) {
    notes.push(
      `Mostrando ${MAX_CATEGORIES} de ${categories.length} ${category.label.toLowerCase()}.`,
    );
    categories = temporal ? categories.slice(-MAX_CATEGORIES) : categories.slice(0, MAX_CATEGORIES);
  }

  let series: ChartSeries[];
  const rows: ChartData['rows'] = categories.map((value) => ({
    __category: labelOf(result, category.key, value),
  }));
  const rowIndex = new Map(categories.map((value, index) => [value, index]));

  if (split) {
    const totalBySplit = new Map<string, number>();
    for (const row of result.rows) {
      const key = String(row[split.key] ?? '');
      totalBySplit.set(
        key,
        (totalBySplit.get(key) ?? 0) + Math.abs(numeric(row[firstMetric.key]) ?? 0),
      );
    }
    const splits = [...totalBySplit.keys()].sort((left, right) =>
      split.key === 'company_size'
        ? compareCategory(
            split,
            labelOf(result, split.key, left),
            labelOf(result, split.key, right),
          )
        : (totalBySplit.get(right) ?? 0) - (totalBySplit.get(left) ?? 0),
    );
    const kept = splits.slice(0, MAX_SERIES);
    if (splits.length > MAX_SERIES) {
      notes.push(
        `Mostrando as ${MAX_SERIES} maiores séries de ${splits.length} (${split.label.toLowerCase()}).`,
      );
    }
    if (metrics.length > 1)
      notes.push(`Com duas dimensões, o gráfico usa só ${firstMetric.label}.`);
    series = kept.map((value, index) => ({
      key: `s${index}`,
      label: labelOf(result, split.key, value),
      color: SERIES_PALETTE[index % SERIES_PALETTE.length]!,
      axis: 'left',
      format: firstMetric.format,
    }));
    const keyBySplit = new Map(kept.map((value, index) => [value, `s${index}`]));
    for (const row of result.rows) {
      const index = rowIndex.get(String(row[category.key] ?? ''));
      const key = keyBySplit.get(String(row[split.key] ?? ''));
      if (index === undefined || !key) continue;
      rows[index]![key] = numeric(row[firstMetric.key]);
    }
  } else {
    const maxOf = (key: string) =>
      Math.max(0, ...result.rows.map((row) => Math.abs(numeric(row[key]) ?? 0)));
    const reference = maxOf(firstMetric.key) || 1;
    series = metrics.slice(0, MAX_SERIES).map((metric, index) => {
      const max = maxOf(metric.key) || 1;
      const ratio = Math.max(reference, max) / Math.min(reference, max);
      const differentScale = index > 0 && (ratio > 5 || metric.format !== firstMetric.format);
      return {
        key: `m${index}`,
        label: metric.label,
        color: SERIES_PALETTE[index % SERIES_PALETTE.length]!,
        axis: differentScale ? 'right' : 'left',
        format: metric.format,
      };
    });
    for (const row of result.rows) {
      const index = rowIndex.get(String(row[category.key] ?? ''));
      if (index === undefined) continue;
      metrics.slice(0, MAX_SERIES).forEach((metric, metricIndex) => {
        rows[index]![`m${metricIndex}`] = numeric(row[metric.key]);
      });
    }
  }

  return { categoryLabel: category.label, rows, series, temporal, notes };
}
