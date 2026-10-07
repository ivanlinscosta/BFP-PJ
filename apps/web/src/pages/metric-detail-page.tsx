import { ArrowRight, BadgeCheck, Plus, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { CertificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState } from '@/components/states/states';
import { useMetricDetail } from '@/features/catalog/hooks';
import { useAnalysisStore } from '@/features/explorer/store';
import { createEmptySpec } from '@/features/explorer/spec';
import { formatMinutes, formatShare } from '@/lib/format';
import { cn } from '@/lib/utils';

const FORMAT_LABELS = { percent: 'Percentual', currency: 'Moeda (R$)', number: 'Número' } as const;
const DOMAIN_LABELS: Record<string, string> = {
  acquisition: 'Aquisição',
  media: 'Mídia',
  customer360: 'Clientes',
  products: 'Produtos',
};

/** Governed metric definition (reference screen 06). */
export function MetricDetailPage() {
  const { metricId = '' } = useParams();
  const navigate = useNavigate();
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const detail = useMetricDetail(metricId);

  if (detail.isLoading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Carregando métrica">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64" />
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

  const { metric, calculation, trust, lineage, compatibleDimensions } = detail.data;
  const trustRows: Array<[string, string]> = [
    ['Owner', trust.owner],
    ['Última atualização', formatMinutes(trust.freshnessMinutes)],
    ['SLO', `< ${formatMinutes(trust.sloMinutes)}`],
    ['Qualidade', trust.qualityRatio !== null ? formatShare(trust.qualityRatio) : '—'],
  ];

  function openInExplorer() {
    loadAnalysis({
      ...createEmptySpec(),
      datasets: metric.datasets ?? [],
      metrics: [{ id: metric.id }],
    });
    navigate('/explorar');
  }

  return (
    <div className="px-2">
      <PageHeader
        actions={
          <CertificationBadge className="mt-12" status={metric.certificationStatus} uppercase />
        }
        breadcrumbs={[
          { label: 'Catálogo', to: '/catalogo' },
          { label: 'Métricas', to: '/catalogo' },
          { label: metric.shortName },
        ]}
        title={metric.shortName}
      />
      <p className="-mt-1 mb-7 text-base text-ink-soft">{metric.description}</p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_344px]">
        <Card className="px-6 pt-6 pb-6">
          <h2 className="m-0 text-[22px] font-semibold text-brand-navy">Definição de negócio</h2>
          <p className="mt-6 text-sm leading-relaxed text-ink-soft">{metric.businessDefinition}</p>
          <div className="mt-6 flex items-center gap-12 rounded-[var(--radius-card)] bg-muted px-5 py-6">
            <span className="text-sm font-semibold text-brand-navy">Cálculo</span>
            {calculation.kind === 'RATIO' && 'numerator' in calculation ? (
              <div
                aria-label={`${calculation.numerator.label} dividido por ${calculation.denominator.label}${calculation.multiplier !== 1 ? ` vezes ${calculation.multiplier}` : ''}`}
                className="flex items-center gap-8"
                role="math"
              >
                <div className="flex flex-col items-center">
                  <span className="pb-2 text-[17px] font-semibold text-brand-navy">
                    {calculation.numerator.label}
                  </span>
                  <span aria-hidden className="h-px w-[168px] bg-line-strong" />
                  <span className="pt-2 text-[17px] font-semibold text-brand-navy">
                    {calculation.denominator.label}
                  </span>
                </div>
                {calculation.multiplier !== 1 ? (
                  <span className="text-base text-ink-soft">× {calculation.multiplier}</span>
                ) : null}
              </div>
            ) : (
              <code className="text-sm text-brand-navy">
                {'expression' in calculation ? calculation.expression : metric.formula}
              </code>
            )}
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-4">
            {(
              [
                ['Formato', FORMAT_LABELS[metric.format]],
                ['Domínio', DOMAIN_LABELS[metric.domain] ?? metric.domain],
                ['Versão', `v${metric.version}`],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-soft">{label}</dt>
                <dd className="m-0 mt-1.5 text-sm font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="h-fit px-6 pt-6 pb-6">
          <h2 className="m-0 flex items-center gap-2 text-[22px] font-semibold text-brand-navy">
            <ShieldCheck aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            Confiança no dado
          </h2>
          <dl className="mt-6 flex flex-col gap-5">
            {trustRows.map(([label, value]) => (
              <div className="flex justify-between gap-3 text-sm" key={label}>
                <dt className="text-ink-soft">{label}</dt>
                <dd className="m-0 font-semibold text-brand-navy">{value}</dd>
              </div>
            ))}
          </dl>
          <hr className="my-5 border-line" />
          <p className="flex gap-2 text-xs leading-relaxed text-ink-soft">
            <BadgeCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {metric.certificationStatus === 'CERTIFIED'
              ? 'Definição validada pelo time responsável. Uma referência única para análises e audiências.'
              : 'Métrica em validação. Use com atenção e confirme a definição com o owner antes de decisões críticas.'}
          </p>
        </Card>
      </div>

      <h2 className="mt-10 text-[22px] font-semibold text-brand-navy">Dimensões compatíveis</h2>
      <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
        {compatibleDimensions.map((dimension) => (
          <li
            className="rounded border border-line bg-tint px-2.5 py-1.5 text-[13px] font-medium text-brand-navy"
            key={dimension.id}
          >
            {dimension.label}
          </li>
        ))}
      </ul>

      <Card className="mt-7 px-6 pt-6 pb-6">
        <h2 className="m-0 text-[22px] font-semibold text-brand-navy">Da origem à decisão</h2>
        <ol
          aria-label="Linhagem da métrica"
          className="m-0 mt-6 grid list-none items-center gap-3 p-0 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"
        >
          {lineage.stages.map((stage, index) => (
            <li className="contents" key={stage.kind}>
              <div
                className={cn(
                  'flex min-h-[76px] flex-col justify-center rounded-[var(--radius-control)] px-3 py-3',
                  stage.kind === 'METRIC' || stage.kind === 'USAGE' ? 'bg-tint' : 'bg-muted',
                )}
              >
                <p className="text-[11px] tracking-wide text-ink-soft uppercase">{stage.label}</p>
                <p className="mt-2 text-sm font-semibold text-brand-navy">{stage.value}</p>
              </div>
              {index < lineage.stages.length - 1 ? (
                <ArrowRight aria-hidden className="mx-auto hidden h-4 w-4 text-ink-soft lg:block" />
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-4 text-[15px] font-semibold text-white hover:bg-brand-orange-hover"
          onClick={openInExplorer}
          type="button"
        >
          <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
          Usar na análise
        </button>
        <p className="text-[13px] text-ink-soft">
          Abre Explorar com a métrica adicionada, pronta para combinar com dimensões e filtros.
        </p>
      </div>
    </div>
  );
}
