import { AlertTriangle, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import type { AnalysisSpec, VisualizationSettings, VisualizationSpec } from '@bfp/domain';
import {
  buildAnalysisShape,
  chartName,
  evaluateVisualizations,
  recommendVisualizations,
  resolveVisualization,
  type ChartType,
} from '@bfp/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states/states';
import { useDimensionCatalog, useMetricCatalog } from '@/features/catalog/hooks';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { formatMetricValue } from '@/lib/format';
import { AnalyticsTable } from './data-table';
import { dimensionColumns, labelOf, metricColumns, numeric } from './model';
import { resolveDefinition } from './registry';

/**
 * Everything the UI needs to choose and draw a chart for an analysis: its shape (from the
 * semantic catalog and the result), every chart with compatibility and score, the top
 * recommendations and the chart actually drawn (AUTO or MANUAL).
 */
export function useVisualizationModel(
  spec: Pick<AnalysisSpec, 'metrics' | 'dimensions' | 'visualization'>,
  result?: AnalyticsResponse,
  visualization: VisualizationSpec | undefined = spec.visualization,
) {
  const metrics = useMetricCatalog();
  const dimensions = useDimensionCatalog();
  return useMemo(() => {
    const catalog = { metrics: metrics.data ?? [], dimensions: dimensions.data ?? [] };
    const shape = buildAnalysisShape(spec, catalog, result);
    return {
      shape,
      evaluations: evaluateVisualizations(shape),
      recommendations: recommendVisualizations(shape),
      resolved: resolveVisualization(visualization, shape),
      stageOf: (metricId: string) =>
        catalog.metrics.find((metric) => metric.id === metricId)?.funnelStage,
    };
  }, [spec, result, visualization, metrics.data, dimensions.data]);
}

/** Short text summary of the result for screen readers (and the chart's accessible name). */
function summarize(result: AnalyticsResponse, type: ChartType) {
  const metric = metricColumns(result)[0];
  const [dimension] = dimensionColumns(result);
  if (!metric) return chartName(type);
  if (!dimension) {
    return `${chartName(type)}: ${metric.label} ${formatMetricValue(result.rows[0]?.[metric.key], metric.format)}.`;
  }
  const ranked = result.rows
    .map((row) => ({
      label: labelOf(result, dimension.key, row[dimension.key]),
      value: numeric(row[metric.key]),
    }))
    .filter((row): row is { label: string; value: number } => row.value !== null)
    .sort((left, right) => right.value - left.value);
  const top = ranked[0];
  return `${chartName(type)} de ${metric.label} por ${dimension.label}: ${result.rows.length} linhas${
    top ? `; maior valor em ${top.label} (${formatMetricValue(top.value, metric.format)})` : ''
  }.`;
}

/**
 * VisualizationRenderer: draws any analysis with the chart of its VisualizationSpec through the
 * registry. Used by the Explorer, dashboards, Inteligência PJ answers and studies, so a chart
 * looks and behaves the same everywhere. Handles empty, incompatible and accessible states.
 */
export function VisualizationRenderer({
  spec,
  result,
  visualization = spec.visualization,
  totalsResult,
  onUseRecommended,
  showTable,
}: {
  spec: Pick<AnalysisSpec, 'metrics' | 'dimensions' | 'visualization'>;
  result: AnalyticsResponse;
  /** Overrides the spec's visualization (e.g. a study chapter). */
  visualization?: VisualizationSpec;
  totalsResult?: AnalyticsResponse;
  /** Offered when a pinned chart no longer fits the analysis. */
  onUseRecommended?(): void;
  /** Overrides the "show table" setting. */
  showTable?: boolean;
}) {
  const model = useVisualizationModel(spec, result, visualization);
  const settings: VisualizationSettings = visualization?.settings ?? {};

  if (spec.metrics.length === 0) {
    return (
      <EmptyState
        className="py-8"
        description="Escolha uma métrica para começar."
        title="Adicione uma métrica"
      />
    );
  }
  if (result.rows.length === 0) {
    return (
      <EmptyState
        className="py-8"
        description="Amplie o período ou remova um filtro."
        title="Nenhum dado encontrado para os filtros selecionados."
      />
    );
  }

  const { resolved } = model;
  const definition = resolveDefinition(resolved.type);
  const chart = definition.render({
    result,
    settings,
    totalsResult,
    stageOf: model.stageOf,
  });
  const summary = summarize(result, resolved.type);

  return (
    <div className="flex flex-col gap-3">
      {resolved.incompatible ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3 py-2.5 text-[13px] text-ink"
          role="status"
        >
          <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <strong>{chartName(resolved.incompatible.requested)}</strong> não é compatível com a
            análise atual. {resolved.incompatible.reason} Mostrando{' '}
            {chartName(resolved.type).toLowerCase()}.
          </span>
          {onUseRecommended ? (
            <Button onClick={onUseRecommended} size="sm">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              Usar visualização recomendada
            </Button>
          ) : null}
        </div>
      ) : null}
      <div aria-label={summary} role="group">
        {chart ?? (
          <EmptyState
            className="py-8"
            description="Os dados desta análise não formam este gráfico. Veja a tabela."
            title="Não foi possível montar o gráfico"
          />
        )}
      </div>
      <p className="sr-only">{summary}</p>
      {(showTable ?? settings.showTable) && resolved.type !== 'TABLE' ? (
        <AnalyticsTable result={result} />
      ) : null}
    </div>
  );
}

/** Visualization of a study chapter or AI answer: the chart chosen by the server, pinned. */
export function pinnedVisualization(type: string | undefined): VisualizationSpec {
  return type && type !== 'AUTO'
    ? { type: type as VisualizationSpec['type'], mode: 'MANUAL' }
    : { type: 'AUTO', mode: 'AUTO' };
}

export { recommendVisualizations };
