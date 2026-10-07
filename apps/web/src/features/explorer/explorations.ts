import type { AnalysisSpec } from '@bfp/domain';
import type { AnalysisOperation } from '@bfp/shared';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';
import { isDimensionCompatible, resolveMonthDimension } from './spec';

export interface NextExploration {
  id: string;
  label: string;
  operations: AnalysisOperation[];
  message: string;
}

/** Deterministic next steps derived from the catalog compatibility rules. */
export function buildNextExplorations(
  spec: AnalysisSpec,
  metrics: CatalogMetric[],
  dimensions: CatalogDimension[],
): NextExploration[] {
  const active = metrics.filter((metric) =>
    spec.metrics.some((selected) => selected.id === metric.id),
  );
  const dimensionIds = spec.dimensions.map((dimension) => dimension.id);
  const firstDimension = dimensions.find((dimension) => dimension.id === dimensionIds[0]);
  const scope = firstDimension ? ` por ${firstDimension.label.toLowerCase()}` : '';
  const result: NextExploration[] = [];

  const cac = metrics.find((metric) => metric.id === 'cac');
  if (
    cac &&
    !spec.metrics.some((metric) => metric.id === 'cac') &&
    dimensionIds.every((id) => isDimensionCompatible(id, [cac]))
  ) {
    result.push({
      id: 'add-cac',
      label: `Adicionar CAC para comparar eficiência${scope}`,
      operations: [{ type: 'ADD_METRIC', metricId: 'cac' }],
      message: 'CAC adicionado à análise.',
    });
  }

  const size = dimensions.find((dimension) => dimension.id === 'company_size');
  if (
    size &&
    !dimensionIds.includes('company_size') &&
    isDimensionCompatible('company_size', active)
  ) {
    result.push({
      id: 'add-size',
      label: `Segmentar por ${size.label}`,
      operations: [{ type: 'ADD_DIMENSION', dimensionId: 'company_size' }],
      message: `${size.label} adicionado à análise.`,
    });
  }

  const hasTime = spec.dimensions.some(
    (selected) => dimensions.find((dimension) => dimension.id === selected.id)?.type === 'date',
  );
  const month = resolveMonthDimension(active, dimensions);
  if (!hasTime && month) {
    result.push({
      id: 'add-month',
      label: 'Adicionar dimensão Mês para ver evolução',
      operations: [{ type: 'ADD_DIMENSION', dimensionId: month.id, granularity: 'month' }],
      message: 'Mês adicionado à análise.',
    });
  }

  if (spec.comparison?.type !== 'PREVIOUS_PERIOD') {
    result.push({
      id: 'compare',
      label: 'Comparar com o período anterior',
      operations: [{ type: 'SET_COMPARISON', comparison: 'PREVIOUS_PERIOD' }],
      message: 'Comparação com o período anterior ativada.',
    });
  }

  return result.slice(0, 3);
}
