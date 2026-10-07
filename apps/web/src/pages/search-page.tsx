import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Card, Eyebrow } from '@/components/ui/card';
import { PageHeader } from '@/components/shell/page-header';
import { LoadingRows } from '@/components/states/states';
import { fetchMetrics } from '@/features/catalog/api';
import { listCustomers } from '@/features/customers/api';
import { listAnalyses } from '@/features/explorer/api';
import { normalizeText } from '@/lib/text';

/** Global search across analyses, companies and governed data. */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const metrics = useQuery({ queryKey: ['search', 'metrics', q], queryFn: () => fetchMetrics(q) });
  const customers = useQuery({
    queryKey: ['search', 'customers', q],
    queryFn: () => listCustomers({ q, page: 1, pageSize: 8 }),
  });
  const analyses = useQuery({ queryKey: ['analyses'], queryFn: listAnalyses, retry: false });
  const matchingAnalyses = (analyses.data ?? []).filter((analysis) =>
    normalizeText(analysis.name).includes(normalizeText(q)),
  );

  const sections = [
    {
      title: 'Análises',
      loading: analyses.isLoading,
      items: matchingAnalyses.map((analysis) => ({
        id: analysis.id,
        label: analysis.name,
        to: `/explorar?analysis=${analysis.id}`,
      })),
    },
    {
      title: 'Empresas',
      loading: customers.isLoading,
      items: (customers.data?.items ?? []).map((company) => ({
        id: company.id,
        label: `${company.tradeName} · ${company.state}`,
        to: `/clientes/${company.id}`,
      })),
    },
    {
      title: 'Dados',
      loading: metrics.isLoading,
      items: (metrics.data ?? []).map((metric) => ({
        id: metric.id,
        label: metric.shortName,
        to: `/catalogo/metricas/${metric.id}`,
      })),
    },
  ];

  return (
    <div>
      <PageHeader subtitle={`Resultados para “${q}”`} title="Busca" />
      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <Card className="px-5 py-4" key={section.title}>
            <Eyebrow>{section.title}</Eyebrow>
            {section.loading ? (
              <LoadingRows className="mt-3" rows={3} />
            ) : section.items.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">Nenhum resultado.</p>
            ) : (
              <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="block rounded px-2 py-1.5 text-sm text-brand-navy hover:bg-muted"
                      to={item.to}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
