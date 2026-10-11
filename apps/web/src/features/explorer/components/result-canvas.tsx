import {
  ArrowRight,
  ChevronDown,
  Download,
  LayoutGrid,
  LoaderCircle,
  Save,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { AnalysisSpec } from '@bfp/domain';
import type { ChartType } from '@bfp/shared';
import { describeAnalysisSpec, type SpecLabelResolver } from '@bfp/shared';
import { Badge, CertificationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/card';
import { Popover } from '@/components/ui/popover';
import { ActionChip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/states/states';
import type { MetricDetail } from '@/features/catalog/api';
import {
  VisualizationRenderer,
  type useVisualizationModel,
} from '@/features/viz/visualization-renderer';
import { VisualizationSelector } from '@/features/viz/visualization-selector';
import { capitalize, formatMinutes, formatShare } from '@/lib/format';
import { PDF_IGNORE_ATTRIBUTE } from '@/lib/pdf';
import { pluralizeLabel } from '@/lib/text';
import { cn } from '@/lib/utils';
import type { VisualizationFix } from '@/features/viz/fixes';
import type { AnalyticsResponse } from '../api';
import type { NextExploration } from '../explorations';

export type ExportFormat = 'csv' | 'pdf' | 'png';
/** Element rasterized by the PDF/PNG exports (the chart card). */
export const EXPORT_ELEMENT_ID = 'explorer-result';

const EXPORT_OPTIONS: Array<{ format: ExportFormat; label: string; description: string }> = [
  { format: 'csv', label: 'CSV', description: 'Dados agregados para planilhas' },
  { format: 'pdf', label: 'PDF', description: 'Gráfico com título e período' },
  { format: 'png', label: 'Imagem PNG', description: 'Gráfico para apresentações' },
];

/** "Exportar" opens a menu to choose the format of the export. */
function ExportMenu({
  formats,
  exporting,
  onExport,
}: {
  formats: ExportFormat[];
  exporting: ExportFormat | null;
  onExport(format: ExportFormat): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      anchor={
        <Button
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={formats.length === 0 || exporting !== null}
          onClick={() => setOpen(!open)}
        >
          {exporting ? (
            <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Download aria-hidden className="h-4 w-4" />
          )}
          {exporting ? `Gerando ${exporting.toUpperCase()}…` : 'Exportar'}
          <ChevronDown aria-hidden className="h-3.5 w-3.5" />
        </Button>
      }
      className="w-[240px] p-1"
      onClose={() => setOpen(false)}
      open={open}
    >
      <div aria-label="Formato do export" className="flex flex-col" role="menu">
        {EXPORT_OPTIONS.map((option) => {
          const available = formats.includes(option.format);
          return (
            <button
              className="flex flex-col items-start rounded-[var(--radius-control)] px-2.5 py-2 text-left hover:bg-muted focus-visible:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              data-autofocus={option.format === formats[0] ? '' : undefined}
              disabled={!available}
              key={option.format}
              onClick={() => {
                setOpen(false);
                onExport(option.format);
              }}
              role="menuitem"
              type="button"
            >
              <span className="text-[13px] font-semibold text-ink">{option.label}</span>
              <span className="text-xs text-ink-soft">
                {available ? option.description : 'Exportação de dados desativada'}
              </span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

interface ResultCanvasProps {
  spec: AnalysisSpec;
  labels: SpecLabelResolver;
  /** Visualization model (recommendations, compatibility and the chart drawn). */
  model: ReturnType<typeof useVisualizationModel>;
  onSelectVisualization(type: ChartType | 'AUTO'): void;
  fixFor?(type: ChartType): VisualizationFix | null;
  onApplyFix?(type: ChartType, fix: VisualizationFix): void;
  result: AnalyticsResponse | undefined;
  totalsResult?: AnalyticsResponse;
  loading: boolean;
  fetching: boolean;
  error: unknown;
  onRetry(): void;
  metricDetail: MetricDetail | undefined;
  explorations: NextExploration[];
  onExplore(exploration: NextExploration): void;
  saveStatus: string;
  onSave(): void;
  onAddToDashboard(): void;
  onExport(format: ExportFormat): void;
  /** Formats available now (CSV depends on the export permission). */
  exportFormats: ExportFormat[];
  /** Format being generated (PDF/PNG take a moment). */
  exporting: ExportFormat | null;
}

function chartTitle(spec: AnalysisSpec, labels: SpecLabelResolver) {
  const names = spec.metrics.map((item) => labels.metric(item.id));
  const metric =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
  const months = spec.dimensions.filter((dimension) => dimension.granularity === 'month').length;
  const dimensions = spec.dimensions.map((dimension) =>
    dimension.granularity === 'month'
      ? months > 1
        ? `${labels.dimension(dimension.id)} (mês)`
        : 'Mês'
      : labels.dimension(dimension.id),
  );
  if (dimensions.length === 0) return metric;
  if (dimensions.length === 1) return `${metric} por ${dimensions[0]!.toLowerCase()}`;
  return `${metric} por ${dimensions.slice(0, -1).join(', ')} e ${dimensions[dimensions.length - 1]}`;
}

/** Populated canvas: visualization tabs, chart card, insights and actions. */
export function ResultCanvas(props: ResultCanvasProps) {
  const { spec, labels, result, metricDetail } = props;
  const description = describeAnalysisSpec(spec, labels);
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
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <Card aria-busy={props.fetching} className="relative px-3 pt-3 pb-2.5" id={EXPORT_ELEMENT_ID}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-1">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 flex items-center gap-2 text-lg leading-tight font-semibold text-brand-navy">
              {chartTitle(spec, labels)}
              {certified ? <CertificationBadge status="CERTIFIED" /> : null}
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">{capitalize(subtitle)}</p>
          </div>
        </div>
        <div
          className="mt-3 flex flex-wrap items-end gap-2 border-b border-line px-1 pb-3"
          {...{ [PDF_IGNORE_ATTRIBUTE]: '' }}
        >
          <VisualizationSelector
            fixFor={props.fixFor}
            model={props.model}
            onApplyFix={props.onApplyFix}
            onSelect={props.onSelectVisualization}
          />
        </div>
        <div className="relative mt-4 min-h-[220px] px-1">
          {props.fetching && !props.loading ? (
            <div
              aria-label="Atualizando o gráfico"
              className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-control)] bg-card/70 backdrop-blur-[1px]"
              role="status"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-brand-navy shadow-sm">
                <LoaderCircle aria-hidden className="h-4 w-4 animate-spin text-brand-orange" />
                Processando os dados…
              </span>
            </div>
          ) : null}
          {props.loading ? (
            <div aria-label="Carregando visualização" className="flex flex-col gap-3" role="status">
              <p className="m-0 flex items-center gap-2 text-xs font-semibold text-brand-navy">
                <LoaderCircle aria-hidden className="h-4 w-4 animate-spin text-brand-orange" />
                Processando os dados para montar o gráfico…
              </p>
              <div className="flex h-[220px] items-end gap-3 px-2">
                {[55, 80, 40, 95, 65, 30, 75].map((height, index) => (
                  <Skeleton className="flex-1" key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
          ) : props.error ? (
            <ErrorState compact error={props.error} onRetry={props.onRetry} />
          ) : result ? (
            <VisualizationRenderer
              onUseRecommended={() => props.onSelectVisualization(props.model.resolved.recommended)}
              result={result}
              spec={spec}
              totalsResult={props.totalsResult}
            />
          ) : null}
        </div>
        {metricDetail ? (
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

      {result && (insights.length > 0 || props.explorations.length > 0) ? (
        <Card className="px-3 pt-3.5 pb-3">
          {insights.length > 0 ? (
            <>
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
            </>
          ) : null}
          {props.explorations.length > 0 ? (
            <div
              className={cn(
                'flex flex-wrap items-start gap-3',
                insights.length > 0 && 'mt-3 border-t border-line pt-3',
              )}
            >
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
              to="/inteligencia?origem=explorar"
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
        <Button onClick={props.onAddToDashboard}>
          <LayoutGrid aria-hidden className="h-4 w-4" />
          Adicionar ao dashboard
        </Button>
        <ExportMenu
          exporting={props.exporting}
          formats={props.exportFormats}
          onExport={props.onExport}
        />
      </div>
      <p className="text-[11px] text-ink-soft">{statusParts.join(' · ')}</p>
      {planLabel ? (
        <p className="-mt-2 text-[11px] text-ink-soft">{planLabel} · data mesh AWS</p>
      ) : null}
    </div>
  );
}
