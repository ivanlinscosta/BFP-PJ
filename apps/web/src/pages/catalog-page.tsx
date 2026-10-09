import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, ChartNoAxesColumn, Database, Layers, Package, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge, CertificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState } from '@/components/states/states';
import { fetchDataProducts, fetchDimensions, fetchMetrics } from '@/features/catalog/api';
import { useDebounced } from '@/lib/use-debounced';
import { normalizeText } from '@/lib/text';
import { BaseVsProduct } from '@/features/catalog/base-vs-product';
import { useMeshDatasets } from '@/features/mesh/api';
import { AtlanBadge } from '@/features/mesh/dataset-picker';
import { IntegrationsBanner } from '@/features/mesh/integrations-banner';

type CatalogTab = 'datasets' | 'metrics' | 'dimensions' | 'products';

const DOMAIN_LABELS: Record<string, string> = {
  acquisition: 'Aquisição',
  media: 'Mídia',
  customer360: 'Clientes',
  products: 'Produtos',
};
const TYPE_LABELS: Record<string, string> = {
  string: 'Texto',
  enum: 'Lista',
  date: 'Data',
  number: 'Número',
  boolean: 'Sim/Não',
};

/** "Diária" for 1440 minutes, otherwise hours or minutes. */
function sloLabel(minutes: number) {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Diária' : `A cada ${minutes / 1440} dias`;
  if (minutes >= 60) return `A cada ${Math.round(minutes / 60)} h`;
  return `A cada ${minutes} min`;
}

function GridSkeleton() {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Carregando catálogo"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className="h-40" key={index} />
      ))}
    </div>
  );
}

/** Governed catalog: bases, metrics, dimensions and data products with unified search. */
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const requested = searchParams.get('aba');
  const tab: CatalogTab = (['datasets', 'metrics', 'dimensions', 'products'] as const).includes(
    requested as CatalogTab,
  )
    ? (requested as CatalogTab)
    : 'datasets';
  const setTab = (next: CatalogTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('aba', next);
    setSearchParams(params, { replace: true });
  };
  const mesh = useMeshDatasets();
  const q = useDebounced(search, 300);
  const common = { placeholderData: keepPreviousData, staleTime: 60_000 } as const;
  const metrics = useQuery({
    queryKey: ['catalog', 'metrics', q],
    queryFn: ({ signal }) => fetchMetrics(q, signal),
    ...common,
  });
  const dimensions = useQuery({
    queryKey: ['catalog', 'dimensions', q],
    queryFn: ({ signal }) => fetchDimensions(q, signal),
    ...common,
  });
  const products = useQuery({
    queryKey: ['catalog', 'products', q],
    queryFn: ({ signal }) => fetchDataProducts(q, signal),
    ...common,
  });
  // Metric names for the product cards (independent of the current search).
  const allMetrics = useQuery({
    queryKey: ['catalog', 'metrics', ''],
    queryFn: ({ signal }) => fetchMetrics('', signal),
    staleTime: 5 * 60_000,
  });
  const metricNameById = new Map(
    (allMetrics.data ?? []).map((metric) => [metric.id, metric.shortName]),
  );
  const active = { datasets: mesh, metrics, dimensions, products }[tab];
  const meshItems = (mesh.data?.items ?? []).filter((dataset) =>
    normalizeText(
      `${dataset.name} ${dataset.description} ${dataset.owner} ${dataset.location.table}`,
    ).includes(normalizeText(q)),
  );

  return (
    <div>
      <PageHeader
        subtitle="Bases do data mesh AWS, definições oficiais (Atlan), donos e confiabilidade de cada dado usado em análises e audiências."
        title="Catálogo"
      />
      <div className="mb-4">
        <IntegrationsBanner />
      </div>
      <SearchInput
        aria-label="Buscar no catálogo"
        containerClassName="max-w-xl"
        onChange={(event) => {
          setSearch(event.target.value);
          const params = new URLSearchParams(searchParams);
          if (event.target.value) params.set('q', event.target.value);
          else params.delete('q');
          setSearchParams(params, { replace: true });
        }}
        placeholder="Buscar bases, métricas, dimensões ou produtos de dados"
        value={search}
      />
      <Tabs
        className="mt-6 gap-6 [&>button]:pb-3 [&>button]:text-[15px]"
        idPrefix="catalog"
        items={[
          { value: 'datasets', label: `Bases de dados · ${mesh.data ? meshItems.length : '…'}` },
          { value: 'metrics', label: `Métricas · ${metrics.data?.length ?? '…'}` },
          { value: 'dimensions', label: `Dimensões · ${dimensions.data?.length ?? '…'}` },
          { value: 'products', label: `Produtos de dados · ${products.data?.length ?? '…'}` },
        ]}
        label="Seções do catálogo"
        onChange={setTab}
        value={tab}
      />
      <div
        aria-labelledby={`catalog-tab-${tab}`}
        className="mt-6"
        id={`catalog-panel-${tab}`}
        role="tabpanel"
      >
        {tab === 'datasets' || tab === 'products' ? (
          <BaseVsProduct className="mb-5" highlight={tab === 'datasets' ? 'base' : 'product'} />
        ) : null}
        {active.isLoading ? (
          <GridSkeleton />
        ) : active.isError ? (
          <Card>
            <ErrorState error={active.error} onRetry={() => void active.refetch()} />
          </Card>
        ) : tab === 'datasets' ? (
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
            {meshItems.map((dataset) => (
              <li key={dataset.id}>
                <Card className="flex h-full flex-col px-5 pt-5 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{DOMAIN_LABELS[dataset.domain] ?? dataset.domain}</Badge>
                    {dataset.atlan ? (
                      <AtlanBadge
                        status={dataset.atlan.certificateStatus}
                        url={dataset.atlan.url}
                      />
                    ) : null}
                    {!dataset.available ? <Badge tone="warning">Não publicada</Badge> : null}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-brand-navy">{dataset.name}</h2>
                  <p className="mt-1 flex-1 text-sm text-ink-soft">
                    {dataset.atlan?.description ?? dataset.description}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-ink-faint">Owner</dt>
                      <dd className="m-0 text-ink">
                        {dataset.atlan?.owners.join(', ') || dataset.owner}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Granularidade</dt>
                      <dd className="m-0 text-ink">{dataset.grain}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-ink-faint">Tabela (Glue)</dt>
                      <dd className="m-0">
                        <code className="text-ink">
                          {dataset.location.database}.{dataset.location.table}
                        </code>
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-ink-faint">Origem · chave de junção</dt>
                      <dd className="m-0 text-ink">
                        {dataset.sourceSystem} · {dataset.joinKey}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="mt-4 inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--radius-control)] bg-brand-navy px-3 text-[13px] font-semibold text-white hover:opacity-90"
                    to={`/catalogo/bases/${dataset.id}`}
                  >
                    <Table2 aria-hidden className="h-4 w-4" />
                    Ver dados da base
                  </Link>
                  <p className="mt-3 text-xs text-ink-soft">
                    {dataset.columns.length} colunas · {dataset.metricIds.length} métricas
                    governadas
                    {dataset.atlan?.terms.length
                      ? ` · Termos: ${dataset.atlan.terms.join(', ')}`
                      : ''}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ) : tab === 'metrics' ? (
          (metrics.data ?? []).length === 0 ? (
            <EmptyState
              icon={<ChartNoAxesColumn aria-hidden className="h-8 w-8" />}
              title="Nenhum item encontrado"
              description="Tente outro termo de busca."
            />
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
              {(metrics.data ?? []).map((metric) => (
                <li key={metric.id}>
                  <Card className="flex h-full flex-col px-5 pt-5 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="neutral">{DOMAIN_LABELS[metric.domain] ?? metric.domain}</Badge>
                      <CertificationBadge status={metric.certificationStatus} uppercase />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-brand-navy">
                      <Link className="hover:underline" to={`/catalogo/metricas/${metric.id}`}>
                        {metric.shortName}
                      </Link>
                    </h2>
                    <p className="mt-1.5 flex-1 text-sm text-ink-soft">{metric.description}</p>
                    <div className="mt-4 flex items-center justify-between text-[13px]">
                      <span className="text-ink-soft">Owner: {metric.owner}</span>
                      <Link
                        className="inline-flex items-center gap-1 font-semibold text-brand-navy hover:underline"
                        to={`/catalogo/metricas/${metric.id}`}
                      >
                        Ver definição
                        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'dimensions' ? (
          (dimensions.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Layers aria-hidden className="h-8 w-8" />}
              title="Nenhum item encontrado"
            />
          ) : (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Dimensão</TH>
                    <TH>Descrição</TH>
                    <TH>Tipo</TH>
                    <TH>Domínio</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {(dimensions.data ?? []).map((dimension) => (
                    <TR key={dimension.id}>
                      <TD className="font-semibold text-brand-navy">{dimension.label}</TD>
                      <TD className="text-ink-soft">{dimension.description}</TD>
                      <TD>{TYPE_LABELS[dimension.type] ?? dimension.type}</TD>
                      <TD>{DOMAIN_LABELS[dimension.domain] ?? dimension.domain}</TD>
                      <TD>
                        <CertificationBadge status={dimension.certificationStatus} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )
        ) : tab === 'products' ? (
          (products.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Database aria-hidden className="h-8 w-8" />}
              title="Nenhum item encontrado"
            />
          ) : (
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
              {(products.data ?? []).map((product) => {
                const bases = (mesh.data?.items ?? []).filter(
                  (dataset) => dataset.dataProductId === product.id,
                );
                const metricNames = product.metricIds.map((id) => metricNameById.get(id) ?? id);
                return (
                  <li key={product.id}>
                    <Card className="flex h-full flex-col gap-3 px-5 py-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          {DOMAIN_LABELS[product.domain] ?? product.domain}
                        </Badge>
                        <Badge tone="tint">Produto de dados</Badge>
                      </div>
                      <div>
                        <h2 className="m-0 text-lg font-semibold text-brand-navy">
                          <Link className="hover:underline" to={`/catalogo/produtos/${product.id}`}>
                            {product.name}
                          </Link>
                        </h2>
                        <p className="m-0 mt-1 text-sm text-ink-soft">{product.description}</p>
                      </div>
                      <dl className="m-0 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <dt className="text-ink-faint">Dono do produto</dt>
                          <dd className="m-0 font-semibold text-ink">{product.owner}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-faint">Atualização (SLO)</dt>
                          <dd className="m-0 font-semibold text-ink">
                            {sloLabel(product.freshnessSLOMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-faint">Qualidade mínima</dt>
                          <dd className="m-0 font-semibold text-ink">
                            {Math.round(product.qualityThreshold * 100)}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-ink-faint">Camada gold</dt>
                          <dd className="m-0 font-semibold text-ink">{product.goldDataset}</dd>
                        </div>
                      </dl>
                      <div>
                        <p className="m-0 text-xs text-ink-faint">
                          Métricas certificadas · {product.metricIds.length}
                        </p>
                        <p className="m-0 mt-1 text-[13px] text-ink">
                          {metricNames.slice(0, 6).join(', ')}
                          {metricNames.length > 6 ? ` e mais ${metricNames.length - 6}` : ''}
                        </p>
                      </div>
                      <p className="m-0 text-xs text-ink-soft">
                        Fontes de negócio: {product.businessSources.join(', ')}
                      </p>
                      <Link
                        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--radius-control)] bg-brand-navy px-3 text-[13px] font-semibold text-white hover:opacity-90"
                        to={`/catalogo/produtos/${product.id}`}
                      >
                        <Package aria-hidden className="h-4 w-4" /> Ver produto de dados
                      </Link>
                      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                        <span className="text-xs text-ink-faint">Bases físicas:</span>
                        {bases.length === 0 ? (
                          <span className="text-xs text-ink-soft">
                            sem tabela própria (métricas calculadas sobre outras bases)
                          </span>
                        ) : (
                          bases.map((dataset) => (
                            <Link
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-navy hover:underline"
                              key={dataset.id}
                              to={`/catalogo/bases/${dataset.id}`}
                            >
                              <Database aria-hidden className="h-3.5 w-3.5" />
                              {dataset.location.table}
                            </Link>
                          ))
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
