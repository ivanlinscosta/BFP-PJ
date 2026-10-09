import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Layer,
  Rectangle,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { formatMetricValue } from '@/lib/format';
import { dimensionColumns, labelOf, metricColumns, numeric } from './model';
import { ChartTooltip } from './tooltip';
import { contributions, flows, funnelStages } from './transforms';

const axisTick = { fill: 'var(--color-ink-faint)', fontSize: 11 };

/** Treemap: area of each category proportional to an additive metric (optional 2nd level). */
export function TreemapChart({ result, topN = 30 }: { result: AnalyticsResponse; topN?: number }) {
  const [first, second] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!first || !metric) return null;
  const groups = new Map<string, { name: string; size: number; children: Map<string, number> }>();
  for (const row of result.rows) {
    const value = numeric(row[metric.key]) ?? 0;
    if (value <= 0) continue;
    const key = String(row[first.key] ?? '');
    const group = groups.get(key) ?? {
      name: labelOf(result, first.key, key),
      size: 0,
      children: new Map<string, number>(),
    };
    group.size += value;
    if (second) {
      const child = labelOf(result, second.key, row[second.key]);
      group.children.set(child, (group.children.get(child) ?? 0) + value);
    }
    groups.set(key, group);
  }
  const data = [...groups.values()]
    .sort((left, right) => right.size - left.size)
    .slice(0, topN)
    .map((group) => ({
      name: group.name,
      size: group.size,
      children: second
        ? [...group.children.entries()].map(([name, size]) => ({
            name: `${group.name} · ${name}`,
            size,
          }))
        : undefined,
    }));
  const total = data.reduce((sum, item) => sum + item.size, 0) || 1;
  const largest = Math.max(...data.map((item) => item.size), 1);
  return (
    <figure aria-label={`Treemap de ${metric.label} por ${first.label}`} className="m-0">
      <div style={{ height: 340 }}>
        <ResponsiveContainer height="100%" width="100%">
          <Treemap
            aspectRatio={4 / 3}
            content={(props: Record<string, unknown>) => {
              const { x, y, width, height, name, size, depth } = props as {
                x: number;
                y: number;
                width: number;
                height: number;
                name: string;
                size: number;
                depth: number;
              };
              if (depth === 0) return <g />;
              const leaf = second ? depth === 2 : depth === 1;
              // One institutional hue: the bigger the share, the stronger the orange.
              const ratio = 0.25 + 0.75 * (size / largest);
              const strong = ratio > 0.55;
              return (
                <g>
                  <rect
                    fill={`color-mix(in srgb, var(--color-chart-scale-high) ${Math.round(ratio * 100)}%, var(--color-chart-scale-low))`}
                    fillOpacity={leaf ? 1 : 0}
                    height={height}
                    stroke="var(--color-card)"
                    strokeWidth={leaf ? 2 : 3}
                    width={width}
                    x={x}
                    y={y}
                  />
                  {leaf && width > 70 && height > 34 ? (
                    <>
                      <text
                        fill={strong ? 'var(--color-card)' : 'var(--color-ink)'}
                        fontSize={12}
                        fontWeight={600}
                        x={x + 8}
                        y={y + 18}
                      >
                        {String(name)
                          .split(' · ')
                          .at(-1)!
                          .slice(0, Math.floor(width / 7))}
                      </text>
                      <text
                        fill={strong ? 'var(--color-card)' : 'var(--color-ink-soft)'}
                        fontSize={11}
                        x={x + 8}
                        y={y + 33}
                      >
                        {formatMetricValue(size, metric.format, { compact: true })} ·{' '}
                        {formatMetricValue(size / total, 'percent')}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            }}
            data={data}
            dataKey="size"
            isAnimationActive={false}
            nameKey="name"
          >
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => metric.format}
                  payload={(props.payload ?? []).map((entry) => ({
                    ...entry,
                    name: String((entry.payload as { name?: string } | undefined)?.name ?? ''),
                    color: 'var(--color-chart-1)',
                  }))}
                />
              )}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Funnel: ordered stages with the conversion from the previous stage and from the first. */
export function FunnelChart({
  result,
  stageOf,
}: {
  result: AnalyticsResponse;
  stageOf: (metricId: string) => number | undefined;
}) {
  const stages = funnelStages(result, stageOf);
  const first = stages[0]?.value || 1;
  return (
    <figure aria-label="Funil da jornada" className="m-0">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {stages.map((stage, index) => (
          <li
            className="grid grid-cols-[150px_minmax(0,1fr)_72px_130px] items-center gap-3"
            key={stage.key}
          >
            <span className="truncate text-[13px] font-semibold text-ink" title={stage.label}>
              {stage.label}
            </span>
            <div className="flex justify-center">
              <div
                aria-hidden
                className="h-9 rounded-[var(--radius-control)]"
                style={{
                  width: `${Math.max(2, (stage.value / first) * 100)}%`,
                  background: 'var(--color-chart-1)',
                  opacity: 1 - index * (0.5 / Math.max(1, stages.length - 1)),
                }}
              />
            </div>
            <span className="text-right text-[13px] font-semibold text-brand-navy tabular-nums">
              {formatMetricValue(stage.value, 'number', { compact: true })}
            </span>
            <span className="text-right text-xs text-ink-soft tabular-nums">
              {stage.fromPrevious !== null
                ? `${formatMetricValue(stage.fromPrevious, 'percent')} da etapa anterior`
                : 'Topo do funil'}
            </span>
          </li>
        ))}
      </ol>
      {stages.length > 1 ? (
        <p className="m-0 mt-3 text-[11px] text-ink-soft">
          Conversão total: {formatMetricValue(stages.at(-1)!.fromFirst, 'percent')} de{' '}
          {stages[0]!.label.toLowerCase()} até {stages.at(-1)!.label.toLowerCase()}.
        </p>
      ) : null}
    </figure>
  );
}

/** Sankey: flows from an origin dimension to a destination dimension (width = metric). */
export function SankeyChart({ result }: { result: AnalyticsResponse }) {
  const flow = flows(result);
  if (!flow || flow.links.length === 0) return null;
  const { nodes, links, metric } = flow;
  return (
    <figure aria-label={`Fluxos de ${metric.label}`} className="m-0">
      <div style={{ height: Math.max(320, nodes.length * 26) }}>
        <ResponsiveContainer height="100%" width="100%">
          <Sankey
            data={{ nodes, links }}
            link={{ stroke: 'var(--color-chart-5)', strokeOpacity: 0.25 }}
            margin={{ top: 10, right: 220, bottom: 10, left: 10 }}
            node={
              ((props: Record<string, unknown>) => {
                const { x, y, width, height, index, payload } = props as {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  index: number;
                  payload: { name: string; value: number; side: string };
                };
                const isSource = payload.side === 'source';
                return (
                  <Layer key={`node-${index}`}>
                    <Rectangle
                      fill={isSource ? 'var(--color-chart-1)' : 'var(--color-chart-2)'}
                      fillOpacity={0.9}
                      height={height}
                      width={width}
                      x={x}
                      y={y}
                    />
                    <text
                      fill="var(--color-ink)"
                      fontSize={11}
                      textAnchor="start"
                      x={x + width + 6}
                      y={y + height / 2 + 4}
                    >
                      {payload.name.length > 26 ? `${payload.name.slice(0, 25)}…` : payload.name} ·{' '}
                      {formatMetricValue(payload.value, metric.format, { compact: true })}
                    </text>
                  </Layer>
                );
              }) as never
            }
            nodePadding={14}
          >
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => metric.format}
                  payload={(props.payload ?? []).map((entry) => ({
                    ...entry,
                    color: 'var(--color-chart-1)',
                  }))}
                />
              )}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-1 text-[11px] text-ink-soft">
        À esquerda, a origem; à direita, o destino. A largura de cada fluxo é proporcional a{' '}
        {metric.label.toLowerCase()}.
      </p>
    </figure>
  );
}

/** Waterfall: contribution of each category to the total (largest first). */
export function WaterfallChart({
  result,
  topN = 12,
}: {
  result: AnalyticsResponse;
  topN?: number;
}) {
  const metric = metricColumns(result)[0];
  const steps = contributions(result, topN);
  if (!metric || steps.length === 0) return null;
  const data = steps.map((step) => ({
    label: step.label,
    base: Math.min(step.start, step.end),
    value: Math.abs(step.value),
    raw: step.value,
    kind: step.kind,
  }));
  return (
    <figure aria-label={`Cascata de ${metric.label}`} className="m-0">
      <div style={{ height: 320 }}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              angle={data.length > 5 ? -30 : 0}
              dataKey="label"
              height={data.length > 5 ? 64 : 30}
              interval={0}
              textAnchor={data.length > 5 ? 'end' : 'middle'}
              tick={axisTick}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={axisTick}
              tickFormatter={(value) => formatMetricValue(value, metric.format, { compact: true })}
              tickLine={false}
              width={68}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => metric.format}
                  label={props.label}
                  payload={(props.payload ?? [])
                    .filter((entry) => entry.dataKey === 'value')
                    .map((entry) => ({
                      ...entry,
                      name: metric.label,
                      value: (entry.payload as { raw: number }).raw,
                    }))}
                />
              )}
              cursor={{ fill: 'var(--color-muted)' }}
            />
            <Bar dataKey="base" fill="transparent" isAnimationActive={false} stackId="w" />
            <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]} stackId="w">
              {data.map((item) => (
                <Cell
                  fill={
                    item.kind === 'total'
                      ? 'var(--color-chart-2)'
                      : item.raw >= 0
                        ? 'var(--color-chart-1)'
                        : 'var(--color-chart-negative)'
                  }
                  key={item.label}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
