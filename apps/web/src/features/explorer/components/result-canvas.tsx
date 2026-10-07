import { ArrowRight, Download, LayoutGrid, Save, Share2, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { AnalysisSpec, VisualizationType } from '@bfp/domain';
import { describeAnalysisSpec, type SpecLabelResolver } from '@bfp/shared';
import { Badge, CertificationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/card';
import { ActionChip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState } from '@/components/states/states';
import type { MetricDetail } from '@/features/catalog/api';
import { AnalyticsTable } from '@/features/viz/data-table';
import { HeatmapLegend } from '@/features/viz/heatmap';
import { ResultView } from '@/features/viz/result-view';
import { capitalize, formatMinutes, formatShare } from '@/lib/format';
import { pluralizeLabel } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { AnalyticsResponse } from '../api';
import type { NextExploration } from '../explorations';
import type { VisualizationSettings } from './side-panel';

interface ResultCanvasProps {
  spec: AnalysisSpec;
  labels: SpecLabelResolver;
  type: VisualizationType | 'KPI';
  options: Array<{
    type: VisualizationType;
    label: string;
    enabled: boolean;
    requirement?: string;
  }>;
  onTypeChange(type: VisualizationType): void;
  result: AnalyticsResponse | undefined;
  totalsResult?: AnalyticsResponse;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  onRetry(): void;
  settings: VisualizationSettings;
  metricDetail: MetricDetail | undefined;
  explorations: NextExploration[];
  onExplore(exploration: NextExploration): void;
  showInlineExplorations: boolean;
  saveStatus: string;
  onSave(): void;
  onShare(): void;
  onAddToDashboard(): void;
  onExport(): void;
  canExport: boolean;
}

function chartTitle(spec: AnalysisSpec, labels: SpecLabelResolver) {
  const metric = spec.metrics.map((item) => labels.metric(item.id)).join(' e ');
  const dimensions = spec.dimensions.map((dimension) =>
    dimension.granularity === 'month' ? 'Mês' : labels.dimension(dimension.id),
  );
  if (dimensions.length === 0) return metric;
  if (dimensions.length === 1) return `${metric} por ${dimensions[0]!.toLowerCase()}`;
  return `${metric} por ${dimensions.slice(0, -1).join(', ')} e ${dimensions[dimensions.length - 1]}`;
}

/** Populated canvas: visualization tabs, chart card, insights and actions. */
export function ResultCanvas(props: ResultCanvasProps) {
  const { spec, labels, result, metricDetail } = props;
  const description = describeAnalysisSpec(spec, labels);
  const disabledHints = props.options
    .filter((option) => spec.dimensions.length >= 2 || option.type !== 'HEATMAP')
    .filter((option) => !option.enabled && option.requirement && option.type !== 'TABLE')
    .map((option) => `${option.label}: ${option.requirement}`)
    .join(' · ');
  const product = metricDetail?.dataProduct;
  const certified =
    spec.metrics.length > 0 && metricDetail?.metric.certificationStatus === 'CERTIFIED';
  const subtitle = [
    ...description.filters,
    description.period,
    product ? `Fonte: ${product.goldDataset}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const firstDimension = spec.dimensions[0];
  const rowCount = result
    ? new Set(result.rows.map((row) => String(row[firstDimension?.id ?? ''] ?? ''))).size
    : 0;
  const secondDimension = spec.dimensions[1];
  const secondCount =
    result && secondDimension
      ? new Set(result.rows.map((row) => String(row[secondDimension.id] ?? ''))).size
      : 0;
  const statusParts = [
    firstDimension
      ? `${rowCount} ${pluralizeLabel(firstDimension.granularity === 'month' ? 'Mês' : labels.dimension(firstDimension.id), rowCount)}`
      : null,
    secondDimension
      ? `${secondCount} ${pluralizeLabel(labels.dimension(secondDimension.id), secondCount)}`
      : null,
    description.filters.length ? `Filtro: ${description.filters.join(', ')}` : null,
    capitalize(description.period),
    props.saveStatus,
  ].filter(Boolean);
  const plan = result?.metadata.plan;
  const planLabel = plan
    ? plan.joins.length > 0
      ? `Bases: ${plan.joins.map((join) => join.description).join(' · ')}`
      : `Base: ${plan.datasets.map((dataset) => dataset.name).join(', ')}`
    : null;
  const insights = result?.insights ?? [];
  const visibleTabs = props.options.filter((option) =>
    spec.dimensions.length >= 2 ? option.type !== 'SCATTER' : option.type !== 'HEATMAP',
  );
  const activeTab = props.type === 'GROUPED_BAR' ? 'BAR' : props.type;

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <Tabs
          items={visibleTabs.map((option) => ({
            value: option.type,
            label: option.label,
            disabled: !option.enabled,
          }))}
          label="Tipo de visualização"
          onChange={(value) => props.onTypeChange(value)}
          value={(activeTab === 'KPI' ? 'TABLE' : activeTab) as VisualizationType}
          variant="segmented"
        />
        {disabledHints ? (
          <p className="ml-auto shrink rounded bg-muted px-2 py-1 text-right text-[11px] text-ink-soft">
            {disabledHints}
          </p>
        ) : null}
      </div>

      <Card
        aria-busy={props.fetching}
        className={cn(
          'px-3 pt-3 pb-2.5 transition-opacity',
          props.fetching && !props.loading && 'opacity-70',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-1">
          <div className="min-w-0">
            <h2 className="m-0 text-lg leading-tight font-semibold text-brand-navy">
              {chartTitle(spec, labels)}
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">{capitalize(subtitle)}</p>
          </div>
          {certified ? <CertificationBadge className="mt-1" status="CERTIFIED" /> : null}
        </div>
        <div className="mt-4 px-1">
          {props.loading ? (
            <div aria-label="Carregando visualização" className="flex flex-col gap-3" role="status">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton
                  className="h-[22px]"
                  key={index}
                  style={{ width: `${90 - index * 9}%` }}
                />
              ))}
            </div>
          ) : props.error ? (
            <ErrorState compact error={props.error} onRetry={props.onRetry} />
          ) : result && result.rows.length === 0 ? (
            <EmptyState
              className="py-8"
              description="Amplie o período ou remova um filtro para ver dados."
              title="Nenhum dado para este recorte"
            />
          ) : result ? (
            <>
              <ResultView
                result={result}
                showLegend={props.settings.showLegend}
                showValues={props.settings.showValues}
                sort={props.settings.sort}
                totalsResult={props.totalsResult}
                type={props.type}
              />
              {props.type === 'HEATMAP' ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <HeatmapLegend />
                  <p className="text-[11px] text-ink-soft">
                    Total = {labels.metric(spec.metrics[0]!.id).toLowerCase()} por{' '}
                    {labels.dimension(spec.dimensions[0]!.id).toLowerCase()} sem a segunda quebra
                  </p>
                </div>
              ) : null}
              {props.settings.showTable && props.type !== 'TABLE' ? (
                <div className="mt-4">
                  <AnalyticsTable result={result} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        {metricDetail && props.type !== 'HEATMAP' ? (
          <p className="mt-4 border-t border-line px-1 pt-3 text-[11px] text-ink-soft">
            {[
              product?.goldDataset,
              certified ? 'Certificada' : null,
              metricDetail.trust.owner,
              formatMinutes(metricDetail.trust.freshnessMinutes),
              metricDetail.trust.qualityRatio !== null
                ? `Qualidade ${formatShare(metricDetail.trust.qualityRatio)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </Card>

      {result && insights.length > 0 ? (
        <Card className="px-3 pt-3.5 pb-3">
          <div className="flex items-center justify-between">
            <Eyebrow>Insights da análise</Eyebrow>
            <Badge className="h-5 text-[11px]" tone="cream">
              {insights.length} {insights.length === 1 ? 'insight' : 'insights'}
            </Badge>
          </div>
          <ul
            className={cn(
              'm-0 mt-3 grid list-none gap-2 p-0',
              insights.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2',
            )}
          >
            {insights.map((insight, index) => (
              <li
                className={cn(
                  'rounded-[var(--radius-control)] px-2.5 py-2.5',
                  index === 0 ? 'bg-cream' : 'bg-muted',
                )}
                key={insight.id}
              >
                <p className="text-[13px] leading-snug font-semibold text-brand-navy">
                  {insight.title}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                  {insight.description}
                </p>
              </li>
            ))}
          </ul>
          {props.showInlineExplorations && props.explorations.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-line pt-3">
              <Eyebrow className="mt-2">Próximas explorações</Eyebrow>
              <div className="flex flex-1 flex-wrap gap-2">
                {props.explorations.map((exploration) => (
                  <ActionChip key={exploration.id} onClick={() => props.onExplore(exploration)}>
                    {exploration.label}
                  </ActionChip>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 border-t border-line pt-3">
            <Link
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-brand-navy hover:underline"
              to="/inteligencia"
            >
              <Sparkles aria-hidden className="h-4 w-4" />
              Aprofundar na Inteligência PJ
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={props.onSave} variant="primary">
          <Save aria-hidden className="h-4 w-4" />
          Salvar análise
        </Button>
        <Button onClick={props.onShare}>
          <Share2 aria-hidden className="h-4 w-4" />
          Compartilhar
        </Button>
        <Button onClick={props.onAddToDashboard}>
          <LayoutGrid aria-hidden className="h-4 w-4" />
          Adicionar ao dashboard
        </Button>
        <Button disabled={!props.canExport} onClick={props.onExport}>
          <Download aria-hidden className="h-4 w-4" />
          Exportar
        </Button>
      </div>
      <p className="text-[11px] text-ink-soft">{statusParts.join(' · ')}</p>
      {planLabel ? (
        <p className="-mt-2 text-[11px] text-ink-soft">{planLabel} · data mesh AWS</p>
      ) : null}
    </div>
  );
}
