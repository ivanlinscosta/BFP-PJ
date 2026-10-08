import { formatMetricValue } from '@/lib/format';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { dimensionColumns, labelOf, metricColumns, niceScale, numeric } from './model';

export type BarSort = 'DESC' | 'ASC' | 'LABEL';

/** Horizontal bar chart (one metric × one dimension), as in the reference screen 02. */
export function AnalyticsBarChart({
  result,
  sort = 'DESC',
  showValues = true,
  maxBars = 12,
}: {
  result: AnalyticsResponse;
  sort?: BarSort;
  showValues?: boolean;
  maxBars?: number;
}) {
  const dimension = dimensionColumns(result)[0];
  const metric = metricColumns(result)[0];
  if (!dimension || !metric) {
    return null;
  }

  const bars = result.rows
    .map((row) => ({
      label: labelOf(result, dimension.key, row[dimension.key]),
      value: numeric(row[metric.key]),
    }))
    .sort((left, right) =>
      sort === 'LABEL'
        ? left.label.localeCompare(right.label, 'pt-BR')
        : sort === 'ASC'
          ? (left.value ?? 0) - (right.value ?? 0)
          : (right.value ?? 0) - (left.value ?? 0),
    )
    .slice(0, maxBars);
  const { max, ticks } = niceScale(Math.max(0, ...bars.map((bar) => bar.value ?? 0)));

  return (
    <figure aria-label={`${metric.label} por ${dimension.label}`} className="relative m-0">
      <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
        {bars.map((bar) => (
          <li className="grid grid-cols-[120px_1fr_56px] items-center gap-0" key={bar.label}>
            <span className="truncate pr-3 text-sm text-ink-soft" title={bar.label}>
              {bar.label}
            </span>
            <span className="relative block h-[22px] bg-page">
              <span
                className="absolute inset-y-0 left-0 block bg-brand-orange"
                style={{ width: `${((bar.value ?? 0) / max) * 100}%` }}
              />
            </span>
            <span className="pl-3 text-right text-sm font-semibold text-brand-navy">
              {showValues ? formatMetricValue(bar.value, metric.format, { compact: true }) : ''}
            </span>
          </li>
        ))}
      </ul>
      <div aria-hidden className="mt-3 grid grid-cols-[120px_1fr_56px]">
        <span />
        <span className="relative h-4">
          {ticks.map((tick) => (
            <span
              className="absolute -translate-x-1/2 text-[11px] text-ink-faint"
              key={tick}
              style={{ left: `${(tick / max) * 100}%` }}
            >
              {formatMetricValue(tick, metric.format, { compact: true }).replace(',0%', '%')}
            </span>
          ))}
        </span>
      </div>
      <figcaption className="sr-only">
        {bars
          .map((bar) => `${bar.label}: ${formatMetricValue(bar.value, metric.format)}`)
          .join('; ')}
      </figcaption>
    </figure>
  );
}
