import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Database, Package, Table2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState } from '@/components/states/states';
import { fetchDataProducts, fetchDimensions, fetchMetrics } from '@/features/catalog/api';
import { BaseVsProduct } from '@/features/catalog/base-vs-product';
import { useAnalysisStore } from '@/features/explorer/store';
import { useMeshDatasets } from '@/features/mesh/api';

const DOMAIN_LABELS: Record<string, string> = {
  acquisition: 'Aquisição',
  media: 'Mídia',
  customer360: 'Clientes',
  products: 'Produtos',
};
const CERTIFICATION_LABELS: Record<string, string> = {
  CERTIFIED: 'Certificada',
  EXPERIMENTAL: 'Experimental',
  DEPRECATED: 'Descontinuada',
};

function sloLabel(minutes: number) {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Diária' : `A cada ${minutes / 1440} dias`;
  if (minutes >= 60) return `A cada ${Math.round(minutes / 60)} h`;
  return `A cada ${minutes} min`;
}

/**
 * One data product of the catalog: the governed business delivery (owner, SLO, quality,
 * certified metrics and dimensions) and the physical bases that store it.
 */
export function CatalogProductPage() {
  const { productId = '' } = useParams();
  const navigate = useNavigate();
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const products = useQuery({
    queryKey: ['catalog', 'products', ''],
    queryFn: ({ signal }) => fetchDataProducts('', signal),
    staleTime: 5 * 60_000,
  });
  const metrics = useQuery({
    queryKey: ['catalog', 'metrics', ''],
    queryFn: ({ signal }) => fetchMetrics('', signal),
    staleTime: 5 * 60_000,
  });
  const dimensions = useQuery({
    queryKey: ['catalog', 'dimensions', ''],
    queryFn: ({ signal }) => fetchDimensions('', signal),
    staleTime: 5 * 60_000,
  });
  const mesh = useMeshDatasets();
  const breadcrumbs = [
    { label: 'Catálogo', to: '/catalogo?aba=products' },
    { label: 'Produtos de dados', to: '/catalogo?aba=products' },
  ];

  if (products.isLoading) {
    return (
      <div aria-label="Carregando produto de dados" className="flex flex-col gap-4" role="status">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  const product = products.data?.find((item) => item.id === productId);
  if (products.isError || !product) {
    return (
      <div>
        <PageHeader breadcrumbs={[...breadcrumbs, { label: 'Produto' }]} title="Produto de dados" />
        <Card>
          {products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : (
            <EmptyState
              description="O produto não existe ou o seu perfil não tem acesso a este domínio de dados."
              icon={<Package aria-hidden className="h-8 w-8" />}
              title="Produto de dados não encontrado"
            />
          )}
        </Card>
      </div>
    );
  }

  const bases = (mesh.data?.items ?? []).filter((dataset) => dataset.dataProductId === product.id);
  const productMetrics = product.metricIds.map(
    (id) => metrics.data?.find((metric) => metric.id === id) ?? { id, shortName: id },
  );
  const productDimensions = product.dimensionIds.map(
    (id) => dimensions.data?.find((dimension) => dimension.id === id)?.label ?? id,
  );
  const facts: Array<[string, string]> = [
    ['Dono do produto', product.owner],
    ['Domínio', DOMAIN_LABELS[product.domain] ?? product.domain],
    ['Atualização prometida (SLO)', sloLabel(product.freshnessSLOMinutes)],
    ['Qualidade mínima', `${Math.round(product.qualityThreshold * 100)}%`],
    ['Camada gold', product.goldDataset],
    ['Fontes de negócio', product.businessSources.join(', ')],
  ];
  // "Analisar no Explorar" starts from a certified metric of the product.
  const firstMetric =
    product.metricIds.find(
      (id) => metrics.data?.find((metric) => metric.id === id)?.certificationStatus === 'CERTIFIED',
    ) ?? product.metricIds[0];

  return (
    <div className="pb-10">
      <PageHeader
        actions={
          firstMetric ? (
            <Button
              onClick={() => {
                loadAnalysis({
                  metrics: [{ id: firstMetric }],
                  dimensions: [],
                  filters: [],
                  dateRange: { type: 'LAST_N_DAYS', value: 365 },
                  visualization: { type: 'AUTO' },
                });
                navigate('/explorar');
              }}
              variant="primary"
            >
              Analisar no Explorar
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Button>
          ) : null
        }
        breadcrumbs={[...breadcrumbs, { label: product.name }]}
        subtitle={product.description}
        title={product.name}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone="tint">
          <Package aria-hidden className="mr-1 inline h-3.5 w-3.5" />
          Produto de dados
        </Badge>
        <Badge tone="neutral">{DOMAIN_LABELS[product.domain] ?? product.domain}</Badge>
      </div>

      <BaseVsProduct className="mb-6" highlight="product" />

      <Card className="px-5 py-5">
        <h2 className="m-0 text-base font-semibold text-brand-navy">Contrato do produto</h2>
        <p className="m-0 mt-1 text-[13px] text-ink-soft">
          O que o produto promete a quem usa os dados, e quem responde por ele.
        </p>
        <dl className="m-0 mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-faint">{label}</dt>
              <dd className="m-0 mt-0.5 font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section aria-labelledby="product-bases" className="mt-6">
        <h2 className="m-0 text-base font-semibold text-brand-navy" id="product-bases">
          Bases de dados do produto · {bases.length}
        </h2>
        <p className="m-0 mt-1 text-[13px] text-ink-soft">
          Tabelas físicas no data lake onde os dados deste produto ficam guardados.
        </p>
        {bases.length === 0 ? (
          <Card className="mt-3 px-5 py-4 text-sm text-ink-soft">
            Este produto não tem tabela própria: as métricas são calculadas sobre bases de outros
            produtos.
          </Card>
        ) : (
          <ul className="m-0 mt-3 grid list-none gap-3 p-0 md:grid-cols-2">
            {bases.map((dataset) => (
              <li key={dataset.id}>
                <Card className="flex h-full flex-col gap-2 px-5 py-4">
                  <p className="m-0 flex items-center gap-2 text-[15px] font-semibold text-brand-navy">
                    <Database aria-hidden className="h-4 w-4" />
                    {dataset.name}
                  </p>
                  <code className="w-fit rounded bg-muted px-2 py-1 text-xs text-ink">
                    {dataset.location.database}.{dataset.location.table}
                  </code>
                  <p className="m-0 text-xs text-ink-soft">
                    {dataset.grain} · {dataset.columns.length} colunas
                  </p>
                  <Link
                    className="mt-auto inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-brand-navy hover:bg-muted"
                    to={`/catalogo/bases/${dataset.id}`}
                  >
                    <Table2 aria-hidden className="h-4 w-4" /> Ver dados da base
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="product-metrics" className="mt-6">
        <h2 className="m-0 text-base font-semibold text-brand-navy" id="product-metrics">
          Métricas do produto · {productMetrics.length}
        </h2>
        <p className="m-0 mt-1 text-[13px] text-ink-soft">
          Definições oficiais calculadas a partir das bases do produto.
        </p>
        <Card className="mt-3 overflow-hidden">
          <ul className="m-0 list-none divide-y divide-line p-0">
            {productMetrics.map((metric) => (
              <li
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                key={metric.id}
              >
                <div className="min-w-0">
                  <Link
                    className="text-sm font-semibold text-brand-navy hover:underline"
                    to={`/catalogo/metricas/${metric.id}`}
                  >
                    {metric.shortName}
                  </Link>
                  {'businessDefinition' in metric ? (
                    <p className="m-0 mt-0.5 text-[13px] text-ink-soft">
                      {metric.businessDefinition}
                    </p>
                  ) : null}
                </div>
                {'certificationStatus' in metric ? (
                  <Badge tone={metric.certificationStatus === 'CERTIFIED' ? 'success' : 'neutral'}>
                    {CERTIFICATION_LABELS[metric.certificationStatus] ?? metric.certificationStatus}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {productDimensions.length ? (
        <section aria-labelledby="product-dimensions" className="mt-6">
          <h2 className="m-0 text-base font-semibold text-brand-navy" id="product-dimensions">
            Cortes disponíveis · {productDimensions.length}
          </h2>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
            {productDimensions.map((label) => (
              <li
                className="rounded bg-muted px-2.5 py-1 text-[13px] font-semibold text-ink"
                key={label}
              >
                {label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
