import type { AnalysisSpec, DimensionSelection, MetricSelection } from '@bfp/domain';
import { buildAnalysisShape, checkVisualizationCompatibility, type ChartType } from '@bfp/shared';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';
import { requiredDatasetsFor, resolveMonthDimension } from '@/features/explorer/spec';

/** An adjustment of the analysis that makes a chart usable, and what it changes in words. */
export interface VisualizationFix {
  label: string;
  spec: AnalysisSpec;
}

interface Catalog {
  metrics: CatalogMetric[];
  dimensions: CatalogDimension[];
}

/** Journey stages available in Customer 360 (top to bottom of the funnel). */
const FUNNEL_STAGES = ['leads', 'accounts_opened', 'onboarding_completed', 'activation_d30'];
const DNA_SCORES = [
  'dna_relationship_strength_score',
  'dna_digital_engagement_score',
  'dna_product_depth_score',
  'dna_transaction_activity_score',
  'dna_business_momentum_score',
  'dna_commercial_intent_score',
];
/** Categorical breakdowns tried in order when a chart needs one. */
const CATEGORIES = [
  'acquisition_channel',
  'company_size',
  'segment',
  'region',
  'transaction_type',
  'product',
  'app_screen',
  'nps_touchpoint',
  'conversation_channel',
  'crm_outcome',
  'product_category',
  'state',
];
/** Breakdowns with many values (distributions). */
const MANY_VALUES = ['acquisition_campaign', 'industry', 'state', 'segment'];
/** Metrics that pair well on two axes (different units). */
const COMPANIONS = [
  'account_conversion_rate',
  'cac',
  'accounts_opened',
  'activation_d30_rate',
  'transaction_volume',
  'average_ticket',
  'nps',
  'new_companies',
];

function allows(metric: CatalogMetric | undefined, dimensionId: string) {
  return (
    !!metric && (metric.allowedDimensions === '*' || metric.allowedDimensions.includes(dimensionId))
  );
}

/**
 * Builds the closest analysis that a chart can draw (e.g. Funil → the journey stages; Mapa →
 * adds Estado; Linha → adds Mês). Returns null when no sensible adjustment exists or when the
 * adjusted analysis would still not fit the chart.
 */
export function buildVisualizationFix(
  type: ChartType,
  spec: AnalysisSpec,
  catalog: Catalog,
): VisualizationFix | null {
  const direct = adjust(type, spec, catalog);
  if (direct || spec.metrics.some((metric) => metric.id === FALLBACK_METRIC)) {
    return direct && { label: describeChange(spec, direct, catalog), spec: direct };
  }
  // The metric itself cannot feed the chart (e.g. a score in a donut): use a countable one.
  const fallback = adjust(type, { ...spec, metrics: [{ id: FALLBACK_METRIC }] }, catalog);
  return fallback && { label: describeChange(spec, fallback, catalog), spec: fallback };
}

/** Countable metric used when the selected one cannot draw the chart. */
const FALLBACK_METRIC = 'accounts_opened';

function adjust(type: ChartType, spec: AnalysisSpec, catalog: Catalog): AnalysisSpec | null {
  const metricById = (id: string) => catalog.metrics.find((metric) => metric.id === id);
  const dimensionById = (id: string) => catalog.dimensions.find((item) => item.id === id);
  const metrics = spec.metrics
    .map((item) => metricById(item.id))
    .filter(Boolean) as CatalogMetric[];
  const first = metrics[0];
  // Rates are not additive; their numerator is (Conversão → Contas abertas).
  const additive = (metric: CatalogMetric | undefined) => {
    if (!metric) return undefined;
    if (metric.additivity === 'ADDITIVE') return metric;
    // The formula's numerator, when it is a catalog metric ("converted_leads / leads").
    const numerator = metric.formula.split('/')[0]?.trim();
    const candidate = numerator ? metricById(numerator) : undefined;
    return candidate?.additivity === 'ADDITIVE' ? candidate : undefined;
  };
  const categoricalFor = (
    chosen: CatalogMetric[],
    exclude: string[] = [],
    order: string[] = CATEGORIES,
  ) => {
    const current = spec.dimensions.find(
      (dimension) =>
        !dimension.granularity &&
        !exclude.includes(dimension.id) &&
        dimensionById(dimension.id)?.type !== 'date' &&
        chosen.every((metric) => allows(metric, dimension.id)),
    );
    if (current && order === CATEGORIES) return current.id;
    return order.find(
      (id) =>
        !exclude.includes(id) && dimensionById(id) && chosen.every((metric) => allows(metric, id)),
    );
  };
  const month = (chosen: CatalogMetric[]) => resolveMonthDimension(chosen, catalog.dimensions);

  let nextMetrics: MetricSelection[] | null = null;
  let nextDimensions: DimensionSelection[] | null = null;
  const one = first ? [first] : [];

  switch (type) {
    case 'KPI':
      nextDimensions = [];
      break;
    case 'BAR_HORIZONTAL':
    case 'COLUMN':
    case 'RANKING': {
      const dimension = categoricalFor(one);
      if (!dimension || !first) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [{ id: dimension }];
      break;
    }
    case 'DONUT':
    case 'TREEMAP':
    case 'WATERFALL': {
      const metric = additive(first);
      const dimension = metric ? categoricalFor([metric]) : undefined;
      if (!metric || !dimension) return null;
      nextMetrics = [{ id: metric.id }];
      nextDimensions = [{ id: dimension }];
      break;
    }
    case 'HISTOGRAM': {
      const dimension = first ? categoricalFor(one, [], MANY_VALUES) : undefined;
      if (!first || !dimension) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [{ id: dimension }];
      break;
    }
    case 'BAR_GROUPED':
    case 'COLUMN_GROUPED':
    case 'HEATMAP': {
      const firstDimension = categoricalFor(one);
      const second = firstDimension ? categoricalFor(one, [firstDimension]) : undefined;
      if (!first || !firstDimension || !second) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [{ id: firstDimension }, { id: second }];
      break;
    }
    case 'BAR_STACKED':
    case 'COLUMN_STACKED':
    case 'BAR_100_STACKED':
    case 'COLUMN_100_STACKED': {
      const metric = additive(first);
      const firstDimension = metric ? categoricalFor([metric]) : undefined;
      const second =
        metric && firstDimension ? categoricalFor([metric], [firstDimension]) : undefined;
      if (!metric || !firstDimension || !second) return null;
      nextMetrics = [{ id: metric.id }];
      nextDimensions = [{ id: firstDimension }, { id: second }];
      break;
    }
    case 'LINE':
    case 'AREA': {
      const time = month(one);
      if (!first || !time) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [time];
      break;
    }
    case 'MULTI_LINE':
    case 'AREA_STACKED': {
      const metric = type === 'AREA_STACKED' ? additive(first) : first;
      const time = metric ? month([metric]) : null;
      const dimension = metric ? categoricalFor([metric]) : undefined;
      if (!metric || !time || !dimension) return null;
      nextMetrics = [{ id: metric.id }];
      nextDimensions = [time, { id: dimension }];
      break;
    }
    case 'BOX_PLOT': {
      const group = categoricalFor(one, [], ['company_size', 'region', 'segment']);
      const items = group ? categoricalFor(one, [group], MANY_VALUES) : undefined;
      if (!first || !group || !items) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [{ id: group }, { id: items }];
      break;
    }
    case 'SCATTER':
    case 'QUADRANT':
    case 'BUBBLE': {
      const wanted = type === 'BUBBLE' ? 3 : 2;
      const chosen = [...metrics];
      const dimension =
        categoricalFor(chosen, [], ['acquisition_campaign', ...CATEGORIES]) ??
        categoricalFor(chosen);
      if (!dimension) return null;
      for (const id of COMPANIONS) {
        if (chosen.length >= wanted) break;
        const candidate = metricById(id);
        if (
          candidate &&
          !chosen.some((metric) => metric.id === id) &&
          allows(candidate, dimension) &&
          // Two axes read best in different units (e.g. CAC × conversão).
          (chosen.length !== 1 || candidate.format !== chosen[0]!.format)
        ) {
          chosen.push(candidate);
        }
      }
      if (chosen.length < wanted) return null;
      nextMetrics = chosen.slice(0, Math.max(wanted, Math.min(chosen.length, 3))).map((metric) => ({
        id: metric.id,
      }));
      nextDimensions = [{ id: dimension }];
      break;
    }
    case 'FUNNEL':
      nextMetrics = FUNNEL_STAGES.filter(metricById).map((id) => ({ id }));
      nextDimensions = [];
      break;
    case 'SANKEY': {
      const metric = additive(first);
      const sources = ['acquisition_channel', 'acquisition_source', 'campaign_channel'];
      const targets = ['product', 'product_category', 'nba_action'];
      const source = metric ? sources.find((id) => allows(metric, id)) : undefined;
      const target = metric ? targets.find((id) => allows(metric, id)) : undefined;
      if (metric && source && target) {
        nextMetrics = [{ id: metric.id }];
        nextDimensions = [{ id: source }, { id: target }];
      } else if (metricById('contracted_products')) {
        nextMetrics = [{ id: 'contracted_products' }];
        nextDimensions = [{ id: 'acquisition_channel' }, { id: 'product' }];
      }
      break;
    }
    case 'MAP': {
      const geo = ['state', 'region'].find((id) => one.every((metric) => allows(metric, id)));
      if (!first || !geo) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [{ id: geo }];
      break;
    }
    case 'COHORT':
    case 'RETENTION_CURVE':
      nextMetrics = [{ id: 'activation_d30' }];
      nextDimensions = [
        { id: 'account_opened_date', granularity: 'month' },
        { id: 'activation_date', granularity: 'month' },
      ];
      break;
    case 'CALENDAR_HEATMAP': {
      const time = month(one);
      if (!first || !time) return null;
      nextMetrics = [{ id: first.id }];
      nextDimensions = [{ id: time.id, granularity: 'date' }];
      break;
    }
    case 'RADAR':
      nextMetrics = DNA_SCORES.filter(metricById).map((id) => ({ id }));
      nextDimensions = [];
      break;
    case 'TIMELINE':
      nextMetrics = [{ id: 'app_interactions' }];
      nextDimensions = [{ id: 'app_event_date', granularity: 'date' }, { id: 'app_action' }];
      break;
    default:
      return null;
  }

  const candidate: AnalysisSpec = {
    ...spec,
    metrics: nextMetrics ?? spec.metrics,
    dimensions: nextDimensions ?? spec.dimensions,
    visualization: { ...spec.visualization, type, mode: 'MANUAL' },
  };
  // Every metric must accept every dimension, and the chart must fit the new analysis.
  const valid =
    candidate.metrics.length > 0 &&
    candidate.metrics.every((selection) => metricById(selection.id)) &&
    candidate.dimensions.every((dimension) =>
      candidate.metrics.every((selection) => allows(metricById(selection.id), dimension.id)),
    ) &&
    checkVisualizationCompatibility(type, buildAnalysisShape(candidate, catalog)).compatible;
  if (!valid) return null;
  candidate.datasets = [
    ...new Set([
      ...(spec.datasets ?? []),
      ...requiredDatasetsFor(candidate, catalog.metrics, catalog.dimensions),
    ]),
  ];
  candidate.filters = spec.filters.filter((filter) =>
    candidate.metrics.every((selection) => {
      const metric = metricById(selection.id);
      return !metric || metric.allowedFilters.includes(filter.field);
    }),
  );

  return candidate;
}

/** "Troca as métricas por Leads, Contas abertas… e remove Canal" in business words. */
function describeChange(before: AnalysisSpec, after: AnalysisSpec, catalog: Catalog) {
  const metricName = (id: string) =>
    catalog.metrics.find((metric) => metric.id === id)?.shortName ?? id;
  const dimensionName = (selection: DimensionSelection) =>
    selection.granularity === 'month'
      ? `${catalog.dimensions.find((item) => item.id === selection.id)?.label ?? selection.id} (mês)`
      : selection.granularity === 'date'
        ? `${catalog.dimensions.find((item) => item.id === selection.id)?.label ?? selection.id} (dia)`
        : (catalog.dimensions.find((item) => item.id === selection.id)?.label ?? selection.id);
  const key = (selection: DimensionSelection) => `${selection.id}:${selection.granularity ?? ''}`;
  const addedMetrics = after.metrics.filter((m) => !before.metrics.some((b) => b.id === m.id));
  const removedMetrics = before.metrics.filter((m) => !after.metrics.some((a) => a.id === m.id));
  const addedDimensions = after.dimensions.filter(
    (d) => !before.dimensions.some((b) => key(b) === key(d)),
  );
  const removedDimensions = before.dimensions.filter(
    (d) => !after.dimensions.some((a) => key(a) === key(d)),
  );
  const list = (names: string[]) =>
    names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
  const parts = [
    addedMetrics.length && removedMetrics.length
      ? `troca ${list(removedMetrics.map((m) => metricName(m.id)))} por ${list(addedMetrics.map((m) => metricName(m.id)))}`
      : addedMetrics.length
        ? `adiciona ${list(addedMetrics.map((m) => metricName(m.id)))}`
        : removedMetrics.length
          ? `remove ${list(removedMetrics.map((m) => metricName(m.id)))}`
          : '',
    addedDimensions.length ? `adiciona ${list(addedDimensions.map(dimensionName))}` : '',
    removedDimensions.length ? `remove ${list(removedDimensions.map(dimensionName))}` : '',
  ].filter(Boolean);
  const sentence = parts.join(' e ');
  return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.` : '';
}
