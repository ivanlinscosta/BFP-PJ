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
import type { VisualizationType } from '@bfp/domain';
import { formatMetricValue } from '@/lib/format';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { shapeSeries, SERIES_PALETTE, type ChartData, type ChartSeries } from './series';

const axisTick = { fill: 'var(--color-ink-faint)', fontSize: 11 };
const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid var(--color-line)',
  background: 'var(--color-card)',
  fontSize: 12,
};

type SeriesType = Extract<
  VisualizationType,
  'BAR' | 'GROUPED_BAR' | 'STACKED_BAR' | 'LINE' | 'AREA' | 'DONUT'
>;

function compact(value: unknown, format: ChartSeries['format']) {
  return formatMetricValue(value, format, { compact: true });
}

function truncate(label: string, size: number) {
  return label.length > size ? `${label.slice(0, size - 1)}…` : label;
}

function Axes({ data, horizontal }: { data: ChartData; horizontal?: boolean }) {
  const left = data.series.find((series) => series.axis === 'left') ?? data.series[0]!;
  const right = data.series.find((series) => series.axis === 'right');
  const many = data.rows.length > 8;
  if (horizontal) {
    return (
      <>
        <XAxis
          axisLine={false}
          tick={axisTick}
          tickFormatter={(value) => compact(value, left.format)}
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
        tickFormatter={(value) => compact(value, left.format)}
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

function tooltipFormatter(data: ChartData) {
  return (value: unknown, name: unknown) => {
    const series = data.series.find((item) => item.label === name);
    return [formatMetricValue(value, series?.format), String(name)];
  };
}

/** Donut: one metric over the categories of one dimension (largest 7 + "Outros"). */
function Donut({ data, showLegend }: { data: ChartData; showLegend: boolean }) {
  const metric = data.series[0]!;
  const values = data.rows
    .map((row) => ({ name: String(row.__category), value: Number(row[metric.key] ?? 0) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
  const additive = metric.format !== 'percent';
  const top = values.slice(0, 7);
  const rest = values.slice(7).reduce((sum, item) => sum + item.value, 0);
  const slices = additive && rest > 0 ? [...top, { name: 'Outros', value: rest }] : top;
  const total = slices.reduce((sum, item) => sum + item.value, 0) || 1;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div style={{ height: 280 }}>
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              innerRadius="55%"
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
              contentStyle={tooltipStyle}
              formatter={(value) => formatMetricValue(value, metric.format)}
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
              {additive ? (
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
 * Charts with categories and series (columns, stacked columns, grouped bars, lines, areas and
 * donuts). Every type reads the same shaped data, so switching type never loses the analysis.
 */
export function SeriesChart({
  result,
  type,
  showLegend = true,
  showValues = false,
}: {
  result: AnalyticsResponse;
  type: SeriesType;
  showLegend?: boolean;
  showValues?: boolean;
}) {
  const data = shapeSeries(result);
  if (!data) return null;
  const legend =
    showLegend && (data.series.length > 1 || type === 'DONUT') ? (
      <Legend
        iconSize={10}
        iconType="circle"
        itemSorter="dataKey"
        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
      />
    ) : null;
  // Value labels only where they stay readable: few categories, and one series on lines/areas.
  const labels =
    showValues &&
    data.rows.length <= 14 &&
    (type === 'LINE' || type === 'AREA'
      ? data.series.length === 1 && data.rows.length <= 12
      : data.series.length <= 3);
  // Horizontal bars grow with categories × series so every bar keeps a readable thickness.
  const height =
    type === 'BAR'
      ? Math.max(220, data.rows.length * Math.max(26, data.series.length * 14 + 12) + 56)
      : 320;
  const formatTooltip = tooltipFormatter(data);
  const notes = data.notes.length ? (
    <p className="m-0 mt-2 text-[11px] text-ink-soft">{data.notes.join(' ')}</p>
  ) : null;

  if (type === 'DONUT') {
    return (
      <>
        <Donut data={data} showLegend={showLegend} />
        {notes}
      </>
    );
  }

  const chart =
    type === 'LINE' ? (
      <LineChart data={data.rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-line)" vertical={false} />
        <Axes data={data} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltip} />
        {legend}
        {data.series.map((series) => (
          <Line
            connectNulls
            dataKey={series.key}
            dot={data.rows.length <= 24 ? { r: 3, strokeWidth: 0, fill: series.color } : false}
            isAnimationActive={false}
            key={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2.25}
            type="monotone"
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
    ) : type === 'AREA' ? (
      <AreaChart data={data.rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--color-line)" vertical={false} />
        <Axes data={data} />
        <Tooltip contentStyle={tooltipStyle} formatter={formatTooltip} />
        {legend}
        {data.series.map((series) => (
          <Area
            connectNulls
            dataKey={series.key}
            fill={series.color}
            fillOpacity={data.series.length > 1 ? 0.12 : 0.18}
            isAnimationActive={false}
            key={series.key}
            name={series.label}
            stroke={series.color}
            strokeWidth={2}
            type="monotone"
            yAxisId={series.axis}
          />
        ))}
      </AreaChart>
    ) : (
      <BarChart
        barCategoryGap={type === 'BAR' ? '22%' : '18%'}
        data={data.rows}
        layout={type === 'BAR' ? 'vertical' : 'horizontal'}
        margin={{ top: 16, right: type === 'BAR' ? 48 : 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          horizontal={type !== 'BAR'}
          stroke="var(--color-line)"
          vertical={type === 'BAR'}
        />
        <Axes data={data} horizontal={type === 'BAR'} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: 'var(--color-muted)' }}
          formatter={formatTooltip}
        />
        {legend}
        {data.series.map((series, index) => (
          <Bar
            dataKey={series.key}
            fill={series.color}
            isAnimationActive={false}
            key={series.key}
            maxBarSize={type === 'STACKED_BAR' ? 56 : 40}
            name={series.label}
            radius={
              type === 'STACKED_BAR'
                ? index === data.series.length - 1
                  ? [3, 3, 0, 0]
                  : 0
                : type === 'BAR'
                  ? [0, 3, 3, 0]
                  : [3, 3, 0, 0]
            }
            stackId={type === 'STACKED_BAR' ? 'stack' : undefined}
            {...(type === 'BAR' ? {} : { yAxisId: type === 'STACKED_BAR' ? 'left' : series.axis })}
          >
            {labels && type !== 'STACKED_BAR' ? (
              <LabelList
                dataKey={series.key}
                fill="var(--color-ink-soft)"
                fontSize={10}
                formatter={(value: unknown) => compact(value, series.format)}
                position={type === 'BAR' ? 'right' : 'top'}
              />
            ) : null}
          </Bar>
        ))}
      </BarChart>
    );

  return (
    <figure className="m-0" aria-label={`Gráfico por ${data.categoryLabel}`}>
      <div style={{ height }}>
        <ResponsiveContainer height="100%" width="100%">
          {chart}
        </ResponsiveContainer>
      </div>
      {data.series.some((series) => series.axis === 'right') ? (
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
