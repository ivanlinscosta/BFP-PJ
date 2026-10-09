import type { AnalysisSpec } from '@bfp/domain';

/** Compact description of a query, kept in the conversation so follow-ups can refine it. */
export function describeQueryForMemory(spec: AnalysisSpec) {
  const parts = [
    `métricas ${spec.metrics.map((metric) => metric.id).join(', ')}`,
    spec.dimensions.length
      ? `por ${spec.dimensions.map((dimension) => dimension.id).join(', ')}`
      : '',
    spec.filters.length
      ? `filtros ${spec.filters.map((filter) => `${filter.field} ${filter.operator} ${JSON.stringify('value' in filter ? filter.value : filter)}`).join('; ')}`
      : '',
    spec.dateRange ? `período ${JSON.stringify(spec.dateRange)}` : '',
  ].filter(Boolean);
  return `[Consulta usada: ${parts.join(' · ')}]`;
}
