import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatMetricValue } from '@/lib/format';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { downloadCsv } from './csv';
import { labelOf } from './model';

/**
 * Table of the aggregated result: sortable headers (keyboard accessible), pagination, conditional
 * formatting (proportional bar behind metric cells) and CSV export.
 */
export function AnalyticsTable({
  result,
  maxRows = 200,
  pageSize,
  conditional = false,
  exportName,
}: {
  result: AnalyticsResponse;
  maxRows?: number;
  /** Rows per page; without it the table shows up to maxRows. */
  pageSize?: number;
  /** Bar behind each metric value, proportional to the column maximum. */
  conditional?: boolean;
  /** Shows "Exportar CSV" with this file name. */
  exportName?: string;
}) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return result.rows;
    return [...result.rows].sort((left, right) => {
      const a = left[sort.key];
      const b = right[sort.key];
      const comparison =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [result.rows, sort]);
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const rows = pageSize
    ? sorted.slice(current * pageSize, current * pageSize + pageSize)
    : sorted.slice(0, maxRows);
  const maxByColumn = useMemo(() => {
    const map = new Map<string, number>();
    for (const column of result.columns) {
      if (column.type !== 'metric') continue;
      map.set(
        column.key,
        Math.max(
          ...result.rows.map((row) =>
            typeof row[column.key] === 'number' ? Math.abs(row[column.key] as number) : 0,
          ),
          0,
        ),
      );
    }
    return map;
  }, [result]);

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <THead>
          <TR>
            {result.columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <TH
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                  className={column.type === 'metric' ? 'text-right' : undefined}
                  key={column.key}
                >
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => {
                      setPage(0);
                      setSort({
                        key: column.key,
                        direction: active && sort.direction === 'desc' ? 'asc' : 'desc',
                      });
                    }}
                    type="button"
                  >
                    {column.label}
                    {active ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                      )
                    ) : null}
                  </button>
                </TH>
              );
            })}
          </TR>
        </THead>
        <TBody>
          {rows.map((row, index) => (
            <TR key={index}>
              {result.columns.map((column) => {
                const value = row[column.key];
                const max = maxByColumn.get(column.key) ?? 0;
                const share =
                  conditional && column.type === 'metric' && typeof value === 'number' && max
                    ? Math.abs(value) / max
                    : null;
                return (
                  <TD
                    className={
                      column.type === 'metric'
                        ? 'relative text-right font-medium tabular-nums'
                        : undefined
                    }
                    key={column.key}
                  >
                    {share !== null ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1 right-1 rounded-sm bg-cream"
                        style={{ width: `calc(${share * 100}% - 8px)` }}
                      />
                    ) : null}
                    <span className="relative">
                      {column.type === 'dimension'
                        ? labelOf(result, column.key, value)
                        : formatMetricValue(value, column.format)}
                    </span>
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>
      {pageSize || exportName ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          {pageSize && pages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                className="rounded px-2 py-1 font-semibold text-brand-navy hover:bg-muted disabled:opacity-40"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                type="button"
              >
                Anterior
              </button>
              <span>
                Página {current + 1} de {pages} · {sorted.length} linhas
              </span>
              <button
                className="rounded px-2 py-1 font-semibold text-brand-navy hover:bg-muted disabled:opacity-40"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                type="button"
              >
                Próxima
              </button>
            </div>
          ) : (
            <span>{sorted.length} linhas</span>
          )}
          {exportName ? (
            <button
              className="inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-brand-navy hover:bg-muted"
              onClick={() => downloadCsv(result, exportName)}
              type="button"
            >
              <Download aria-hidden className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Headline numbers when the analysis has no dimension. */
export function AnalyticsKpis({ result }: { result: AnalyticsResponse }) {
  const row = result.rows[0] ?? {};
  const metrics = result.columns.filter((column) => column.type === 'metric');
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => (
        <div className="rounded-[var(--radius-control)] bg-muted px-5 py-4" key={metric.key}>
          <p className="text-[13px] text-ink-soft">{metric.label}</p>
          <p className="mt-1 text-[32px] leading-none font-bold text-brand-navy">
            {formatMetricValue(row[metric.key], metric.format)}
          </p>
        </div>
      ))}
    </div>
  );
}

export { labelOf };
