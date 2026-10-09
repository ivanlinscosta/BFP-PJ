import { visualizationName } from '@bfp/shared';
import { formatInsightValue, isLowerBetterMetric } from '@bfp/analytics-engine';
import type { AnalysisSpec, ColumnDef } from '@bfp/domain';
import { getDimensionDefinition, getMetricDefinition } from '@bfp/semantic-layer';
import { describeDateRange, type AnalysisOperation } from '@bfp/shared';
import { describeSpec } from '@api/http/specLabels';
import type { GovernedQueryResult } from '@api/services/analyticsService';

function metricLabel(id: string) {
  return getMetricDefinition(id)?.shortName ?? id;
}

function dimensionLabel(id: string) {
  return getDimensionDefinition(id)?.label ?? id;
}

/** Short, deterministic confirmation of the operations applied to the playground. */
export function describeOperations(operations: readonly AnalysisOperation[]) {
  return operations
    .map((operation) => {
      switch (operation.type) {
        case 'ADD_DIMENSION':
          return `${dimensionLabel(operation.dimensionId)} adicionado à análise.`;
        case 'REMOVE_DIMENSION':
          return `${dimensionLabel(operation.dimensionId)} removido da análise.`;
        case 'ADD_METRIC':
          return `${metricLabel(operation.metricId)} adicionada à análise.`;
        case 'REMOVE_METRIC':
          return `${metricLabel(operation.metricId)} removida da análise.`;
        case 'ADD_FILTER':
          return `Filtro ${
            describeSpec({
              metrics: [],
              dimensions: [],
              filters: [operation.filter],
              visualization: { type: 'AUTO' },
            }).filters[0]
          } aplicado.`;
        case 'REMOVE_FILTER':
          return `Filtro de ${dimensionLabel(operation.field)} removido.`;
        case 'SET_DATE_RANGE':
          return `Período alterado para ${describeDateRange(operation.dateRange)}.`;
        case 'SET_VISUALIZATION':
          return `Visualização alterada para ${visualizationName(operation.visualization).toLowerCase()}.`;
        case 'SET_COMPARISON':
          return operation.comparison === 'PREVIOUS_PERIOD'
            ? 'Comparação com o período anterior ativada.'
            : 'Comparação com o período anterior desativada.';
        case 'SORT':
          return 'Ordenação atualizada.';
        case 'CLEAR':
          return 'Análise reiniciada.';
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join(' ');
}

/** "Base da resposta" shown below the answer: metrics, filters and period used. */
export function describeBasis(spec: AnalysisSpec) {
  const description = describeSpec(spec);
  return {
    title: description.sentence,
    items: [
      ...description.metrics,
      ...description.dimensions.map((dimension) => `por ${dimension}`),
      ...description.filters,
      description.period.replace(/^./, (char) => char.toUpperCase()),
    ],
  };
}

function readRows(result: GovernedQueryResult, dimension: ColumnDef, metrics: ColumnDef[]) {
  return result.rows
    .map((row) => ({
      label:
        result.valueLabels[dimension.key]?.[String(row[dimension.key] ?? '')] ??
        String(row[dimension.key] ?? '—'),
      values: Object.fromEntries(
        metrics
          .map((metric) => [metric.key, row[metric.key]])
          .filter(([, value]) => value !== null),
      ) as Record<string, number>,
    }))
    .filter((row) => metrics.every((metric) => typeof row.values[metric.key] === 'number'));
}

/**
 * Balanced ranking between a "higher is better" and a "lower is better" metric
 * (e.g. conversion vs CAC). Rows with zero cost are excluded from cost comparisons.
 */
function balancedAnswer(result: GovernedQueryResult, dimension: ColumnDef, metrics: ColumnDef[]) {
  const [higher, lower] = isLowerBetterMetric(metrics[0]!.key)
    ? [metrics[1]!, metrics[0]!]
    : [metrics[0]!, metrics[1]!];
  const rows = readRows(result, dimension, metrics).filter((row) => row.values[lower.key]! > 0);
  if (rows.length < 2) {
    return null;
  }

  const rankBy = (key: string, ascending: boolean) =>
    new Map(
      [...rows]
        .sort((left, right) =>
          ascending
            ? left.values[key]! - right.values[key]!
            : right.values[key]! - left.values[key]!,
        )
        .map((row, index) => [row.label, index + 1]),
    );
  const higherRank = rankBy(higher.key, false);
  const lowerRank = rankBy(lower.key, true);
  const scored = [...rows].sort(
    (left, right) =>
      higherRank.get(left.label)! +
        lowerRank.get(left.label)! -
        (higherRank.get(right.label)! + lowerRank.get(right.label)!) ||
      right.values[higher.key]! - left.values[higher.key]!,
  );
  const winner = scored[0]!;
  const average = rows.reduce((sum, row) => sum + row.values[lower.key]!, 0) / rows.length;
  const position = winner.values[lower.key]! <= average ? 'abaixo' : 'acima';
  const scope =
    lower.key === 'cac' || lower.key === 'cpl'
      ? 'dos canais pagos'
      : `dos demais recortes de ${dimension.label.toLowerCase()}`;

  return `${winner.label} apresenta o melhor equilíbrio no período selecionado: ${higher.label.toLowerCase()} de ${formatInsightValue(
    winner.values[higher.key]!,
    higher.format,
  )} e ${lower.label} de ${formatInsightValue(winner.values[lower.key]!, lower.format)}, ${position} da média ${scope} (${formatInsightValue(
    average,
    lower.format,
  )}).`;
}

/** Grounded narrative built exclusively from the governed query result. */
export function composeAnswer(result: GovernedQueryResult) {
  if (result.rows.length === 0) {
    return 'Não encontrei dados para esse recorte. Experimente ampliar o período ou remover um filtro.';
  }

  const dimensions = result.columns.filter((column) => column.type === 'dimension');
  const metrics = result.columns.filter(
    (column) => column.type === 'metric' && column.role === 'value',
  );

  if (
    dimensions.length === 1 &&
    metrics.length === 2 &&
    isLowerBetterMetric(metrics[0]!.key) !== isLowerBetterMetric(metrics[1]!.key)
  ) {
    const balanced = balancedAnswer(result, dimensions[0]!, metrics);
    if (balanced) {
      return balanced;
    }
  }

  if (dimensions.length === 0 && metrics.length > 0) {
    const row = result.rows[0]!;
    return metrics
      .map(
        (metric) =>
          `${metric.label}: ${formatInsightValue(Number(row[metric.key] ?? 0), metric.format)}`,
      )
      .join(' · ')
      .concat(' no período selecionado.');
  }

  const [first, second] = result.insights;
  if (!first) {
    return 'Consultei os dados, mas não há variação relevante para destacar neste recorte.';
  }

  return second ? `${first.description} ${second.title}.` : first.description;
}

/** Deterministic next steps grounded in the current spec and its weakest category. */
export function buildSuggestions(spec: AnalysisSpec, result?: GovernedQueryResult) {
  const suggestions: string[] = [];
  const dimensionIds = spec.dimensions.map((dimension) => dimension.id);
  const metricIds = spec.metrics.map((metric) => metric.id);

  if (spec.comparison?.type !== 'PREVIOUS_PERIOD') {
    suggestions.push('Comparar com período anterior');
  }
  if (!dimensionIds.includes('company_size')) {
    suggestions.push('Separar por porte');
  }
  if (!metricIds.includes('cac')) {
    suggestions.push('Adicionar CAC ao gráfico');
  }

  const weakest = result?.insights.find((insight) => insight.type === 'DIFFERENCE')?.evidence.loser;
  if (typeof weakest === 'string' && dimensionIds.includes('acquisition_channel')) {
    suggestions.push(`Investigar ${weakest}`);
  }

  return suggestions.slice(0, 4);
}
