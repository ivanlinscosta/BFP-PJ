import type { AnalysisSpec, VisualizationType } from '@bfp/domain';
import { listDimensionDefinitions, listMetricDefinitions } from '@bfp/semantic-layer';
import {
  buildAnalysisShape,
  chartName,
  checkVisualizationCompatibility,
  normalizeVisualizationType,
  recommendVisualizations,
  type DimensionLike,
  type MetricLike,
} from '@bfp/shared';

/** Shape of an analysis seen by the shared visualization engine (same rules as the web app). */
export function shapeOf(
  spec: Pick<AnalysisSpec, 'metrics' | 'dimensions'>,
  result?: { rows: ReadonlyArray<Record<string, unknown>> },
) {
  return buildAnalysisShape(
    spec,
    {
      metrics: listMetricDefinitions() as unknown as MetricLike[],
      dimensions: listDimensionDefinitions() as unknown as DimensionLike[],
    },
    result,
  );
}

/**
 * Chart of a study chapter or answer: the requested one when it fits the result, otherwise the
 * best recommendation for it (tables only when nothing else can draw the data).
 */
export function chartForResult(
  spec: Pick<AnalysisSpec, 'metrics' | 'dimensions'>,
  result: { rows: ReadonlyArray<Record<string, unknown>> },
  requested?: VisualizationType,
) {
  const shape = shapeOf(spec, result);
  const normalized = requested ? normalizeVisualizationType(requested) : 'AUTO';
  if (
    normalized !== 'AUTO' &&
    normalized !== 'TABLE' &&
    checkVisualizationCompatibility(normalized, shape).compatible
  ) {
    return normalized;
  }
  return recommendVisualizations(shape, 1)[0]?.type ?? 'TABLE';
}

/** Whether a chart can draw the analysis; when not, the requirement in business words. */
export function visualizationCompatibility(spec: AnalysisSpec, type: VisualizationType) {
  const normalized = normalizeVisualizationType(type);
  if (normalized === 'AUTO') return { compatible: true as const };
  const result = checkVisualizationCompatibility(normalized, shapeOf(spec));
  return result.compatible
    ? { compatible: true as const }
    : {
        compatible: false as const,
        reason: `Para usar ${chartName(normalized).toLowerCase()}: ${result.reason ?? ''}`.trim(),
      };
}

/** Top recommendations for the analysis (type, name, score and reason). */
export function recommendFor(spec: Pick<AnalysisSpec, 'metrics' | 'dimensions'>) {
  return recommendVisualizations(shapeOf(spec)).map((item) => ({
    ...item,
    name: chartName(item.type),
  }));
}

/** "Para este recorte, recomendo Barras horizontais (melhor para comparar 7 canais)…" */
export function describeRecommendations(spec: AnalysisSpec) {
  const recommendations = recommendFor(spec);
  if (recommendations.length === 0) return 'Adicione uma métrica para eu recomendar um gráfico.';
  const [first, ...rest] = recommendations;
  return `Para esta análise, o gráfico mais indicado é ${first!.name.toLowerCase()}: ${first!.reason}${
    rest.length
      ? ` Alternativas: ${rest.map((item) => `${item.name.toLowerCase()} (${item.reason.replace(/\.$/, '').toLowerCase()})`).join('; ')}.`
      : ''
  }`;
}
