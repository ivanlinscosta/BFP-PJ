import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { VisualizationType } from '@bfp/domain';
import { describeAnalysisSpec } from '@bfp/shared';
import { Badge, CertificationBadge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState } from '@/components/states/states';
import {
  useDimensionCatalog,
  useMetricCatalog,
  useMetricDetail,
  useSpecLabels,
} from '@/features/catalog/hooks';
import { getAnalysis } from '@/features/explorer/api';
import {
  AddToDashboardDialog,
  SaveAnalysisDialog,
  ShareDialog,
} from '@/features/explorer/components/action-dialogs';
import { DataLibrary } from '@/features/explorer/components/data-library';
import { EmptyCanvas } from '@/features/explorer/components/empty-canvas';
import { QueryBuilder } from '@/features/explorer/components/query-builder';
import { ResultCanvas } from '@/features/explorer/components/result-canvas';
import {
  EmptySidePanel,
  MetricTrustCard,
  ResultSidePanel,
  type VisualizationSettings,
} from '@/features/explorer/components/side-panel';
import type { DraggedItem } from '@/features/explorer/dnd';
import { buildNextExplorations } from '@/features/explorer/explorations';
import { useAnalysisResult } from '@/features/explorer/hooks';
import {
  MONTH_DIMENSION_ID,
  parseSpecParam,
  pruneToDatasets,
  requiredDatasetsFor,
  resolveMonthDimension,
  resolveVisualization,
  SPEC_QUERY_PARAM,
  visualizationAvailability,
} from '@/features/explorer/spec';
import { useAnalysisStore } from '@/features/explorer/store';
import { useFeatureFlags } from '@/features/admin/hooks';
import { downloadCsv } from '@/features/viz/csv';
import { useMeshDatasets } from '@/features/mesh/api';
import { DatasetPicker } from '@/features/mesh/dataset-picker';
import { capitalize } from '@/lib/format';

type DialogName = 'save' | 'share' | 'dashboard' | null;

export function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const store = useAnalysisStore();
  const { spec } = store;
  const metricsQuery = useMetricCatalog();
  const dimensionsQuery = useDimensionCatalog();
  const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);
  const dimensions = useMemo(() => dimensionsQuery.data ?? [], [dimensionsQuery.data]);
  const labels = useSpecLabels();
  const flags = useFeatureFlags();
  const mesh = useMeshDatasets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [settings, setSettings] = useState<VisualizationSettings>({
    sort: 'DESC',
    showValues: true,
    showTable: false,
    showLegend: false,
  });

  // Deep links: ?spec=<AnalysisSpec JSON> (catalog, customer 360, AI) or ?analysis=<saved id>.
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    const rawSpec = searchParams.get(SPEC_QUERY_PARAM);
    const analysisId = searchParams.get('analysis');
    const key = rawSpec ?? analysisId;
    if (!key || handledLink.current === key) return;
    handledLink.current = key;
    const { loadAnalysis } = useAnalysisStore.getState();

    if (rawSpec) {
      const parsed = parseSpecParam(rawSpec);
      if (parsed) loadAnalysis(parsed);
      setSearchParams({}, { replace: true });
      return;
    }

    getAnalysis(analysisId!)
      .then((analysis) => {
        loadAnalysis(analysis, { id: analysis.id, name: analysis.name });
        setSearchParams({}, { replace: true });
      })
      .catch((error: unknown) => setLoadError(error));
  }, [searchParams, setSearchParams]);

  const activeMetrics = metrics.filter((metric) =>
    spec.metrics.some((selected) => selected.id === metric.id),
  );
  const selectedDatasets = spec.datasets ?? [];
  const datasetName = (id: string) => mesh.data?.items.find((item) => item.id === id)?.name ?? id;
  const missingDatasets = requiredDatasetsFor(spec, metrics, dimensions).filter(
    (id) => !selectedDatasets.includes(id),
  );
  // The engine is only triggered over bases the user selected and that cover the analysis.
  const engineReady = selectedDatasets.length > 0 && missingDatasets.length === 0;
  const result = useAnalysisResult(spec, { enabled: engineReady });
  const type = resolveVisualization(spec, dimensions);
  const totalsSpec = useMemo(
    () => ({
      ...spec,
      dimensions: spec.dimensions.slice(0, 1),
      visualization: { type: 'TABLE' as const },
      comparison: undefined,
    }),
    [spec],
  );
  const totals = useAnalysisResult(totalsSpec, { enabled: engineReady && type === 'HEATMAP' });
  const metricDetail = useMetricDetail(spec.metrics[0]?.id);
  const explorations = buildNextExplorations(spec, metrics, dimensions);
  const options = visualizationAvailability(spec, dimensions);
  const hasAnalysis = spec.metrics.length > 0;
  const allCertified =
    activeMetrics.length > 0 &&
    activeMetrics.every((metric) => metric.certificationStatus === 'CERTIFIED');
  const description = describeAnalysisSpec(spec, labels);
  const saveStatus = store.saved
    ? store.dirty
      ? 'Alterações não salvas'
      : 'Análise salva'
    : 'Sem alterações salvas';

  function handleToggle(item: DraggedItem) {
    if (item.kind === 'metric') {
      if (spec.metrics.some((metric) => metric.id === item.id)) store.removeMetric(item.id);
      else store.addMetric(item.id);
      return;
    }

    if (item.id === MONTH_DIMENSION_ID) {
      const existing = spec.dimensions.find((dimension) => dimension.granularity === 'month');
      if (existing) {
        store.removeDimension(existing.id);
        return;
      }
      const month = resolveMonthDimension(activeMetrics, dimensions);
      if (month) store.addDimension(month.id, 'month');
      return;
    }

    if (spec.dimensions.some((dimension) => dimension.id === item.id))
      store.removeDimension(item.id);
    else store.addDimension(item.id);
  }

  return (
    <div>
      <PageHeader
        actions={
          hasAnalysis ? (
            <>
              <Badge tone="success" uppercase>
                Ativo
              </Badge>
              {allCertified ? <CertificationBadge status="CERTIFIED" /> : null}
            </>
          ) : undefined
        }
        subtitle="Monte sua análise combinando métricas, dimensões e filtros."
        title="Explorar dados"
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[88px] lg:self-start">
          <DataLibrary
            activeMetrics={activeMetrics}
            dimensions={dimensions}
            datasetName={datasetName}
            loading={metricsQuery.isLoading || dimensionsQuery.isLoading}
            selectedDatasets={selectedDatasets}
            metrics={metrics}
            monthSelected={spec.dimensions.some((dimension) => dimension.granularity === 'month')}
            onToggle={handleToggle}
            selectedDimensionIds={spec.dimensions.map((dimension) => dimension.id)}
            selectedMetricIds={spec.metrics.map((metric) => metric.id)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {metricsQuery.isError ? (
            <ErrorState
              compact
              error={metricsQuery.error}
              onRetry={() => void metricsQuery.refetch()}
            />
          ) : null}
          {loadError ? (
            <Notice tone="error" title="Não foi possível abrir a análise salva">
              Ela pode ter sido removida ou não estar compartilhada com você.
            </Notice>
          ) : null}

          <QueryBuilder
            datasets={selectedDatasets.map((id) => ({ id, name: datasetName(id) }))}
            onPickDatasets={() => setPickerOpen(true)}
            onRemoveDataset={(id) =>
              store.setSpec(
                pruneToDatasets(
                  spec,
                  selectedDatasets.filter((item) => item !== id),
                  metrics,
                  dimensions,
                ),
              )
            }
            dimensions={dimensions}
            labels={labels}
            metrics={metrics}
            onAdd={handleToggle}
            onAddFilter={store.addFilter}
            onClear={store.clearAnalysis}
            onDateRangeChange={store.setDateRange}
            onRemoveDimension={store.removeDimension}
            onRemoveFilter={store.removeFilter}
            onRemoveMetric={store.removeMetric}
            onUpdateFilter={store.updateFilter}
            spec={spec}
          />

          {store.notice ? (
            <Notice
              action={
                <button
                  className="text-xs font-semibold underline"
                  onClick={store.dismissNotice}
                  type="button"
                >
                  Ok
                </button>
              }
              tone="success"
            >
              {store.notice.message}
            </Notice>
          ) : null}

          {hasAnalysis && missingDatasets.length > 0 ? (
            <Notice
              action={
                <button
                  className="text-xs font-semibold underline"
                  onClick={() => setPickerOpen(true)}
                  type="button"
                >
                  Selecionar bases
                </button>
              }
              tone="warning"
              title="Selecione as bases de dados da análise"
            >
              Esta combinação precisa de {missingDatasets.map(datasetName).join(' e ')}. O motor só
              consulta e une as bases que você escolher.
            </Notice>
          ) : null}

          {!hasAnalysis ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_248px]">
              <EmptyCanvas
                onPickDatasets={() => setPickerOpen(true)}
                hasDatasets={selectedDatasets.length > 0}
              />
              <EmptySidePanel />
            </div>
          ) : (
            <>
              <p className="-mt-1 text-sm text-ink-soft">{capitalize(description.sentence)}</p>
              <div
                className={
                  type === 'HEATMAP'
                    ? 'flex flex-col gap-4'
                    : 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_256px]'
                }
              >
                <ResultCanvas
                  canExport={flags.csvExport && Boolean(result.data && result.data.rows.length > 0)}
                  error={result.error}
                  explorations={explorations}
                  fetching={result.isFetching}
                  labels={labels}
                  loading={result.isLoading || !engineReady}
                  metricDetail={metricDetail.data}
                  onAddToDashboard={() => setDialog('dashboard')}
                  onExplore={(exploration) =>
                    store.applyOperations(exploration.operations, exploration.message)
                  }
                  onExport={() =>
                    result.data && downloadCsv(result.data, store.saved?.name ?? description.title)
                  }
                  onRetry={() => void result.refetch()}
                  onSave={() => setDialog('save')}
                  onShare={() => setDialog('share')}
                  onTypeChange={(value: VisualizationType) => store.setVisualization(value)}
                  options={options}
                  result={result.data}
                  saveStatus={saveStatus}
                  settings={settings}
                  showInlineExplorations={type === 'HEATMAP'}
                  spec={spec}
                  totalsResult={totals.data}
                  type={type}
                />
                {type !== 'HEATMAP' ? (
                  <div className="flex flex-col gap-3">
                    <ResultSidePanel
                      explorations={explorations}
                      onExplore={(exploration) =>
                        store.applyOperations(exploration.operations, exploration.message)
                      }
                      onSettingsChange={setSettings}
                      onTypeChange={(value) => store.setVisualization(value)}
                      options={options}
                      result={result.data}
                      settings={settings}
                      type={type}
                    />
                    <MetricTrustCard detail={metricDetail.data} />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {dialog === 'save' ? (
        <SaveAnalysisDialog
          defaultName={description.title}
          existing={store.saved}
          onClose={() => setDialog(null)}
          onSaved={(analysis) => store.markSaved({ id: analysis.id, name: analysis.name })}
          open
          spec={spec}
        />
      ) : null}
      {pickerOpen ? (
        <DatasetPicker
          onApply={(ids) => store.setSpec(pruneToDatasets(spec, ids, metrics, dimensions))}
          onClose={() => setPickerOpen(false)}
          open
          selected={selectedDatasets}
        />
      ) : null}
      {dialog === 'share' ? (
        <ShareDialog onClose={() => setDialog(null)} open saved={store.saved} spec={spec} />
      ) : null}
      {dialog === 'dashboard' ? (
        <AddToDashboardDialog
          analysis={store.saved}
          defaultName={description.title}
          onClose={() => setDialog(null)}
          onSaved={(analysis) => store.markSaved({ id: analysis.id, name: analysis.name })}
          open
          spec={spec}
        />
      ) : null}
    </div>
  );
}
