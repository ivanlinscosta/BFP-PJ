import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ColumnDef } from '@bfp/domain';
import { formatMetricValue } from '@/lib/format';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { compareDimensionValues, dimensionColumns, labelOf, metricColumns, numeric } from './model';

export const SERIES_COLORS = [
  'var(--color-brand-orange)',
  'var(--color-brand-navy)',
  'var(--color-brand-navy-soft)',
  'var(--color-peach)',
  'var(--color-ink-faint)',
];

const axisTick = { fill: 'var(--color-ink-faint)', fontSize: 11 };

function formatter(column: ColumnDef | undefined) {
  return (value: unknown) => formatMetricValue(value, column?.format, { compact: true });
}

/** Line chart over a temporal dimension; a second dimension becomes the series. */
export function AnalyticsLineChart({
  result,
  showLegend = true,
  height = 260,
}: {
  result: AnalyticsResponse;
  showLegend?: boolean;
  height?: number;
}) {
  const [time, series] = dimensionColumns(result);
  const metrics = metricColumns(result);
  if (!time || metrics.length === 0) return null;

  const seriesKeys = series
    ? [...new Set(result.rows.map((row) => labelOf(result, series.key, row[series.key])))]
    : metrics.map((metric) => metric.label);
  const byTime = new Map<string, Record<string, unknown>>();
  for (const row of [...result.rows].sort((a, b) =>
    compareDimensionValues(a[time.key], b[time.key]),
  )) {
    const timeLabel = labelOf(result, time.key, row[time.key]);
    const entry = byTime.get(timeLabel) ?? { time: timeLabel };
    if (series) {
      entry[labelOf(result, series.key, row[series.key])] = numeric(row[metrics[0]!.key]);
    } else {
      metrics.forEach((metric) => {
        entry[metric.label] = numeric(row[metric.key]);
      });
    }
    byTime.set(timeLabel, entry);
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        <LineChart data={[...byTime.values()]} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-line)' }}
          />
          <YAxis
            tick={axisTick}
            tickFormatter={formatter(metrics[0])}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip formatter={(value) => formatMetricValue(value, metrics[0]?.format)} />
          {showLegend && seriesKeys.length > 1 ? (
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          ) : null}
          {seriesKeys.map((key, index) => (
            <Line
              dataKey={key}
              dot={false}
              isAnimationActive={false}
              key={key}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical grouped bars for several metrics over one categorical dimension. */
export function AnalyticsGroupedBarChart({
  result,
  showLegend = true,
  height = 260,
}: {
  result: AnalyticsResponse;
  showLegend?: boolean;
  height?: number;
}) {
  const dimension = dimensionColumns(result)[0];
  const metrics = metricColumns(result);
  if (!dimension) return null;

  const data = result.rows.map((row) => ({
    label: labelOf(result, dimension.key, row[dimension.key]),
    ...Object.fromEntries(metrics.map((metric) => [metric.label, numeric(row[metric.key])])),
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-line)' }}
          />
          {metrics.map((metric, index) => (
            <YAxis
              axisLine={false}
              hide={index > 1}
              key={metric.key}
              orientation={index === 0 ? 'left' : 'right'}
              tick={axisTick}
              tickFormatter={formatter(metric)}
              tickLine={false}
              width={64}
              yAxisId={metric.key}
            />
          ))}
          <Tooltip
            formatter={(value, name) =>
              formatMetricValue(value, metrics.find((metric) => metric.label === name)?.format)
            }
          />
          {showLegend ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {metrics.map((metric, index) => (
            <Bar
              dataKey={metric.label}
              fill={SERIES_COLORS[index % SERIES_COLORS.length]}
              isAnimationActive={false}
              key={metric.key}
              yAxisId={metric.key}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Scatter of two metrics, one point per category of the dimension. */
export function AnalyticsScatterChart({
  result,
  height = 280,
}: {
  result: AnalyticsResponse;
  height?: number;
}) {
  const dimension = dimensionColumns(result)[0];
  const [x, y] = metricColumns(result);
  if (!dimension || !x || !y) return null;

  const data = result.rows.map((row) => ({
    label: labelOf(result, dimension.key, row[dimension.key]),
    x: numeric(row[x.key]),
    y: numeric(row[y.key]),
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" />
          <XAxis
            dataKey="x"
            name={x.label}
            tick={axisTick}
            tickFormatter={formatter(x)}
            type="number"
          />
          <YAxis
            dataKey="y"
            name={y.label}
            tick={axisTick}
            tickFormatter={formatter(y)}
            type="number"
            width={64}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(value, name) =>
              formatMetricValue(value, name === x.label ? x.format : y.format)
            }
          />
          <Scatter
            data={data}
            fill="var(--color-brand-orange)"
            isAnimationActive={false}
            name={dimension.label}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
