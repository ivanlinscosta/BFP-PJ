import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatMetricValue } from '@/lib/format';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { labelOf } from './model';

/** Sortable table of the aggregated result (keyboard accessible headers). */
export function AnalyticsTable({
  result,
  maxRows = 200,
}: {
  result: AnalyticsResponse;
  maxRows?: number;
}) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const rows = useMemo(() => {
    if (!sort) return result.rows.slice(0, maxRows);
    return [...result.rows]
      .sort((left, right) => {
        const a = left[sort.key];
        const b = right[sort.key];
        const comparison =
          typeof a === 'number' && typeof b === 'number'
            ? a - b
            : String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });
        return sort.direction === 'asc' ? comparison : -comparison;
      })
      .slice(0, maxRows);
  }, [result.rows, sort, maxRows]);

  return (
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
                  onClick={() =>
                    setSort({
                      key: column.key,
                      direction: active && sort.direction === 'desc' ? 'asc' : 'desc',
                    })
                  }
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
            {result.columns.map((column) => (
              <TD
                className={
                  column.type === 'metric' ? 'text-right font-medium tabular-nums' : undefined
                }
                key={column.key}
              >
                {column.type === 'dimension'
                  ? labelOf(result, column.key, row[column.key])
                  : formatMetricValue(row[column.key], column.format)}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
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
