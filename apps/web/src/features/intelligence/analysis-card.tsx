import {
  BarChart3,
  ExternalLink,
  FileDown,
  LayoutGrid,
  Lightbulb,
  Save,
  Table2,
} from 'lucide-react';
import { useState } from 'react';
import type { AnalysisSpec } from '@bfp/domain';
import { describeAnalysisSpec } from '@bfp/shared';
import { LoadingRows } from '@/components/states/states';
import { useDimensionCatalog, useSpecLabels } from '@/features/catalog/hooks';
import { useAnalysisResult, useMissingDatasets } from '@/features/explorer/hooks';
import { resolveVisualization } from '@/features/explorer/spec';
import { ResultView } from '@/features/viz/result-view';
import { capitalize } from '@/lib/format';
import { describeError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { PDF_EXPAND_ATTRIBUTE, PDF_IGNORE_ATTRIBUTE } from '@/lib/pdf';

const ignore = { [PDF_IGNORE_ATTRIBUTE]: '' };

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Save;
  label: string;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button
      className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-semibold text-brand-navy transition-colors hover:bg-muted disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/**
 * The analysis behind an answer, rendered inside the conversation: chart or table, the key
 * findings computed by the engine, where the data came from and what can be done with it.
 * The numbers come from the same governed query API used by the Explorer.
 */
export function AnalysisCard({
  spec,
  onOpen,
  onSave,
  onAddToDashboard,
  onExportPdf,
  exporting,
}: {
  spec: AnalysisSpec;
  onOpen(): void;
  onSave(): void;
  onAddToDashboard(): void;
  onExportPdf(): void;
  exporting: boolean;
}) {
  const labels = useSpecLabels();
  const dimensions = useDimensionCatalog();
  const result = useAnalysisResult(spec);
  const missing = useMissingDatasets(spec);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const description = describeAnalysisSpec(spec, labels);
  const chartType = resolveVisualization(spec, dimensions.data ?? []);
  const insights = (result.data?.insights ?? []).slice(0, 3);
  const plan = result.data?.metadata.plan;

  return (
    <section
      aria-label={`Análise: ${description.title}`}
      className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-line bg-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-semibold text-brand-navy">{description.title}</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {[...description.filters, capitalize(description.period)].join(' · ')}
          </p>
        </div>
        <div
          {...ignore}
          aria-label="Visualização"
          className="flex rounded-[var(--radius-control)] bg-muted p-0.5"
          role="group"
        >
          {(
            [
              ['chart', 'Gráfico', BarChart3],
              ['table', 'Tabela', Table2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              aria-pressed={view === value}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded px-2.5 text-xs font-semibold transition-colors',
                view === value ? 'bg-card text-brand-navy shadow-sm' : 'text-ink-soft',
              )}
              key={value}
              onClick={() => setView(value)}
              type="button"
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4">
        {missing && missing.length > 0 ? (
          <p className="text-sm text-ink-soft">
            Esta análise precisa de bases que não estão disponíveis para você.
          </p>
        ) : result.isLoading || (!result.data && !result.isError) ? (
          <LoadingRows rows={4} />
        ) : result.isError ? (
          <p className="text-sm text-ink-soft">{describeError(result.error).description}</p>
        ) : result.data && result.data.rows.length > 0 ? (
          <div className="max-h-[380px] overflow-auto" {...{ [PDF_EXPAND_ATTRIBUTE]: '' }}>
            <ResultView
              result={result.data}
              showLegend
              type={view === 'table' ? 'TABLE' : chartType}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Não há dados para esse recorte no período.</p>
        )}

        {insights.length > 0 ? (
          <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
            {insights.map((insight) => (
              <li className="flex gap-2 text-[13px] leading-relaxed text-ink" key={insight.id}>
                <Lightbulb
                  aria-hidden
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    insight.tone === 'attention' ? 'text-warning' : 'text-brand-orange',
                  )}
                />
                <span>
                  <span className="font-semibold">{insight.title.replace(/\.+$/, '')}.</span>{' '}
                  {insight.description}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-muted/50 px-2 py-1.5">
        <p className="m-0 px-2 text-[11px] text-ink-soft">
          {plan
            ? `Fonte: ${plan.datasets.map((dataset) => dataset.name).join(' + ')} · data mesh`
            : 'Fonte: métricas governadas'}
          {result.data ? ` · ${result.data.rows.length} linhas` : ''}
        </p>
        <div {...ignore} className="flex flex-wrap items-center">
          <ActionButton icon={ExternalLink} label="Abrir no Explorar" onClick={onOpen} />
          <ActionButton icon={Save} label="Salvar" onClick={onSave} />
          <ActionButton icon={LayoutGrid} label="Dashboard" onClick={onAddToDashboard} />
          <ActionButton
            disabled={exporting}
            icon={FileDown}
            label={exporting ? 'Gerando…' : 'PDF'}
            onClick={onExportPdf}
          />
        </div>
      </footer>
    </section>
  );
}
