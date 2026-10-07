import type { AnalyticsResult, ColumnDef, ColumnFormat } from '@bfp/domain';

/** Deterministic insight categories computed before any LLM narration. */
export const INSIGHT_TYPES = [
  'RANKING',
  'DIFFERENCE',
  'CONTRIBUTION',
  'OUTLIER',
  'PERIOD_OVER_PERIOD',
  'MATRIX_PEAK',
  'MATRIX_CONSISTENCY',
  'MATRIX_LOW',
] as const;

/** Deterministic insight categories computed before any LLM narration. */
export type InsightType = (typeof INSIGHT_TYPES)[number];

/** Structured, explainable evidence derived exclusively from an AnalyticsResult. */
export interface AnalyticsInsight {
  id: string;
  type: InsightType;
  tone: 'highlight' | 'neutral' | 'attention';
  title: string;
  description: string;
  metricId: string;
  evidence: Record<string, string | number | boolean | null>;
}

/** Inputs accepted by the insight engine. */
export interface GenerateInsightsInput {
  result: Pick<AnalyticsResult, 'columns' | 'rows'>;
  /** Resolves the business label of a dimension value (e.g. GOOGLE_SEARCH → Google Search). */
  labelFor?: (dimensionKey: string, value: unknown) => string;
  maxInsights?: number;
}

interface CategoryValue {
  label: string;
  value: number;
}

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** Formats a metric value using the same pt-BR conventions as the UI. */
export function formatInsightValue(value: number, format: ColumnFormat | undefined) {
  if (format === 'percent') {
    return `${percentFormatter.format(value * 100)}%`;
  }

  if (format === 'currency') {
    return currencyFormatter.format(value);
  }

  return numberFormatter.format(value);
}

function formatDifference(left: number, right: number, format: ColumnFormat | undefined) {
  if (format === 'percent') {
    return `${percentFormatter.format((left - right) * 100)} p.p.`;
  }

  return formatInsightValue(left - right, format);
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function defaultLabel(_key: string, value: unknown) {
  return value === null || value === undefined || value === '' ? 'Não informado' : String(value);
}

/** Metrics where lower values are better, so rankings must read in the opposite direction. */
const LOWER_IS_BETTER_PATTERN = /(^|_)(cac|cpl|average_.*_time|unresolved)/;

/** Whether a lower value is the better outcome for a metric (e.g. CAC, CPL, durations). */
export function isLowerBetterMetric(metricKey: string) {
  return LOWER_IS_BETTER_PATTERN.test(metricKey);
}

const lowerIsBetter = isLowerBetterMetric;

function aggregateByCategory(
  rows: AnalyticsResult['rows'],
  dimension: ColumnDef,
  metric: ColumnDef,
  labelFor: (key: string, value: unknown) => string,
): CategoryValue[] {
  return rows
    .map((row) => ({
      label: labelFor(dimension.key, row[dimension.key]),
      value: toNumber(row[metric.key]),
    }))
    .filter((entry): entry is CategoryValue => entry.value !== null);
}

function rankingInsights(
  values: CategoryValue[],
  dimension: ColumnDef,
  metric: ColumnDef,
): AnalyticsInsight[] {
  if (values.length < 2) {
    return [];
  }

  const inverted = lowerIsBetter(metric.key);
  const sorted = [...values].sort((left, right) =>
    inverted ? left.value - right.value : right.value - left.value,
  );
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const insights: AnalyticsInsight[] = [
    {
      id: `ranking:${metric.key}:${dimension.key}`,
      type: 'DIFFERENCE',
      tone: 'highlight',
      title: `${best.label}: ${formatDifference(best.value, worst.value, metric.format).replace('-', '')} ${
        inverted ? 'abaixo' : 'acima'
      } de ${worst.label}`,
      description: `${best.label} (${formatInsightValue(best.value, metric.format)}) está ${formatDifference(
        best.value,
        worst.value,
        metric.format,
      ).replace('-', '')} ${inverted ? 'abaixo' : 'acima'} de ${worst.label} (${formatInsightValue(
        worst.value,
        metric.format,
      )}), o ${dimension.label.toLowerCase()} de ${inverted ? 'maior' : 'menor'} ${metric.label.toLowerCase()}.`,
      metricId: metric.key,
      evidence: {
        winner: best.label,
        winnerValue: best.value,
        loser: worst.label,
        loserValue: worst.value,
        lowerIsBetter: inverted,
      },
    },
  ];

  if (sorted.length >= 3) {
    const runnerUp = sorted[1]!;
    const third = sorted[2]!;
    const challenger = sorted.find((entry, index) => index > 1 && entry !== worst) ?? third;
    insights.push({
      id: `comparison:${metric.key}:${dimension.key}`,
      type: 'RANKING',
      tone: 'neutral',
      title: `${runnerUp.label} supera ${challenger.label} em ${formatDifference(
        runnerUp.value,
        challenger.value,
        metric.format,
      ).replace('-', '')}`,
      description: `${runnerUp.label}: ${formatInsightValue(runnerUp.value, metric.format)}. ${
        challenger.label
      }: ${formatInsightValue(challenger.value, metric.format)}. Diferença descritiva de ${formatDifference(
        runnerUp.value,
        challenger.value,
        metric.format,
      ).replace('-', '')}.`,
      metricId: metric.key,
      evidence: {
        leader: runnerUp.label,
        leaderValue: runnerUp.value,
        challenger: challenger.label,
        challengerValue: challenger.value,
      },
    });
  }

  return insights;
}

function contributionInsight(
  values: CategoryValue[],
  dimension: ColumnDef,
  metric: ColumnDef,
): AnalyticsInsight[] {
  if (metric.format === 'percent' || values.length < 3) {
    return [];
  }

  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  if (total <= 0) {
    return [];
  }

  const top = [...values].sort((left, right) => right.value - left.value)[0]!;
  const share = top.value / total;
  return [
    {
      id: `contribution:${metric.key}:${dimension.key}`,
      type: 'CONTRIBUTION',
      tone: share >= 0.4 ? 'attention' : 'neutral',
      title: `${top.label} concentra ${percentFormatter.format(share * 100)}% do total`,
      description: `${top.label} responde por ${formatInsightValue(top.value, metric.format)} de ${formatInsightValue(
        total,
        metric.format,
      )} em ${metric.label.toLowerCase()}.`,
      metricId: metric.key,
      evidence: { category: top.label, value: top.value, total, share },
    },
  ];
}

function outlierInsight(
  values: CategoryValue[],
  dimension: ColumnDef,
  metric: ColumnDef,
): AnalyticsInsight[] {
  if (values.length < 4) {
    return [];
  }

  const mean = values.reduce((sum, entry) => sum + entry.value, 0) / values.length;
  const variance =
    values.reduce((sum, entry) => sum + (entry.value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  if (deviation === 0) {
    return [];
  }

  const outlier = values
    .map((entry) => ({ ...entry, z: (entry.value - mean) / deviation }))
    .sort((left, right) => Math.abs(right.z) - Math.abs(left.z))[0]!;

  if (Math.abs(outlier.z) < 1.8) {
    return [];
  }

  return [
    {
      id: `outlier:${metric.key}:${dimension.key}`,
      type: 'OUTLIER',
      tone: 'attention',
      title: `${outlier.label} foge do padrão em ${metric.label.toLowerCase()}`,
      description: `${outlier.label} registra ${formatInsightValue(outlier.value, metric.format)}, ${
        outlier.z > 0 ? 'acima' : 'abaixo'
      } da média de ${formatInsightValue(mean, metric.format)} no recorte por ${dimension.label.toLowerCase()}.`,
      metricId: metric.key,
      evidence: { category: outlier.label, value: outlier.value, mean, zScore: outlier.z },
    },
  ];
}

function periodOverPeriodInsight(
  rows: AnalyticsResult['rows'],
  columns: ColumnDef[],
  metric: ColumnDef,
): AnalyticsInsight[] {
  const comparison = columns.find((column) => column.key === `${metric.key}__previous_period`);
  if (!comparison) {
    return [];
  }

  const current = rows.reduce((sum, row) => sum + (toNumber(row[metric.key]) ?? 0), 0);
  const previous = rows.reduce((sum, row) => sum + (toNumber(row[comparison.key]) ?? 0), 0);
  if (previous === 0 || metric.format === 'percent') {
    return [];
  }

  const change = (current - previous) / previous;
  return [
    {
      id: `pop:${metric.key}`,
      type: 'PERIOD_OVER_PERIOD',
      tone: change >= 0 ? 'highlight' : 'attention',
      title: `${metric.label} ${change >= 0 ? 'cresceu' : 'caiu'} ${percentFormatter.format(
        Math.abs(change) * 100,
      )}% vs. período anterior`,
      description: `Período atual: ${formatInsightValue(current, metric.format)}. Período anterior: ${formatInsightValue(
        previous,
        metric.format,
      )}.`,
      metricId: metric.key,
      evidence: { current, previous, change },
    },
  ];
}

function matrixInsights(
  rows: AnalyticsResult['rows'],
  rowDimension: ColumnDef,
  columnDimension: ColumnDef,
  metric: ColumnDef,
  labelFor: (key: string, value: unknown) => string,
): AnalyticsInsight[] {
  const cells = rows
    .map((row) => ({
      row: labelFor(rowDimension.key, row[rowDimension.key]),
      column: labelFor(columnDimension.key, row[columnDimension.key]),
      value: toNumber(row[metric.key]),
    }))
    .filter((cell): cell is { row: string; column: string; value: number } => cell.value !== null);

  if (cells.length < 2) {
    return [];
  }

  const inverted = lowerIsBetter(metric.key);
  const sorted = [...cells].sort((left, right) =>
    inverted ? left.value - right.value : right.value - left.value,
  );
  const peak = sorted[0]!;
  const low = sorted[sorted.length - 1]!;
  const insights: AnalyticsInsight[] = [
    {
      id: `matrix-peak:${metric.key}`,
      type: 'MATRIX_PEAK',
      tone: 'highlight',
      title: `Célula de ${inverted ? 'melhor' : 'maior'} ${metric.label.toLowerCase()}: ${peak.row} / ${peak.column}`,
      description: `${formatInsightValue(peak.value, metric.format)} é o ${
        inverted ? 'menor' : 'maior'
      } valor no recorte, na combinação ${peak.row} × ${peak.column}.`,
      metricId: metric.key,
      evidence: { row: peak.row, column: peak.column, value: peak.value },
    },
  ];

  const columnsByRow = new Map<string, Map<string, number>>();
  for (const cell of cells) {
    const entry = columnsByRow.get(cell.row) ?? new Map<string, number>();
    entry.set(cell.column, cell.value);
    columnsByRow.set(cell.row, entry);
  }

  const columnLabels = [...new Set(cells.map((cell) => cell.column))];
  const orderings = columnLabels.map((column) =>
    [...columnsByRow.entries()]
      .filter(([, values]) => values.has(column))
      .sort(([, left], [, right]) => (right.get(column) ?? 0) - (left.get(column) ?? 0))
      .map(([row]) => row)
      .join('|'),
  );
  const consistent = orderings.length > 1 && new Set(orderings).size === 1;
  const ranking = orderings[0]?.split('|') ?? [];

  if (ranking.length >= 2) {
    insights.push({
      id: `matrix-consistency:${metric.key}`,
      type: 'MATRIX_CONSISTENCY',
      tone: 'neutral',
      title: consistent
        ? `Ranking por ${rowDimension.label.toLowerCase()} se mantém nos ${columnLabels.length} recortes de ${columnDimension.label.toLowerCase()}`
        : `Ranking por ${rowDimension.label.toLowerCase()} muda conforme ${columnDimension.label.toLowerCase()}`,
      description: consistent
        ? `${ranking.join(' → ')} em ${columnLabels.join(', ')}. ${columnDimension.label} não inverte a hierarquia neste recorte.`
        : `A ordem de ${rowDimension.label.toLowerCase()} varia conforme ${columnDimension.label.toLowerCase()}; vale analisar cada coluna separadamente.`,
      metricId: metric.key,
      evidence: { consistent, ranking: ranking.join(' → '), columns: columnLabels.join(', ') },
    });
  }

  insights.push({
    id: `matrix-low:${metric.key}`,
    type: 'MATRIX_LOW',
    tone: 'attention',
    title: `${low.row} / ${low.column}: ${inverted ? 'maior' : 'menor'} ${metric.label.toLowerCase()} (${formatInsightValue(
      low.value,
      metric.format,
    )})`,
    description: `Diferença descritiva de ${formatDifference(
      peak.value,
      low.value,
      metric.format,
    ).replace(
      '-',
      '',
    )} frente à célula de pico. Valide com a amostra de cada recorte antes de agir.`,
    metricId: metric.key,
    evidence: { row: low.row, column: low.column, value: low.value },
  });

  return insights;
}

/**
 * Deterministic insight engine. It never invents values: every number in an insight comes
 * from the AnalyticsResult it receives. LLMs only narrate these structured evidences.
 */
export function generateInsights(input: GenerateInsightsInput): AnalyticsInsight[] {
  const labelFor = input.labelFor ?? defaultLabel;
  const { columns, rows } = input.result;
  const maxInsights = input.maxInsights ?? 3;
  const dimensions = columns.filter((column) => column.type === 'dimension');
  const metrics = columns.filter((column) => column.type === 'metric' && column.role === 'value');
  const primaryMetric = metrics[0];

  if (!primaryMetric || rows.length === 0) {
    return [];
  }

  const insights: AnalyticsInsight[] = [];

  if (dimensions.length === 0) {
    insights.push(...periodOverPeriodInsight(rows, columns, primaryMetric));
  } else if (dimensions.length === 1) {
    const dimension = dimensions[0]!;
    const values = aggregateByCategory(rows, dimension, primaryMetric, labelFor);
    if (dimension.role === 'time') {
      insights.push(...periodOverPeriodInsight(rows, columns, primaryMetric));
      insights.push(...outlierInsight(values, dimension, primaryMetric));
    } else {
      insights.push(...rankingInsights(values, dimension, primaryMetric));
      insights.push(...outlierInsight(values, dimension, primaryMetric));
      insights.push(...contributionInsight(values, dimension, primaryMetric));
    }
    insights.push(...periodOverPeriodInsight(rows, columns, primaryMetric));
  } else {
    insights.push(...matrixInsights(rows, dimensions[0]!, dimensions[1]!, primaryMetric, labelFor));
  }

  const unique = new Map(insights.map((insight) => [insight.id, insight]));
  return [...unique.values()].slice(0, maxInsights);
}
