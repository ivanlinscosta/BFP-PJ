import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AnalysisSpec } from '@bfp/domain';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState } from '@/components/states/states';
import { SaveAnalysisDialog } from '@/features/explorer/components/action-dialogs';
import { useAnalysisStore } from '@/features/explorer/store';
import { getSavedStudy } from '@/features/intelligence/api';
import { StudyView } from '@/features/intelligence/study-view';
import { useMeshDatasets } from '@/features/mesh/api';
import { formatRelative } from '@/lib/format';
import { exportElementToPdf, PDF_IGNORE_ATTRIBUTE } from '@/lib/pdf';

/** A study saved from Inteligência PJ, reopened from Minhas análises → Estudos. */
export function SavedStudyPage() {
  const { studyId = '' } = useParams();
  const navigate = useNavigate();
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const mesh = useMeshDatasets();
  const saved = useQuery({
    queryKey: ['saved-studies', studyId],
    queryFn: () => getSavedStudy(studyId),
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<{ spec: AnalysisSpec; name: string } | null>(null);
  const breadcrumbs = [
    { label: 'Minhas análises', to: '/analises' },
    { label: 'Estudos', to: '/analises?aba=estudos' },
  ];

  if (saved.isLoading) {
    return (
      <div aria-label="Carregando estudo" className="flex flex-col gap-4" role="status">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (saved.isError || !saved.data) {
    return (
      <div>
        <PageHeader breadcrumbs={[...breadcrumbs, { label: 'Estudo' }]} title="Estudo" />
        <Card>
          <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
        </Card>
      </div>
    );
  }

  const { study } = saved.data;
  const datasetNames = (saved.data.datasets ?? []).map(
    (id) => mesh.data?.items.find((dataset) => dataset.id === id)?.name ?? id,
  );

  async function exportPdf() {
    if (!contentRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportElementToPdf(contentRef.current, { title: study.title, subtitle: study.period });
    } catch {
      setExportError('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        actions={
          <Button disabled={exporting} onClick={() => void exportPdf()}>
            <FileDown aria-hidden className="h-4 w-4" />
            {exporting ? 'Gerando PDF…' : 'Baixar em PDF'}
          </Button>
        }
        breadcrumbs={[...breadcrumbs, { label: saved.data.name }]}
        subtitle={`Pergunta: “${saved.data.prompt}” · salvo ${formatRelative(saved.data.createdAt)}${
          datasetNames.length ? ` · bases: ${datasetNames.join(', ')}` : ''
        }`}
        title={saved.data.name}
      />
      {exportError ? (
        <Notice className="mb-3" tone="error">
          {exportError}
        </Notice>
      ) : null}
      <p {...{ [PDF_IGNORE_ATTRIBUTE]: '' }} className="mb-3 text-xs text-ink-soft">
        Os números são os do momento em que o estudo foi salvo.
      </p>
      <div ref={contentRef}>
        <Card className="px-5 py-4">
          <p className="m-0 text-[15px] leading-relaxed text-ink">{study.summary}</p>
          <StudyView
            onOpen={(spec) => {
              loadAnalysis(spec);
              navigate('/explorar');
            }}
            onSave={(spec, name) => setSaveTarget({ spec, name })}
            study={study}
          />
        </Card>
      </div>
      {saveTarget ? (
        <SaveAnalysisDialog
          defaultName={saveTarget.name}
          existing={null}
          onSaved={() => undefined}
          onClose={() => setSaveTarget(null)}
          open
          spec={saveTarget.spec}
        />
      ) : null}
    </div>
  );
}
