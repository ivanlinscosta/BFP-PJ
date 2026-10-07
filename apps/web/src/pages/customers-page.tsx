import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states/states';
import { useSpecLabels } from '@/features/catalog/hooks';
import { listCustomers, maskCnpj, type CustomerFilters } from '@/features/customers/api';
import { formatCount, formatRelative } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';

const PAGE_SIZE = 20;

export function CustomersPage() {
  const navigate = useNavigate();
  const labels = useSpecLabels();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [filters, setFilters] = useState<Omit<CustomerFilters, 'q' | 'page' | 'pageSize'>>({});
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 300);
  const customers = useQuery({
    queryKey: ['customers', q, filters, page],
    queryFn: () => listCustomers({ q, ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const facets = customers.data?.facets;

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        subtitle="Encontre empresas e abra a visão 360 com jornada, produtos, marketing e relacionamento."
        title="Clientes PJ"
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_repeat(5,160px)]">
        <SearchInput
          aria-label="Buscar por nome ou CNPJ"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nome ou CNPJ"
          value={search}
        />
        {(
          [
            ['size', 'Porte', facets?.sizes, (value: string) => value],
            ['segment', 'Segmento', facets?.segments, (value: string) => value],
            ['state', 'Estado', facets?.states, (value: string) => value],
            [
              'status',
              'Status',
              facets?.statuses,
              (value: string) => labels.value('company_status', value),
            ],
            ['product', 'Produto', facets?.products, (value: string) => value],
          ] as const
        ).map(([key, label, options, format]) => (
          <Select
            aria-label={label}
            key={key}
            leadingChevron
            onChange={(event) => setFilter(key, event.target.value)}
            value={filters[key] ?? ''}
          >
            <option value="">{label}: todos</option>
            {(options ?? []).map((option) => (
              <option key={option} value={option}>
                {format(option)}
              </option>
            ))}
          </Select>
        ))}
      </div>
      <Card>
        {customers.isLoading ? (
          <LoadingRows className="p-4" rows={8} />
        ) : customers.isError ? (
          <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
        ) : customers.data && customers.data.items.length === 0 ? (
          <EmptyState
            description="Ajuste a busca ou os filtros."
            icon={<Building2 aria-hidden className="h-8 w-8" />}
            title="Nenhuma empresa encontrada"
          />
        ) : customers.data ? (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Empresa</TH>
                  <TH>CNPJ</TH>
                  <TH>Porte</TH>
                  <TH>Segmento</TH>
                  <TH>Estado</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Produtos</TH>
                  <TH>Última atividade</TH>
                </TR>
              </THead>
              <TBody>
                {customers.data.items.map((company) => (
                  <TR
                    className="cursor-pointer hover:bg-page"
                    key={company.id}
                    onClick={() => navigate(`/clientes/${company.id}`)}
                  >
                    <TD>
                      <Link
                        className="font-semibold text-brand-navy hover:underline"
                        onClick={(event) => event.stopPropagation()}
                        to={`/clientes/${company.id}`}
                      >
                        {company.tradeName}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft tabular-nums">{maskCnpj(company.cnpjMasked)}</TD>
                    <TD>{company.companySize}</TD>
                    <TD>{company.segment}</TD>
                    <TD>{company.state}</TD>
                    <TD>
                      <Badge
                        tone={
                          company.status === 'ACTIVE'
                            ? 'success'
                            : company.status === 'INACTIVE'
                              ? 'neutral'
                              : 'tint'
                        }
                      >
                        {labels.value('company_status', company.status)}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{company.productsCount}</TD>
                    <TD className="text-ink-soft">{formatRelative(company.lastActivityAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[13px] text-ink-soft">
              <span>
                {formatCount(customers.data.pagination.total)} empresas · página{' '}
                {customers.data.pagination.page} de {customers.data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  aria-label="Página anterior"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  size="icon"
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" />
                </Button>
                <Button
                  aria-label="Próxima página"
                  disabled={page >= customers.data.pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  size="icon"
                >
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
