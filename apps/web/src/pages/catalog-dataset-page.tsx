import { Database, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states/states';
import { useDatasetPreview, useMeshDatasets, type DatasetPreview } from '@/features/mesh/api';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  string: 'Texto',
  timestamp: 'Data e hora',
  double: 'Número',
  bigint: 'Inteiro',
  boolean: 'Sim/Não',
};

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function formatCell(value: DatasetPreview['rows'][number][string], type: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return numberFormat.format(value);
  if (type === 'timestamp') {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }
  return value;
}

function PreviewTable({ preview }: { preview: DatasetPreview }) {
  if (preview.rows.length === 0) {
    return <EmptyState className="py-10" title="A base ainda não tem linhas publicadas" />;
  }
  return (
    <div className="max-h-[70vh] overflow-auto rounded-[var(--radius-card)] border border-line bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-[1] bg-muted">
          <tr>
            <th className="border-b border-line px-3 py-2 text-left text-[11px] font-semibold text-ink-faint">
              #
            </th>
            {preview.columns.map((column) => (
              <th
                className="border-b border-line px-3 py-2 text-left font-semibold whitespace-nowrap text-ink"
                key={column.name}
                title={column.description}
                scope="col"
              >
                {column.name}
                <span className="ml-1.5 text-[11px] font-normal text-ink-faint">
                  {TYPE_LABELS[column.type] ?? column.type}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, index) => (
            <tr className="odd:bg-card even:bg-muted/40" key={index}>
              <td className="border-b border-line px-3 py-1.5 text-ink-faint tabular-nums">
                {index + 1}
              </td>
              {preview.columns.map((column) => {
                const value = row[column.name] ?? null;
                return (
                  <td
                    className={cn(
                      'max-w-[280px] truncate border-b border-line px-3 py-1.5 whitespace-nowrap',
                      typeof value === 'number' ? 'text-right tabular-nums' : 'text-ink',
                    )}
                    key={column.name}
                    title={value === null ? undefined : String(value)}
                  >
                    {formatCell(value, column.type)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One base (mesh table) of the catalog: description, columns and a preview of its rows. */
export function CatalogDatasetPage() {
  const { datasetId = '' } = useParams();
  const [tab, setTab] = useState<'dados' | 'colunas'>('dados');
  const datasets = useMeshDatasets();
  const preview = useDatasetPreview(datasetId);
  const dataset = datasets.data?.items.find((item) => item.id === datasetId);

  if (datasets.isLoading) {
    return (
      <div aria-label="Carregando base" className="flex flex-col gap-4" role="status">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (datasets.isError || !dataset) {
    return (
      <div className="px-2">
        <PageHeader
          breadcrumbs={[{ label: 'Catálogo', to: '/catalogo' }, { label: 'Base de dados' }]}
          title="Base de dados"
        />
        <Card>
          {datasets.isError ? (
            <ErrorState error={datasets.error} onRetry={() => void datasets.refetch()} />
          ) : (
            <EmptyState
              description="A base não existe ou o seu perfil não tem acesso a este domínio de dados."
              icon={<Database aria-hidden className="h-8 w-8" />}
              title="Base de dados não encontrada"
            />
          )}
        </Card>
      </div>
    );
  }

  const facts: Array<[string, string]> = [
    ['Dono', dataset.atlan?.owners.join(', ') || dataset.owner],
    ['Granularidade', dataset.grain],
    ['Origem', dataset.sourceSystem],
    ['Chave de junção', dataset.joinKey],
  ];

  return (
    <div className="px-2 pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Catálogo', to: '/catalogo?aba=datasets' },
          { label: 'Bases de dados', to: '/catalogo?aba=datasets' },
          { label: dataset.name },
        ]}
        title={dataset.name}
      />
      <Card className="flex flex-col gap-4 px-5 py-5">
        <p className="m-0 text-sm text-ink-soft">
          {dataset.atlan?.description ?? dataset.description}
        </p>
        <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-faint">{label}</dt>
              <dd className="m-0 mt-0.5 font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <code className="rounded bg-muted px-2 py-1 text-ink">
            {dataset.location.database}.{dataset.location.table}
          </code>
          <span>
            {dataset.columns.length} colunas · {dataset.metricIds.length} métricas governadas
          </span>
          <Link
            className="font-semibold text-brand-navy hover:underline"
            to={`/catalogo/produtos/${dataset.dataProductId}`}
          >
            Ver produto de dados
          </Link>
        </div>
      </Card>

      <Tabs
        className="mt-6"
        idPrefix="dataset"
        items={[
          { value: 'dados', label: 'Prévia dos dados' },
          { value: 'colunas', label: `Colunas · ${dataset.columns.length}` },
        ]}
        label="Seções da base"
        onChange={setTab}
        value={tab}
      />
      <div
        aria-labelledby={`dataset-tab-${tab}`}
        className="mt-4"
        id={`dataset-panel-${tab}`}
        role="tabpanel"
      >
        {tab === 'dados' ? (
          preview.isLoading ? (
            <Card className="px-5 py-5">
              <LoadingRows rows={8} />
              <p className="m-0 mt-3 text-xs text-ink-soft">Consultando a base…</p>
            </Card>
          ) : preview.isError ? (
            <Card>
              <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
            </Card>
          ) : preview.data ? (
            <div className="flex flex-col gap-2">
              <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <Table2 aria-hidden className="h-4 w-4 text-brand-navy" />
                Prévia: primeiras {preview.data.rows.length} linhas (limite de {preview.data.limit})
                <Badge tone="neutral">
                  {preview.data.source === 'athena' ? 'Amazon Athena · gold' : 'Ambiente local'}
                </Badge>
                <span>
                  Somente colunas governadas, sem dados pessoais. Passe o mouse no cabeçalho para
                  ver a descrição.
                </span>
              </p>
              <PreviewTable preview={preview.data} />
            </div>
          ) : null
        ) : (
          <Card className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-line p-0">
              {dataset.columns.map((column) => (
                <li
                  className="grid gap-1 px-5 py-3 sm:grid-cols-[220px_120px_minmax(0,1fr)] sm:gap-4"
                  key={column.name}
                >
                  <code className="text-[13px] text-brand-navy">{column.name}</code>
                  <span className="text-xs text-ink-faint">
                    {TYPE_LABELS[column.type] ?? column.type}
                  </span>
                  <span className="text-sm text-ink-soft">{column.description}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
