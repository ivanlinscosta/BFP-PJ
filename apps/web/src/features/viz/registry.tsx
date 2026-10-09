import {
  CalendarDays,
  ChartArea,
  ChartBar,
  ChartBarBig,
  ChartBarStacked,
  ChartCandlestick,
  ChartColumn,
  ChartColumnBig,
  ChartColumnStacked,
  ChartLine,
  ChartNoAxesColumn,
  ChartNoAxesGantt,
  ChartPie,
  ChartScatter,
  ChartSpline,
  Circle,
  Funnel,
  Grid2x2,
  Grid3x3,
  Hash,
  Layers,
  LayoutGrid,
  ListOrdered,
  Map as MapIcon,
  Radar,
  SquareSplitHorizontal,
  Table2,
  TrendingDown,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { VisualizationSettings } from '@bfp/domain';
import { VISUALIZATION_META, type ChartType, type VisualizationMeta } from '@bfp/shared';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { AnalyticsBarChart } from './bar-chart';
import { FunnelChart, SankeyChart, TreemapChart, WaterfallChart } from './composition-charts';
import { AnalyticsKpis, AnalyticsTable } from './data-table';
import { AnalyticsHeatmap, HeatmapLegend, toHeatmapMatrix } from './heatmap';
import { dimensionColumns, metricColumns } from './model';
import {
  BoxPlotChart,
  HistogramChart,
  RadarProfile,
  RankingList,
  RelationChart,
} from './relation-charts';
import { SeriesChart } from './series-chart';
import {
  BrazilMap,
  CalendarHeatmap,
  CohortChart,
  RetentionChart,
  TimelineChart,
} from './time-geo-charts';

/** What a renderer receives: the governed result, the persisted settings and catalog context. */
export interface RendererProps {
  result: AnalyticsResponse;
  settings: VisualizationSettings;
  totalsResult?: AnalyticsResponse;
  /** Funnel stage of a metric (from the semantic catalog). */
  stageOf(metricId: string): number | undefined;
}

/** Options of the "Visualização" panel; each chart lists the ones it reads. */
export type SettingKey = Exclude<keyof VisualizationSettings, 'orientation' | 'stacking'>;

export interface VisualizationDefinition extends VisualizationMeta {
  icon: LucideIcon;
  /** Settings of the side panel that apply to this chart. */
  settings: SettingKey[];
  render(props: RendererProps): ReactNode;
}

const BAR_SETTINGS: SettingKey[] = ['sort', 'topN', 'showValues', 'showLegend', 'showGrid'];
const SERIES_SETTINGS: SettingKey[] = ['topN', 'showValues', 'showLegend', 'showGrid'];
const STACK_SETTINGS: SettingKey[] = ['topN', 'showLegend', 'showGrid'];
const LINE_SETTINGS: SettingKey[] = [
  'showPoints',
  'smooth',
  'showValues',
  'showLegend',
  'showGrid',
];
const AREA_SETTINGS: SettingKey[] = ['smooth', 'showLegend', 'showGrid'];

/** Keeps the N largest rows of the first metric (readable charts with many categories). */
function topRows(result: AnalyticsResponse, topN?: number) {
  const metric = metricColumns(result)[0];
  if (!topN || !metric || result.rows.length <= topN || dimensionColumns(result).length !== 1) {
    return result;
  }
  const rows = [...result.rows]
    .sort(
      (left, right) =>
        (typeof right[metric.key] === 'number' ? (right[metric.key] as number) : 0) -
        (typeof left[metric.key] === 'number' ? (left[metric.key] as number) : 0),
    )
    .slice(0, topN);
  return { ...result, rows };
}

const series =
  (
    kind: 'bar' | 'line' | 'area' | 'donut',
    orientation: 'HORIZONTAL' | 'VERTICAL' = 'VERTICAL',
    stacking: 'NONE' | 'STACKED' | 'PERCENT' = 'NONE',
  ) =>
  ({ result, settings }: RendererProps) => (
    <SeriesChart
      innerRadius={settings.innerRadius}
      kind={kind}
      orientation={orientation}
      result={result}
      showGrid={settings.showGrid ?? true}
      showLegend={settings.showLegend ?? true}
      showPercent={settings.showPercent ?? true}
      showPoints={settings.showPoints ?? true}
      showValues={settings.showValues ?? false}
      smooth={settings.smooth ?? true}
      stacking={stacking}
      topN={settings.topN}
    />
  );

const RENDERING: Record<ChartType, Omit<VisualizationDefinition, keyof VisualizationMeta>> = {
  KPI: { icon: Hash, settings: [], render: ({ result }) => <AnalyticsKpis result={result} /> },
  TABLE: {
    icon: Table2,
    settings: ['conditional'],
    render: ({ result, settings }) => (
      <AnalyticsTable conditional={settings.conditional ?? true} pageSize={25} result={result} />
    ),
  },
  BAR_HORIZONTAL: {
    icon: ChartBar,
    settings: BAR_SETTINGS,
    render: (props) =>
      metricColumns(props.result).length === 1 && dimensionColumns(props.result).length === 1 ? (
        <AnalyticsBarChart
          maxBars={props.settings.topN ?? 15}
          result={props.result}
          showValues={props.settings.showValues ?? true}
          sort={props.settings.sort === 'NONE' ? 'DESC' : (props.settings.sort ?? 'DESC')}
        />
      ) : (
        series('bar', 'HORIZONTAL')(props)
      ),
  },
  COLUMN: { icon: ChartColumn, settings: SERIES_SETTINGS, render: series('bar') },
  BAR_GROUPED: {
    icon: ChartBarBig,
    settings: SERIES_SETTINGS,
    render: series('bar', 'HORIZONTAL'),
  },
  COLUMN_GROUPED: { icon: ChartColumnBig, settings: SERIES_SETTINGS, render: series('bar') },
  BAR_STACKED: {
    icon: ChartBarStacked,
    settings: STACK_SETTINGS,
    render: series('bar', 'HORIZONTAL', 'STACKED'),
  },
  COLUMN_STACKED: {
    icon: ChartColumnStacked,
    settings: STACK_SETTINGS,
    render: series('bar', 'VERTICAL', 'STACKED'),
  },
  BAR_100_STACKED: {
    icon: ChartBarStacked,
    settings: STACK_SETTINGS,
    render: series('bar', 'HORIZONTAL', 'PERCENT'),
  },
  COLUMN_100_STACKED: {
    icon: ChartColumnStacked,
    settings: STACK_SETTINGS,
    render: series('bar', 'VERTICAL', 'PERCENT'),
  },
  DONUT: {
    icon: ChartPie,
    settings: ['showPercent', 'showLegend', 'innerRadius'],
    render: series('donut'),
  },
  TREEMAP: {
    icon: LayoutGrid,
    settings: ['topN'],
    render: ({ result, settings }) => <TreemapChart result={result} topN={settings.topN} />,
  },
  LINE: { icon: ChartLine, settings: LINE_SETTINGS, render: series('line') },
  MULTI_LINE: { icon: ChartSpline, settings: LINE_SETTINGS, render: series('line') },
  AREA: { icon: ChartArea, settings: AREA_SETTINGS, render: series('area') },
  AREA_STACKED: {
    icon: Layers,
    settings: AREA_SETTINGS,
    render: series('area', 'VERTICAL', 'STACKED'),
  },
  HISTOGRAM: {
    icon: ChartNoAxesColumn,
    settings: ['bins'],
    render: ({ result, settings }) => <HistogramChart bins={settings.bins} result={result} />,
  },
  BOX_PLOT: {
    icon: SquareSplitHorizontal,
    settings: [],
    render: ({ result }) => <BoxPlotChart result={result} />,
  },
  SCATTER: {
    icon: ChartScatter,
    settings: ['xAxis', 'yAxis', 'showValues', 'trendLine'],
    render: ({ result, settings }) => (
      <RelationChart
        result={result}
        showLabels={settings.showValues ?? true}
        trendLine={settings.trendLine}
        variant="SCATTER"
        xKey={settings.xAxis}
        yKey={settings.yAxis}
      />
    ),
  },
  BUBBLE: {
    icon: Circle,
    settings: ['xAxis', 'yAxis', 'size', 'showValues'],
    render: ({ result, settings }) => (
      <RelationChart
        result={result}
        showLabels={settings.showValues ?? true}
        sizeKey={settings.size}
        variant="BUBBLE"
        xKey={settings.xAxis}
        yKey={settings.yAxis}
      />
    ),
  },
  QUADRANT: {
    icon: Grid2x2,
    settings: ['xAxis', 'yAxis', 'showValues'],
    render: ({ result, settings }) => (
      <RelationChart
        result={result}
        showLabels={settings.showValues ?? true}
        variant="QUADRANT"
        xKey={settings.xAxis}
        yKey={settings.yAxis}
      />
    ),
  },
  FUNNEL: {
    icon: Funnel,
    settings: [],
    render: ({ result, stageOf }) => <FunnelChart result={result} stageOf={stageOf} />,
  },
  SANKEY: {
    icon: Waypoints,
    settings: [],
    render: ({ result }) => <SankeyChart result={result} />,
  },
  TIMELINE: {
    icon: ChartNoAxesGantt,
    settings: [],
    render: ({ result }) => <TimelineChart result={result} />,
  },
  HEATMAP: {
    icon: Grid3x3,
    settings: [],
    render: ({ result, totalsResult }) => {
      const matrix = toHeatmapMatrix(result, totalsResult);
      return matrix ? (
        <>
          <AnalyticsHeatmap
            columns={matrix.columns}
            format={matrix.format}
            rowHeader={matrix.rowHeader}
            rows={matrix.rows}
            totals={matrix.totals}
            values={matrix.values}
          />
          <div className="mt-2">
            <HeatmapLegend />
          </div>
        </>
      ) : null;
    },
  },
  COHORT: { icon: Grid3x3, settings: [], render: ({ result }) => <CohortChart result={result} /> },
  RETENTION_CURVE: {
    icon: TrendingDown,
    settings: [],
    render: ({ result }) => <RetentionChart result={result} />,
  },
  RADAR: {
    icon: Radar,
    settings: ['showLegend'],
    render: ({ result, settings }) => (
      <RadarProfile result={result} showLegend={settings.showLegend ?? true} />
    ),
  },
  MAP: { icon: MapIcon, settings: [], render: ({ result }) => <BrazilMap result={result} /> },
  CALENDAR_HEATMAP: {
    icon: CalendarDays,
    settings: [],
    render: ({ result }) => <CalendarHeatmap result={result} />,
  },
  WATERFALL: {
    icon: ChartCandlestick,
    settings: ['topN'],
    render: ({ result, settings }) => <WaterfallChart result={result} topN={settings.topN} />,
  },
  RANKING: {
    icon: ListOrdered,
    settings: ['topN', 'sort'],
    render: ({ result, settings }) => (
      <RankingList result={result} sort={settings.sort} topN={settings.topN ?? 10} />
    ),
  },
};

/**
 * VisualizationRegistry: single source of each chart's name, description, category,
 * requirement (from @bfp/shared), icon, settings and renderer. Pages never switch on chart types.
 */
export const VISUALIZATION_REGISTRY = new Map<ChartType, VisualizationDefinition>(
  VISUALIZATION_META.map((meta) => [meta.type, { ...meta, ...RENDERING[meta.type] }]),
);

export function resolveDefinition(type: ChartType): VisualizationDefinition {
  return VISUALIZATION_REGISTRY.get(type) ?? VISUALIZATION_REGISTRY.get('TABLE')!;
}

export { topRows };
