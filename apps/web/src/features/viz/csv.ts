import type { AnalyticsResponse } from '@/features/explorer/api';
import { labelOf } from './model';

function escape(value: string) {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Builds a CSV (pt-BR, ";" separator) with the aggregated, authorized rows of the current
 * query. Only what the API returned is exported — never row-level datasets.
 */
export function buildCsv(result: AnalyticsResponse) {
  const header = result.columns.map((column) => escape(column.label)).join(';');
  const lines = result.rows.map((row) =>
    result.columns
      .map((column) => {
        const value = row[column.key];
        if (column.type === 'dimension') {
          return escape(labelOf(result, column.key, value));
        }
        if (typeof value === 'number') {
          return String(value).replace('.', ',');
        }
        return value === null || value === undefined ? '' : escape(String(value));
      })
      .join(';'),
  );
  return [header, ...lines].join('\n');
}

/** Triggers a client-side download of the CSV. */
export function downloadCsv(result: AnalyticsResponse, fileName: string) {
  const blob = new Blob([String.fromCharCode(0xfeff), buildCsv(result)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
