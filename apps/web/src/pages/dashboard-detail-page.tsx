import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Pencil, Star } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { sharingLabel } from '@/components/ui/visibility-picker';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState } from '@/components/states/states';
import {
  getDashboard,
  setDashboardFavorite,
  type DashboardCardSummary,
} from '@/features/dashboards/api';
import type { SavedAnalysis } from '@/features/explorer/api';
import { useAnalysisResult, useMissingDatasets } from '@/features/explorer/hooks';
import { useAnalysisStore } from '@/features/explorer/store';
import { VisualizationRenderer } from '@/features/viz/visualization-renderer';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

function DashboardTile({
  summary,
  analysis,
}: {
  summary: DashboardCardSummary;
  analysis: SavedAnalysis | undefined;
}) {
  const navigate = useNavigate();
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const result = useAnalysisResult(
    analysis ?? { metrics: [], dimensions: [], filters: [], visualization: { type: 'AUTO' } },
    {
      enabled: Boolean(analysis),
    },
  );
  const missingDatasets = useMissingDatasets(
    analysis ?? { metrics: [], dimensions: [], filters: [], visualization: { type: 'AUTO' } },
  );
  const uncovered =
    Boolean(analysis) &&
    missingDatasets !== null &&
    (missingDatasets.length > 0 || (analysis?.datasets ?? []).length === 0);

  return (
    <Card className="flex min-h-[320px] flex-col px-4 pt-4 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-base font-semibold text-brand-navy">{summary.title}</h2>
          <p className="mt-1 text-xs text-ink-soft">{summary.subtitle}</p>
        </div>
        {analysis ? (
          <button
            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-navy hover:underline"
            onClick={() => {
              loadAnalysis(
                analysis,
                analysis.access !== 'VIEW' ? { id: analysis.id, name: analysis.name } : null,
              );
              navigate('/explorar');
            }}
            type="button"
          >
            Explorar
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex-1">
        {!analysis ? (
          <EmptyState
            className="py-8"
            description="A análise foi removida ou deixou de ser compartilhada."
            title="Análise indisponível"
          />
        ) : uncovered ? (
          <EmptyState
            className="py-8"
            description={
              missingDatasets && missingDatasets.length > 0
                ? `Selecione a base ${missingDatasets.join(', ')} no Explorar e salve a análise novamente.`
                : 'Abra no Explorar, selecione as bases do data mesh e salve a análise novamente.'
            }
            title="Bases de dados pendentes"
          />
        ) : result.isLoading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Carregando card">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton className="h-5" key={index} />
            ))}
          </div>
        ) : result.isError ? (
          <ErrorState compact error={result.error} onRetry={() => void result.refetch()} />
        ) : result.data && result.data.rows.length > 0 ? (
          analysis ? (
            <VisualizationRenderer result={result.data} spec={analysis} />
          ) : null
        ) : (
          <EmptyState className="py-8" title="Sem dados para este recorte" />
        )}
      </div>
    </Card>
  );
}

export function DashboardDetailPage() {
  const { dashboardId = '' } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId),
  });
  const favorite = useMutation({
    mutationFn: (value: boolean) => setDashboardFavorite(dashboardId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-80" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Card>
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </Card>
    );
  }

  const { dashboard, analyses } = detail.data;
  return (
    <div>
      <PageHeader
        actions={
          <>
            <Button
              aria-pressed={dashboard.isFavorite}
              onClick={() => favorite.mutate(!dashboard.isFavorite)}
            >
              <Star
                aria-hidden
                className={cn(
                  'h-4 w-4',
                  dashboard.isFavorite && 'fill-brand-orange text-brand-orange',
                )}
              />
              {dashboard.isFavorite ? 'Favorito' : 'Favoritar'}
            </Button>
            {dashboard.access !== 'VIEW' ? (
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-orange-hover"
                to={`/dashboards/${dashboard.id}/editar`}
              >
                <Pencil aria-hidden className="h-4 w-4" />
                Editar dashboard
              </Link>
            ) : null}
          </>
        }
        breadcrumbs={[{ label: 'Dashboards', to: '/dashboards' }, { label: dashboard.name }]}
        subtitle={dashboard.description}
        title={dashboard.name}
      />
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
        <span>
          {dashboard.access === 'OWNER' ? 'Você' : dashboard.ownerName} · atualizado{' '}
          {formatRelative(dashboard.updatedAt)}
        </span>
        <Badge tone="tint">
          {dashboard.access === 'OWNER'
            ? sharingLabel(dashboard.visibility, dashboard.team)
            : dashboard.access === 'EDIT'
              ? `Pode editar · ${dashboard.team}`
              : `Pode visualizar · ${dashboard.team}`}
        </Badge>
      </div>
      {dashboard.cardSummaries.length === 0 ? (
        <Card>
          <EmptyState
            action={
              <Link
                className="text-sm font-semibold text-brand-navy hover:underline"
                to={`/dashboards/${dashboard.id}/editar`}
              >
                Adicionar análises
              </Link>
            }
            description="Adicione análises salvas para montar este painel."
            title="Dashboard vazio"
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {dashboard.cardSummaries.map((summary) => (
            <DashboardTile
              analysis={analyses[summary.analysisId]}
              key={summary.cardId}
              summary={summary}
            />
          ))}
        </div>
      )}
    </div>
  );
}
