import { CalendarDays, ChartNoAxesColumn, Layers, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CertificationBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingRows } from '@/components/states/states';
import type { CatalogMetric } from '@/features/catalog/api';
import { useMetricCatalog } from '@/features/catalog/hooks';
import { useMeshDatasets } from '@/features/mesh/api';
import { useAnalysisStore } from '@/features/explorer/store';
import { createEmptySpec } from '@/features/explorer/spec';
import { normalizeText } from '@/lib/text';
import { cn } from '@/lib/utils';

const FORMAT_LABELS = { percent: 'Percentual', currency: 'Moeda (R$)', number: 'Número' } as const;

const NEXT_STEPS = [
  { Icon: Layers, title: 'Compare por dimensão', text: 'Explore por canal, campanha ou segmento.' },
  {
    Icon: SlidersHorizontal,
    title: 'Delimite com filtros',
    text: 'Foque nas empresas e recortes relevantes.',
  },
  {
    Icon: CalendarDays,
    title: 'Escolha o período',
    text: 'Defina o intervalo que faz sentido para sua análise.',
  },
];

/** Guided onboarding: pick the metric that starts the analysis (reference "Adicionar análise"). */
export function AddAnalysisPage() {
  const navigate = useNavigate();
  const metricsQuery = useMetricCatalog();
  const mesh = useMeshDatasets();
  const datasetName = (id: string) => mesh.data?.items.find((item) => item.id === id)?.name ?? id;
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const available = useMemo(() => {
    const all = metricsQuery.data ?? [];
    const normalized = normalizeText(query);
    const base = normalized
      ? all.filter((metric) =>
          normalizeText(`${metric.shortName} ${metric.name} ${metric.category}`).includes(
            normalized,
          ),
        )
      : all;
    return [...base].sort((left, right) => (left.libraryOrder ?? 99) - (right.libraryOrder ?? 99));
  }, [metricsQuery.data, query]);
  // Featured metrics first, then every governed metric grouped by business category.
  const groups = useMemo(() => {
    const featured = query ? [] : available.filter((metric) => metric.featured);
    const rest = available.filter((metric) => !featured.includes(metric));
    const byCategory = new Map<string, CatalogMetric[]>();
    for (const metric of rest) {
      byCategory.set(metric.category, [...(byCategory.get(metric.category) ?? []), metric]);
    }
    return [
      ...(featured.length ? [{ title: 'Mais usadas', items: featured }] : []),
      ...[...byCategory.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
        .map(([title, items]) => ({ title, items })),
    ];
  }, [available, query]);
  const selected = (metricsQuery.data ?? []).find(
    (metric) => metric.id === (selectedId ?? available[0]?.id),
  );

  function continueToPlayground() {
    if (!selected) return;
    loadAnalysis({
      ...createEmptySpec(),
      datasets: selected.datasets ?? [],
      metrics: [{ id: selected.id }],
    });
    navigate('/explorar');
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Explorar', to: '/explorar' }, { label: 'Adicionar análise' }]}
        subtitle="Escolha uma métrica para começar. No playground, combine dimensões, filtros e período para responder à sua pergunta de negócio."
        title="Adicionar análise"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_536px]">
        <Card className="px-6 pt-6 pb-10">
          <h2 className="m-0 text-xl font-semibold text-brand-navy">
            Qual métrica você quer analisar?
          </h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Selecione uma opção da biblioteca de dados.
          </p>
          <SearchInput
            aria-label="Buscar uma métrica"
            containerClassName="mt-4"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar uma métrica"
            value={query}
          />
          <p className="mt-6 text-xs text-ink-soft">{available.length} métricas disponíveis</p>
          {metricsQuery.isLoading ? (
            <LoadingRows className="mt-3" rows={7} />
          ) : metricsQuery.isError ? (
            <ErrorState
              compact
              error={metricsQuery.error}
              onRetry={() => void metricsQuery.refetch()}
            />
          ) : (
            <div
              aria-label="Métricas disponíveis"
              className="mt-2 flex max-h-[680px] flex-col gap-1.5 overflow-y-auto pr-1"
              role="radiogroup"
            >
              {groups.map((group) => (
                <div className="flex flex-col gap-1.5" key={group.title}>
                  <p className="mt-3 mb-0.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase">
                    {group.title}
                  </p>
                  {group.items.map((metric) => {
                    const checked = metric.id === selected?.id;
                    return (
                      <label
                        className={cn(
                          'flex min-h-[57px] cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-2 transition-colors',
                          checked
                            ? 'border-peach bg-cream'
                            : 'border-line bg-card hover:border-line-strong',
                        )}
                        key={metric.id}
                      >
                        <input
                          checked={checked}
                          className="h-[18px] w-[18px] accent-[var(--color-brand-orange)]"
                          name="metric"
                          onChange={() => setSelectedId(metric.id)}
                          type="radio"
                        />
                        <span className="flex flex-col items-start gap-1">
                          <span className="flex items-center gap-2 text-sm text-ink">
                            <ChartNoAxesColumn
                              aria-hidden
                              className="h-4 w-4 text-brand-orange"
                              strokeWidth={2.5}
                            />
                            <span className={checked ? 'font-semibold' : undefined}>
                              {metric.shortName}
                            </span>
                          </span>
                          {metric.certificationStatus === 'CERTIFIED' ? (
                            <CertificationBadge
                              className="ml-6 h-[22px] text-[11px]"
                              status="CERTIFIED"
                            />
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="px-6 pt-6 pb-8">
          {selected ? (
            <>
              <p className="text-xs text-ink-soft">Métrica selecionada</p>
              <h2 className="mt-3 text-[22px] font-semibold text-brand-navy">
                {selected.shortName}
              </h2>
              {selected.certificationStatus === 'CERTIFIED' ? (
                <CertificationBadge className="mt-3" status="CERTIFIED" />
              ) : null}
              <section className="mt-6 rounded-[var(--radius-card)] bg-muted px-4 py-4">
                <h3 className="m-0 text-base font-semibold text-brand-navy">
                  O que esta métrica mede?
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink">{selected.description}</p>
                <p className="mt-3 text-xs text-ink-soft">
                  Base do data mesh:{' '}
                  {(selected.datasets ?? []).map((id) => datasetName(id)).join(' + ') || '—'}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  Owner: {selected.owner}
                  <span className="mx-2">·</span>
                  Formato: {FORMAT_LABELS[selected.format]}
                </p>
              </section>
              <hr className="my-6 border-line" />
              <h3 className="m-0 text-base font-semibold text-brand-navy">
                Sua pergunta ganha forma no playground
              </h3>
              <p className="mt-1 text-[13px] text-ink-soft">
                A métrica é o ponto de partida. Depois, você escolhe como explorar os dados.
              </p>
              <ul className="m-0 mt-5 flex list-none flex-col gap-5 p-0">
                {NEXT_STEPS.map((step) => (
                  <li className="flex gap-3" key={step.title}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-tint text-brand-navy">
                      <step.Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-brand-navy">
                        {step.title}
                      </span>
                      <span className="mt-1 block text-[13px] text-ink-soft">{step.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Selecione uma métrica para ver a definição.</p>
          )}
        </Card>
      </div>

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <p className="text-xs text-ink-soft">
            {selected ? 1 : 0} métrica selecionada para sua análise
          </p>
          {selected ? (
            <span className="mt-2 inline-flex h-[30px] items-center gap-2 rounded border border-peach bg-cream px-2.5 text-[13px] font-medium">
              {selected.shortName}
              <button
                aria-label={`Remover ${selected.shortName}`}
                className="text-ink-soft hover:text-ink"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/explorar')}>Voltar ao Explorer</Button>
          <Button disabled={!selected} onClick={continueToPlayground} variant="primary">
            Continuar no playground
          </Button>
        </div>
      </Card>
    </div>
  );
}
