import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { formatMetricValue } from '@/lib/format';
import { dimensionColumns, labelOf, metricColumns, numeric } from './model';
import { SERIES_PALETTE } from './series';
import { ChartTooltip } from './tooltip';
import { boxGroups, histogram, quartiles } from './transforms';

const axisTick = { fill: 'var(--color-ink-faint)', fontSize: 11 };

function median(values: number[]) {
  return quartiles(values)?.median ?? 0;
}

/**
 * Scatter, bubble and quadrant: two metrics on the axes (and a third as the bubble size); each
 * point is a value of the dimension. Quadrants split the plane at the medians.
 */
export function RelationChart({
  result,
  variant,
  xKey,
  yKey,
  sizeKey,
  trendLine = false,
  showLabels = true,
}: {
  result: AnalyticsResponse;
  variant: 'SCATTER' | 'BUBBLE' | 'QUADRANT';
  xKey?: string;
  yKey?: string;
  sizeKey?: string;
  trendLine?: boolean;
  showLabels?: boolean;
}) {
  const [dimension] = dimensionColumns(result);
  const metrics = metricColumns(result);
  const x = metrics.find((metric) => metric.key === xKey) ?? metrics[0];
  const y =
    metrics.find((metric) => metric.key === yKey && metric.key !== x?.key) ??
    metrics.find((metric) => metric.key !== x?.key);
  const size =
    variant === 'BUBBLE'
      ? (metrics.find((metric) => metric.key === sizeKey && metric !== x && metric !== y) ??
        metrics.find((metric) => metric !== x && metric !== y))
      : undefined;
  if (!dimension || !x || !y) return null;
  const points = result.rows
    .map((row) => ({
      label: labelOf(result, dimension.key, row[dimension.key]),
      x: numeric(row[x.key]),
      y: numeric(row[y.key]),
      z: size ? numeric(row[size.key]) : 1,
    }))
    .filter(
      (point): point is { label: string; x: number; y: number; z: number } =>
        point.x !== null && point.y !== null && point.z !== null,
    );
  const medianX = median(points.map((point) => point.x));
  const medianY = median(points.map((point) => point.y));
  // Least squares line for the trend option.
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / (n || 1);
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / (n || 1);
  const slope =
    points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) /
    (points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) || 1);
  const xs = points.map((point) => point.x);
  const trend =
    trendLine && n > 2
      ? [
          { x: Math.min(...xs), y: meanY + slope * (Math.min(...xs) - meanX) },
          { x: Math.max(...xs), y: meanY + slope * (Math.max(...xs) - meanX) },
        ]
      : null;
  const quadrantName = (point: { x: number; y: number }) =>
    `${point.y >= medianY ? 'Alto' : 'Baixo'} ${y.label.toLowerCase()} · ${point.x >= medianX ? 'alto' : 'baixo'} ${x.label.toLowerCase()}`;
  return (
    <figure aria-label={`${y.label} versus ${x.label} por ${dimension.label}`} className="m-0">
      <div style={{ height: 340 }}>
        <ResponsiveContainer height="100%" width="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" />
            <XAxis
              dataKey="x"
              name={x.label}
              tick={axisTick}
              tickFormatter={(value) => formatMetricValue(value, x.format, { compact: true })}
              type="number"
            ></XAxis>
            <YAxis
              dataKey="y"
              name={y.label}
              tick={axisTick}
              tickFormatter={(value) => formatMetricValue(value, y.format, { compact: true })}
              type="number"
              width={68}
            />
            <ZAxis dataKey="z" range={variant === 'BUBBLE' ? [60, 900] : [70, 70]} type="number" />
            {variant === 'QUADRANT' ? (
              <>
                <ReferenceLine stroke="var(--color-chart-2)" strokeDasharray="4 4" x={medianX} />
                <ReferenceLine stroke="var(--color-chart-2)" strokeDasharray="4 4" y={medianY} />
              </>
            ) : null}
            <Tooltip
              content={(props) => {
                const point = (props.payload?.[0]?.payload ?? null) as {
                  label: string;
                  x: number;
                  y: number;
                  z: number;
                } | null;
                if (!props.active || !point) return null;
                return (
                  <ChartTooltip
                    active
                    context={() => (variant === 'QUADRANT' ? quadrantName(point) : null)}
                    formatOf={(key) =>
                      key === 'x' ? x.format : key === 'y' ? y.format : size?.format
                    }
                    label={point.label}
                    payload={[
                      { name: x.label, value: point.x, dataKey: 'x', color: SERIES_PALETTE[1] },
                      { name: y.label, value: point.y, dataKey: 'y', color: SERIES_PALETTE[0] },
                      ...(size
                        ? [
                            {
                              name: size.label,
                              value: point.z,
                              dataKey: 'z',
                              color: SERIES_PALETTE[2],
                            },
                          ]
                        : []),
                    ]}
                  />
                );
              }}
            />
            <Scatter
              data={points}
              fill="var(--color-chart-1)"
              fillOpacity={variant === 'BUBBLE' ? 0.55 : 0.85}
              isAnimationActive={false}
              name={dimension.label}
            >
              {showLabels && points.length <= 20 ? (
                <LabelList
                  dataKey="label"
                  fill="var(--color-ink-soft)"
                  fontSize={10}
                  position="top"
                />
              ) : null}
            </Scatter>
            {trend ? (
              <Scatter
                data={trend}
                fill="none"
                isAnimationActive={false}
                legendType="none"
                line={{ stroke: 'var(--color-chart-2)', strokeDasharray: '5 4' }}
                shape={() => <g />}
              />
            ) : null}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-1 text-[11px] text-ink-soft">
        Eixo X: {x.label} · Eixo Y: {y.label}
        {size ? ` · Tamanho: ${size.label}` : ''}
        {variant === 'QUADRANT' ? ' · Linhas tracejadas nas medianas' : ''}
      </p>
    </figure>
  );
}

/** Histogram: how the metric values of the dimension's categories spread over bins. */
export function HistogramChart({ result, bins }: { result: AnalyticsResponse; bins?: number }) {
  const metric = metricColumns(result)[0];
  const [dimension] = dimensionColumns(result);
  if (!metric || !dimension) return null;
  const values = result.rows
    .map((row) => numeric(row[metric.key]))
    .filter((value): value is number => value !== null);
  const data = histogram(values, bins, (value) =>
    formatMetricValue(value, metric.format, { compact: true }),
  );
  return (
    <figure aria-label={`Distribuição de ${metric.label}`} className="m-0">
      <div style={{ height: 300 }}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            barCategoryGap={2}
            data={data}
            margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              angle={data.length > 4 ? -30 : 0}
              dataKey="label"
              height={data.length > 4 ? 90 : 30}
              interval={0}
              textAnchor={data.length > 4 ? 'end' : 'middle'}
              tick={axisTick}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={axisTick}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => 'number'}
                  label={props.label}
                  payload={(props.payload ?? []).map((entry) => ({
                    ...entry,
                    name: `Quantidade de ${dimension.label.toLowerCase()}`,
                  }))}
                />
              )}
              cursor={{ fill: 'var(--color-muted)' }}
            />
            <Bar dataKey="count" fill="var(--color-chart-1)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-1 text-[11px] text-ink-soft">
        Distribuição de {metric.label.toLowerCase()} entre {values.length}{' '}
        {dimension.label.toLowerCase()} em {data.length} faixas.
      </p>
    </figure>
  );
}

/** Box plot: min, quartiles, median, max and outliers per group. */
export function BoxPlotChart({ result }: { result: AnalyticsResponse }) {
  const metric = metricColumns(result)[0];
  const groups = boxGroups(result);
  if (!metric || groups.length === 0) return null;
  const all = groups.flatMap((group) => [
    group.stats.min,
    group.stats.max,
    ...group.stats.outliers,
  ]);
  const low = Math.min(...all);
  const high = Math.max(...all);
  const scale = (value: number) => (high === low ? 50 : ((value - low) / (high - low)) * 100);
  const show = (value: number) => formatMetricValue(value, metric.format, { compact: true });
  return (
    <figure aria-label={`Box plot de ${metric.label}`} className="m-0">
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {groups.map((group) => (
          <li className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3" key={group.key}>
            <span className="truncate text-[13px] text-ink" title={group.label}>
              {group.label}
            </span>
            <div
              aria-label={`${group.label}: mediana ${show(group.stats.median)}, Q1 ${show(group.stats.q1)}, Q3 ${show(group.stats.q3)}, mínimo ${show(group.stats.min)}, máximo ${show(group.stats.max)}`}
              className="relative h-7"
              role="img"
              title={`Mín ${show(group.stats.min)} · Q1 ${show(group.stats.q1)} · Mediana ${show(group.stats.median)} · Q3 ${show(group.stats.q3)} · Máx ${show(group.stats.max)}`}
            >
              <div
                className="absolute top-1/2 h-px bg-ink-faint"
                style={{
                  left: `${scale(group.stats.min)}%`,
                  width: `${scale(group.stats.max) - scale(group.stats.min)}%`,
                }}
              />
              <div
                className="absolute top-1 bottom-1 rounded-sm border border-brand-orange bg-cream"
                style={{
                  left: `${scale(group.stats.q1)}%`,
                  width: `${Math.max(0.6, scale(group.stats.q3) - scale(group.stats.q1))}%`,
                }}
              />
              <div
                className="absolute top-0.5 bottom-0.5 w-0.5 bg-brand-navy"
                style={{ left: `${scale(group.stats.median)}%` }}
              />
              {group.stats.outliers.map((value, index) => (
                <span
                  className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink-soft"
                  key={index}
                  style={{ left: `${scale(value)}%` }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 flex justify-between pl-[152px] text-[11px] text-ink-faint tabular-nums">
        <span>{show(low)}</span>
        <span>{show(high)}</span>
      </p>
      <p className="m-0 mt-1 text-[11px] text-ink-soft">
        Caixa = 1º a 3º quartil · traço = mediana · pontos = valores atípicos (1,5 × IQR).
      </p>
    </figure>
  );
}

/** Radar: profile in several metrics on the same scale (e.g. the six Customer DNA scores). */
export function RadarProfile({
  result,
  showLegend = true,
}: {
  result: AnalyticsResponse;
  showLegend?: boolean;
}) {
  const metrics = metricColumns(result);
  const [dimension] = dimensionColumns(result);
  const series = dimension
    ? result.rows.slice(0, 6).map((row, index) => ({
        key: `s${index}`,
        label: labelOf(result, dimension.key, row[dimension.key]),
        row,
      }))
    : [{ key: 's0', label: 'Valor', row: result.rows[0] ?? {} }];
  const data = metrics.map((metric) => ({
    axis: metric.label,
    ...Object.fromEntries(series.map((item) => [item.key, numeric(item.row[metric.key])])),
  }));
  const format = metrics[0]?.format;
  return (
    <figure aria-label="Perfil em radar" className="m-0">
      <div style={{ height: 340 }}>
        <ResponsiveContainer height="100%" width="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="var(--color-line)" />
            <PolarAngleAxis dataKey="axis" tick={{ ...axisTick, fill: 'var(--color-ink-soft)' }} />
            <PolarRadiusAxis
              tick={axisTick}
              tickFormatter={(value) => formatMetricValue(value, format, { compact: true })}
            />
            {series.map((item, index) => (
              <Radar
                dataKey={item.key}
                fill={SERIES_PALETTE[index % SERIES_PALETTE.length]}
                fillOpacity={series.length > 1 ? 0.12 : 0.25}
                isAnimationActive={false}
                key={item.key}
                name={item.label}
                stroke={SERIES_PALETTE[index % SERIES_PALETTE.length]}
              />
            ))}
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => format}
                  label={props.label}
                  payload={props.payload}
                />
              )}
            />
            {showLegend && series.length > 1 ? (
              <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            ) : null}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Ranking: Top N in a numbered list with proportional bars. */
export function RankingList({
  result,
  topN = 10,
  sort = 'DESC',
}: {
  result: AnalyticsResponse;
  topN?: number;
  sort?: 'ASC' | 'DESC' | 'NONE' | 'LABEL';
}) {
  const [dimension] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!dimension || !metric) return null;
  const rows = result.rows
    .map((row) => ({
      label: labelOf(result, dimension.key, row[dimension.key]),
      value: numeric(row[metric.key]) ?? 0,
    }))
    .sort((left, right) =>
      sort === 'ASC'
        ? left.value - right.value
        : sort === 'LABEL'
          ? left.label.localeCompare(right.label, 'pt-BR')
          : right.value - left.value,
    )
    .slice(0, topN);
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <figure aria-label={`Ranking de ${dimension.label} por ${metric.label}`} className="m-0">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row, index) => (
          <li
            className="grid grid-cols-[28px_minmax(0,180px)_minmax(0,1fr)_96px] items-center gap-3"
            key={row.label}
          >
            <span
              className={
                index === 0
                  ? 'flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange text-xs font-bold text-white'
                  : 'flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-ink-soft'
              }
            >
              {index + 1}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink" title={row.label}>
              {row.label}
            </span>
            <div className="h-2.5 rounded-full bg-muted">
              <div
                className="h-2.5 rounded-full"
                style={{
                  width: `${(Math.abs(row.value) / max) * 100}%`,
                  background: index === 0 ? 'var(--color-chart-1)' : 'var(--color-chart-2)',
                }}
              />
            </div>
            <span className="text-right text-[13px] font-semibold text-brand-navy tabular-nums">
              {formatMetricValue(row.value, metric.format, { compact: true })}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
