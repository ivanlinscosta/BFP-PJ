import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { formatMetricValue } from '@/lib/format';
import { shapeSeries, SERIES_PALETTE, type ChartData, type ChartSeries } from './series';
import { ChartTooltip } from './tooltip';

const axisTick = { fill: 'var(--color-ink-faint)', fontSize: 11 };

export type SeriesKind = 'bar' | 'line' | 'area' | 'donut';
export type Stacking = 'NONE' | 'STACKED' | 'PERCENT';

export interface SeriesChartProps {
  result: AnalyticsResponse;
  kind: SeriesKind;
  orientation?: 'HORIZONTAL' | 'VERTICAL';
  stacking?: Stacking;
  showLegend?: boolean;
  showValues?: boolean;
  showGrid?: boolean;
  showPoints?: boolean;
  smooth?: boolean;
  showPercent?: boolean;
  innerRadius?: number;
  topN?: number;
}

function compact(value: unknown, format: ChartSeries['format'], percent?: boolean) {
  return percent
    ? formatMetricValue(value, 'percent')
    : formatMetricValue(value, format, { compact: true });
}

function truncate(label: string, size: number) {
  return label.length > size ? `${label.slice(0, size - 1)}…` : label;
}

function Axes({
  data,
  horizontal,
  percent,
}: {
  data: ChartData;
  horizontal?: boolean;
  percent?: boolean;
}) {
  const left = data.series.find((series) => series.axis === 'left') ?? data.series[0]!;
  const right = percent ? undefined : data.series.find((series) => series.axis === 'right');
  const many = data.rows.length > 8;
  if (horizontal) {
    return (
      <>
        <XAxis
          axisLine={false}
          tick={axisTick}
          tickFormatter={(value) => compact(value, left.format, percent)}
          tickLine={false}
          type="number"
        />
        <YAxis
          axisLine={false}
          dataKey="__category"
          interval={0}
          tick={axisTick}
          tickFormatter={(value: string) => truncate(value, 18)}
          tickLine={false}
          type="category"
          width={130}
        />
      </>
    );
  }
  return (
    <>
      <XAxis
        angle={many ? -35 : 0}
        axisLine={{ stroke: 'var(--color-line)' }}
        dataKey="__category"
        height={many ? 64 : 30}
        interval={data.rows.length > 24 ? 'preserveStartEnd' : 0}
        textAnchor={many ? 'end' : 'middle'}
        tick={axisTick}
        tickFormatter={(value: string) => truncate(value, many ? 14 : 20)}
        tickLine={false}
      />
      <YAxis
        axisLine={false}
        tick={axisTick}
        tickFormatter={(value) => compact(value, left.format, percent)}
        tickLine={false}
        width={68}
        yAxisId="left"
      />
      {right ? (
        <YAxis
          axisLine={false}
          orientation="right"
          tick={axisTick}
          tickFormatter={(value) => compact(value, right.format)}
          tickLine={false}
          width={68}
          yAxisId="right"
        />
      ) : null}
    </>
  );
}

/** Keeps only the top N categories by the first series (charts stay readable). */
function limitRows(data: ChartData, topN?: number): ChartData {
  if (!topN || data.temporal || data.rows.length <= topN) return data;
  return {
    ...data,
    rows: data.rows.slice(0, topN),
    notes: [...data.notes, `Mostrando as ${topN} maiores categorias.`],
  };
}

/** Donut: one metric over the categories of one dimension (largest 7 + "Outros"). */
function Donut({
  data,
  showLegend,
  showPercent,
  innerRadius,
}: {
  data: ChartData;
  showLegend: boolean;
  showPercent: boolean;
  innerRadius: number;
}) {
  const metric = data.series[0]!;
  const values = data.rows
    .map((row) => ({ name: String(row.__category), value: Number(row[metric.key] ?? 0) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
  const top = values.slice(0, 7);
  const rest = values.slice(7).reduce((sum, item) => sum + item.value, 0);
  const slices = rest > 0 ? [...top, { name: 'Outros', value: rest }] : top;
  const total = slices.reduce((sum, item) => sum + item.value, 0) || 1;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div style={{ height: 280 }}>
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              innerRadius={`${innerRadius}%`}
              isAnimationActive={false}
              nameKey="name"
              outerRadius="90%"
              paddingAngle={1}
              stroke="var(--color-card)"
            >
              {slices.map((slice, index) => (
                <Cell fill={SERIES_PALETTE[index % SERIES_PALETTE.length]} key={slice.name} />
              ))}
            </Pie>
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => metric.format}
                  payload={props.payload as never}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {showLegend ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {slices.map((slice, index) => (
            <li className="flex items-center gap-2" key={slice.name}>
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: SERIES_PALETTE[index % SERIES_PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-ink" title={slice.name}>
                {slice.name}
              </span>
              <span className="font-semibold text-brand-navy tabular-nums">
                {compact(slice.value, metric.format)}
              </span>
              {showPercent ? (
                <span className="w-12 text-right text-ink-soft tabular-nums">
                  {Math.round((slice.value / total) * 100)}%
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Generic category × series chart: bars or columns (simple, grouped, stacked, 100%), lines,
 * areas (simple or stacked) and donuts. Every type reads the same shaped data, so switching type
 * never loses the analysis.
 */
export function SeriesChart({
  result,
  kind,
  orientation = 'VERTICAL',
  stacking = 'NONE',
  showLegend = true,
  showValues = false,
  showGrid = true,
  showPoints = true,
  smooth = true,
  showPercent = true,
  innerRadius = 55,
  topN,
}: SeriesChartProps) {
  const shaped = shapeSeries(result);
  if (!shaped) return null;
  const data = limitRows(shaped, kind === 'line' || kind === 'area' ? undefined : topN);
  const percent = stacking === 'PERCENT';
  const stacked = stacking !== 'NONE';
  const horizontal = kind === 'bar' && orientation === 'HORIZONTAL';
  const formatOf = (key: string) => data.series.find((series) => series.key === key)?.format;
  const tooltip = (
    <Tooltip
      content={(props) => (
        <ChartTooltip
          active={props.active}
          formatOf={(key) => formatOf(key)}
          label={props.label}
          payload={props.payload as never}
          percent={percent}
        />
      )}
      cursor={kind === 'bar' ? { fill: 'var(--color-muted)' } : undefined}
    />
  );
  const legend =
    showLegend && data.series.length > 1 ? (
      <Legend
        iconSize={10}
        iconType="circle"
        itemSorter="dataKey"
        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
      />
    ) : null;
  const labels =
    showValues &&
    !percent &&
    data.rows.length <= 14 &&
    (kind === 'line' || kind === 'area'
      ? data.series.length === 1 && data.rows.length <= 12
      : data.series.length <= 3 && !stacked);
  const height = horizontal
    ? Math.max(
        220,
        data.rows.length * Math.max(26, (stacked ? 1 : data.series.length) * 14 + 12) + 56,
      )
    : 320;
  const notes = data.notes.length ? (
    <p className="m-0 mt-2 text-[11px] text-ink-soft">{data.notes.join(' ')}</p>
  ) : null;

  if (kind === 'donut') {
    return (
      <>
        <Donut
          data={data}
          innerRadius={innerRadius}
          showLegend={showLegend}
          showPercent={showPercent}
        />
        {notes}
      </>
    );
  }

  const grid = showGrid ? (
    <CartesianGrid horizontal={!horizontal} stroke="var(--color-line)" vertical={horizontal} />
  ) : null;
  const curve = smooth ? 'monotone' : 'linear';
  const axisOf = (series: ChartSeries) => (stacked ? 'left' : series.axis);

  const chart =
    kind === 'line' ? (
      <LineChart data={data.rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        {grid}
        <Axes data={data} />
        {tooltip}
        {legend}
        {data.series.map((series) => (
          <Line
            connectNulls
            dataKey={series.key}
            dot={
              showPoints && data.rows.length <= 24
                ? { r: 3, strokeWidth: 0, fill: series.color }
                : false
            }
            isAnimationActive={false}
            key={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.25}
            type={curve}
            yAxisId={series.axis}
          >
            {labels ? (
              <LabelList
                dataKey={series.key}
                fill="var(--color-ink-soft)"
                fontSize={10}
                formatter={(value: unknown) => compact(value, series.format)}
                position="top"
              />
            ) : null}
          </Line>
        ))}
      </LineChart>
    ) : kind === 'area' ? (
      <AreaChart
        data={data.rows}
        margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
        stackOffset={percent ? 'expand' : undefined}
      >
        {grid}
        <Axes data={data} percent={percent} />
        {tooltip}
        {legend}
        {data.series.map((series) => (
          <Area
            connectNulls
            dataKey={series.key}
            fill={series.color}
            fillOpacity={stacked ? 0.55 : data.series.length > 1 ? 0.12 : 0.18}
            isAnimationActive={false}
            key={series.key}
            name={series.label}
            stackId={stacked ? 'stack' : undefined}
            stroke={series.color}
            strokeWidth={2}
            type={curve}
            yAxisId={axisOf(series)}
          />
        ))}
      </AreaChart>
    ) : (
      <BarChart
        barCategoryGap={horizontal ? '22%' : '18%'}
        data={data.rows}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 16, right: horizontal ? 48 : 12, bottom: 0, left: 0 }}
        stackOffset={percent ? 'expand' : undefined}
      >
        {grid}
        <Axes data={data} horizontal={horizontal} percent={percent} />
        {tooltip}
        {legend}
        {data.series.map((series, index) => (
          <Bar
            dataKey={series.key}
            fill={series.color}
            isAnimationActive={false}
            key={series.key}
            maxBarSize={stacked ? 56 : 40}
            name={series.label}
            radius={
              stacked
                ? index === data.series.length - 1
                  ? horizontal
                    ? [0, 3, 3, 0]
                    : [3, 3, 0, 0]
                  : 0
                : horizontal
                  ? [0, 3, 3, 0]
                  : [3, 3, 0, 0]
            }
            stackId={stacked ? 'stack' : undefined}
            {...(horizontal ? {} : { yAxisId: axisOf(series) })}
          >
            {labels ? (
              <LabelList
                dataKey={series.key}
                fill="var(--color-ink-soft)"
                fontSize={10}
                formatter={(value: unknown) => compact(value, series.format)}
                position={horizontal ? 'right' : 'top'}
              />
            ) : null}
          </Bar>
        ))}
      </BarChart>
    );

  return (
    <figure aria-label={`Gráfico por ${data.categoryLabel}`} className="m-0">
      <div style={{ height }}>
        <ResponsiveContainer height="100%" width="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {!stacked && data.series.some((series) => series.axis === 'right') ? (
        <p className="m-0 mt-1 text-[11px] text-ink-soft">
          Eixo direito:{' '}
          {data.series
            .filter((series) => series.axis === 'right')
            .map((series) => series.label)
            .join(', ')}
        </p>
      ) : null}
      {notes}
    </figure>
  );
}
