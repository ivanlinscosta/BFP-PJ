import type { ColumnDef } from '@bfp/domain';
import { formatMetricValue } from '@/lib/format';

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/**
 * Tooltip shared by every chart: the category (dimension values), then one line per series with
 * its color, name and formatted value. Replaces the library's default tooltip.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatOf,
  context,
  percent,
}: {
  active?: boolean;
  payload?: readonly unknown[];
  label?: unknown;
  /** Format of each series (by dataKey). */
  formatOf: (dataKey: string) => ColumnDef['format'];
  /** Extra line under the values (e.g. "Total: R$ 1,2 mi"). */
  context?: (row: Record<string, unknown>) => string | null;
  /** Values are shares of the category total (100% stacked). */
  percent?: boolean;
}) {
  const entries = (payload ?? []) as readonly TooltipEntry[];
  if (!active || !entries.length) return null;
  const row = entries[0]?.payload ?? {};
  const total = percent
    ? entries.reduce((sum, entry) => sum + (typeof entry.value === 'number' ? entry.value : 0), 0)
    : 0;
  const extra = context?.(row);
  return (
    <div className="min-w-[160px] rounded-[var(--radius-control)] border border-line bg-card px-3 py-2 text-xs shadow-[0_6px_18px_rgba(0,26,71,0.12)]">
      {label !== undefined && label !== null && label !== '' ? (
        <p className="m-0 mb-1.5 font-semibold text-brand-navy">{String(label)}</p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {entries.map((entry) => (
          <li className="flex items-center gap-2" key={String(entry.dataKey ?? entry.name)}>
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-soft">
              {String(entry.name ?? '')}
            </span>
            <span className="font-semibold text-ink tabular-nums">
              {formatMetricValue(entry.value, formatOf(String(entry.dataKey ?? '')))}
              {percent && total && typeof entry.value === 'number'
                ? ` · ${formatMetricValue(entry.value / total, 'percent')}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
      {extra ? (
        <p className="m-0 mt-1.5 border-t border-line pt-1.5 text-ink-soft">{extra}</p>
      ) : null}
    </div>
  );
}
