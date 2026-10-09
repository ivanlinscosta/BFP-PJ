import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { formatMetricValue } from '@/lib/format';
import { AnalyticsHeatmap } from './heatmap';
import { dimensionColumns, labelOf, metricColumns, numeric } from './model';
import { ChartTooltip } from './tooltip';
import { cohortMatrix, dailyValues, retentionCurve } from './transforms';

const axisTick = { fill: 'var(--color-ink-faint)', fontSize: 11 };

/** Color between the scale tokens (0 = low, 1 = high), without hex codes in the charts. */
function scaleColor(ratio: number) {
  const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `color-mix(in srgb, var(--color-chart-scale-high) ${percent}%, var(--color-chart-scale-low))`;
}

function ScaleLegend({ low, high }: { low: string; high: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
      <span className="tabular-nums">{low}</span>
      <span
        aria-hidden
        className="h-2 w-32 rounded-full"
        style={{
          background:
            'linear-gradient(90deg, var(--color-chart-scale-low), var(--color-chart-scale-high))',
        }}
      />
      <span className="tabular-nums">{high}</span>
    </div>
  );
}

/** Tile position of each UF in a geographic grid of Brazil (cartogram, no external map data). */
const UF_TILES: Record<string, [number, number]> = {
  RR: [2, 0],
  AP: [4, 0],
  AM: [1, 1],
  PA: [3, 1],
  MA: [4, 1],
  CE: [5, 1],
  RN: [6, 1],
  AC: [0, 2],
  RO: [1, 2],
  MT: [2, 2],
  TO: [3, 2],
  PI: [4, 2],
  PE: [5, 2],
  PB: [6, 2],
  MS: [2, 3],
  GO: [3, 3],
  DF: [4, 3],
  BA: [5, 3],
  AL: [6, 3],
  SP: [3, 4],
  MG: [4, 4],
  ES: [5, 4],
  SE: [6, 4],
  PR: [3, 5],
  RJ: [4, 5],
  SC: [3, 6],
  RS: [3, 7],
};

const REGION_OF_UF: Record<string, string> = {
  AC: 'Norte',
  AM: 'Norte',
  AP: 'Norte',
  PA: 'Norte',
  RO: 'Norte',
  RR: 'Norte',
  TO: 'Norte',
  AL: 'Nordeste',
  BA: 'Nordeste',
  CE: 'Nordeste',
  MA: 'Nordeste',
  PB: 'Nordeste',
  PE: 'Nordeste',
  PI: 'Nordeste',
  RN: 'Nordeste',
  SE: 'Nordeste',
  DF: 'Centro-Oeste',
  GO: 'Centro-Oeste',
  MS: 'Centro-Oeste',
  MT: 'Centro-Oeste',
  ES: 'Sudeste',
  MG: 'Sudeste',
  RJ: 'Sudeste',
  SP: 'Sudeste',
  PR: 'Sul',
  RS: 'Sul',
  SC: 'Sul',
};

/**
 * Map of Brazil by UF (tile cartogram): each state is a tile in its geographic position, colored
 * by the metric. With Região, every UF takes the value of its region.
 */
export function BrazilMap({ result }: { result: AnalyticsResponse }) {
  const [dimension] = dimensionColumns(result);
  const metric = metricColumns(result)[0];
  if (!dimension || !metric) return null;
  const byKey = new Map<string, number>();
  for (const row of result.rows) {
    const value = numeric(row[metric.key]);
    if (value !== null) byKey.set(String(row[dimension.key] ?? '').toUpperCase(), value);
  }
  const regional = [...byKey.keys()].some((key) =>
    ['NORTE', 'NORDESTE', 'SUDESTE', 'SUL', 'CENTRO-OESTE'].includes(key),
  );
  const valueOf = (uf: string) =>
    regional ? byKey.get(REGION_OF_UF[uf]!.toUpperCase()) : byKey.get(uf);
  const values = Object.keys(UF_TILES)
    .map(valueOf)
    .filter((value): value is number => value !== undefined);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const show = (value: number | undefined) =>
    value === undefined ? 'sem dados' : formatMetricValue(value, metric.format, { compact: true });
  const ranked = [...byKey.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5);
  return (
    <figure
      aria-label={`Mapa do Brasil: ${metric.label} por ${regional ? 'região' : 'estado'}`}
      className="m-0 grid gap-6 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
    >
      <div>
        <div
          className="grid gap-1"
          role="list"
          style={{
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(8, 44px)',
          }}
        >
          {Object.entries(UF_TILES).map(([uf, [column, row]]) => {
            const value = valueOf(uf);
            const ratio = value === undefined || max === min ? 0.5 : (value - min) / (max - min);
            return (
              <div
                className="flex flex-col items-center justify-center rounded-[var(--radius-control)] text-center"
                key={uf}
                role="listitem"
                style={{
                  gridColumn: column + 1,
                  gridRow: row + 1,
                  background: value === undefined ? 'var(--color-muted)' : scaleColor(ratio),
                  color: ratio > 0.6 ? 'var(--color-card)' : 'var(--color-ink)',
                }}
                title={`${uf}${regional ? ` (${REGION_OF_UF[uf]})` : ''}: ${show(value)}`}
              >
                <span className="text-[12px] leading-none font-bold">{uf}</span>
                <span className="mt-0.5 text-[10px] leading-none tabular-nums">{show(value)}</span>
              </div>
            );
          })}
        </div>
        <ScaleLegend high={show(max)} low={show(min)} />
      </div>
      <div>
        <p className="m-0 text-xs font-semibold text-ink-soft">
          Maiores valores · {regional ? 'regiões' : 'estados'}
        </p>
        <ol className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[13px]">
          {ranked.map(([key, value]) => (
            <li className="flex justify-between gap-3" key={key}>
              <span>{labelOf(result, dimension.key, key)}</span>
              <span className="font-semibold text-brand-navy tabular-nums">{show(value)}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-3 text-[11px] text-ink-soft">
          Mapa em formato de grade: cada quadrado é um estado na sua posição geográfica.
        </p>
      </div>
    </figure>
  );
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Calendar heatmap: one cell per day (weeks in columns), colored by the metric. */
export function CalendarHeatmap({ result }: { result: AnalyticsResponse }) {
  const { days, metric } = dailyValues(result);
  if (!metric || days.size === 0) return null;
  const keys = [...days.keys()].sort();
  const start = new Date(`${keys[0]}T00:00:00Z`);
  const end = new Date(`${keys.at(-1)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const weeks: Array<Array<{ key: string; value: number | undefined }>> = [];
  for (let cursor = new Date(start); cursor <= end;) {
    const week: Array<{ key: string; value: number | undefined }> = [];
    for (let day = 0; day < 7; day += 1) {
      const key = cursor.toISOString().slice(0, 10);
      week.push({ key, value: days.get(key) });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  const values = [...days.values()].sort((left, right) => left - right);
  const min = values[0] ?? 0;
  // The scale tops at the 95th percentile so a single outlier day does not wash out the rest.
  const max = values[Math.floor((values.length - 1) * 0.95)] ?? min;
  const show = (value: number) => formatMetricValue(value, metric.format, { compact: true });
  return (
    <figure aria-label={`Calendário de ${metric.label}`} className="m-0 overflow-x-auto">
      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] pr-1 text-[10px] text-ink-faint">
          {WEEKDAYS.map((day) => (
            <span className="h-3 leading-3" key={day}>
              {day}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div className="flex flex-col gap-[3px]" key={week[0]!.key}>
            {week.map((day) => (
              <span
                className="h-3 w-3 rounded-[2px]"
                key={day.key}
                style={{
                  background:
                    day.value === undefined
                      ? 'var(--color-muted)'
                      : scaleColor(max === min ? 0.5 : (day.value - min) / (max - min)),
                }}
                title={`${day.key.split('-').reverse().join('/')}: ${day.value === undefined ? 'sem dados' : show(day.value)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <ScaleLegend high={show(max)} low={show(min)} />
    </figure>
  );
}

/** Cohort: start month × months elapsed until the event, as share of each cohort. */
export function CohortChart({ result }: { result: AnalyticsResponse }) {
  const matrix = cohortMatrix(result);
  const [start] = dimensionColumns(result);
  if (!matrix || matrix.cohorts.length === 0 || !start) return null;
  return (
    <figure aria-label="Análise de cohort" className="m-0">
      <AnalyticsHeatmap
        columns={matrix.periods.map((period) => `M${period}`)}
        format="percent"
        rowHeader={`${start.label} (coorte)`}
        rows={matrix.cohorts.map((cohort) => `${cohort.label} · ${cohort.total}`)}
        values={matrix.cohorts.map((cohort) =>
          cohort.cells.map((value) =>
            value === null || !cohort.total ? null : value / cohort.total,
          ),
        )}
      />
      <p className="m-0 mt-2 text-[11px] text-ink-soft">
        Cada linha é uma coorte (mês de início · tamanho); M0, M1… são os meses decorridos até o
        evento, em % da coorte.
      </p>
    </figure>
  );
}

/** Retention curve: cumulative share of the cohorts that reached the event by month M. */
export function RetentionChart({ result }: { result: AnalyticsResponse }) {
  const matrix = cohortMatrix(result);
  if (!matrix || matrix.cohorts.length === 0) return null;
  const data = retentionCurve(matrix);
  return (
    <figure aria-label="Curva de retenção" className="m-0">
      <div style={{ height: 300 }}>
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} />
            <YAxis
              axisLine={false}
              domain={[0, 1]}
              tick={axisTick}
              tickFormatter={(value) => formatMetricValue(value, 'percent')}
              tickLine={false}
              width={56}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  formatOf={() => 'percent'}
                  label={props.label}
                  payload={(props.payload ?? []).map((entry) => ({
                    ...entry,
                    name: 'Acumulado da coorte',
                  }))}
                />
              )}
            />
            <Line
              dataKey="share"
              dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-chart-1)' }}
              isAnimationActive={false}
              stroke="var(--color-chart-1)"
              strokeWidth={2.25}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Timeline: events of each type over time (one lane per type, dot size by the metric). */
export function TimelineChart({ result }: { result: AnalyticsResponse }) {
  const dimensions = dimensionColumns(result);
  const time = dimensions.find((column) => column.role === 'time') ?? dimensions[0];
  const lane = dimensions.find((column) => column !== time);
  const metric = metricColumns(result)[0];
  if (!time || !lane || !metric) return null;
  const events = result.rows
    .map((row) => ({
      date: String(row[time.key] ?? ''),
      lane: labelOf(result, lane.key, row[lane.key]),
      value: numeric(row[metric.key]) ?? 0,
    }))
    .filter((event) => /^\d{4}-\d{2}/.test(event.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (events.length === 0) return null;
  const first = Date.parse(
    events[0]!.date.length === 7 ? `${events[0]!.date}-01` : events[0]!.date,
  );
  const last = Date.parse(
    events.at(-1)!.date.length === 7 ? `${events.at(-1)!.date}-01` : events.at(-1)!.date,
  );
  const position = (date: string) => {
    const at = Date.parse(date.length === 7 ? `${date}-01` : date);
    return last === first ? 50 : ((at - first) / (last - first)) * 100;
  };
  const max = Math.max(...events.map((event) => event.value), 1);
  const lanes = [...new Set(events.map((event) => event.lane))];
  return (
    <figure aria-label={`Linha do tempo por ${lane.label}`} className="m-0">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {lanes.map((name) => (
          <li className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3" key={name}>
            <span className="truncate text-[13px] text-ink">{name}</span>
            <div className="relative h-6 rounded-full bg-muted">
              {events
                .filter((event) => event.lane === name)
                .map((event, index) => (
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-orange"
                    key={index}
                    style={{
                      left: `${position(event.date)}%`,
                      width: 4 + (event.value / max) * 8,
                      height: 4 + (event.value / max) * 8,
                      opacity: 0.55,
                    }}
                    title={`${event.date}: ${formatMetricValue(event.value, metric.format)}`}
                  />
                ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 flex justify-between pl-[152px] text-[11px] text-ink-faint">
        <span>{events[0]!.date}</span>
        <span>{events.at(-1)!.date}</span>
      </p>
    </figure>
  );
}
