import { useQuery } from '@tanstack/react-query';
import { CircleCheck, TriangleAlert, XCircle } from 'lucide-react';
import type { QualityHealthState } from '@bfp/domain';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingRows } from '@/components/states/states';
import { listGovernanceDataProducts } from '@/features/governance/api';
import { formatCount, formatMinutes, formatShare } from '@/lib/format';

const STATUS: Record<
  QualityHealthState,
  { label: string; tone: 'success' | 'warning' | 'danger'; Icon: typeof CircleCheck }
> = {
  HEALTHY: { label: 'Saudável', tone: 'success', Icon: CircleCheck },
  WARNING: { label: 'Atenção', tone: 'warning', Icon: TriangleAlert },
  CRITICAL: { label: 'Crítico', tone: 'danger', Icon: XCircle },
};

/** Data products with owner, freshness vs. SLO, measured quality and status. */
export function GovernancePage() {
  const products = useQuery({
    queryKey: ['governance', 'data-products'],
    queryFn: listGovernanceDataProducts,
  });
  const items = products.data ?? [];
  const healthy = items.filter((item) => item.status === 'HEALTHY').length;
  const withinSlo = items.filter((item) => item.freshness.withinSLO).length;
  const averageQuality = items.length
    ? items.reduce((sum, item) => sum + item.qualityRatio, 0) / items.length
    : 0;

  return (
    <div>
      <PageHeader
        subtitle="Produtos de dados, donos, atualização e qualidade que sustentam cada análise."
        title="Governança"
      />
      {products.isLoading ? (
        <LoadingRows rows={8} />
      ) : products.isError ? (
        <Card>
          <ErrorState error={products.error} onRetry={() => void products.refetch()} />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {(
              [
                ['Produtos de dados saudáveis', `${healthy} de ${items.length}`],
                ['Dentro do SLO de atualização', `${withinSlo} de ${items.length}`],
                ['Qualidade média', formatShare(averageQuality)],
              ] as const
            ).map(([label, value]) => (
              <Card className="px-5 py-4" key={label}>
                <p className="text-[13px] text-ink-soft">{label}</p>
                <p className="mt-2 text-[28px] leading-none font-bold text-brand-navy">{value}</p>
              </Card>
            ))}
          </div>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Produto de dados</TH>
                  <TH>Owner</TH>
                  <TH>Atualização</TH>
                  <TH>SLO</TH>
                  <TH className="text-right">Qualidade</TH>
                  <TH className="text-right">Registros</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((item) => {
                  const status = STATUS[item.status];
                  return (
                    <TR key={item.id}>
                      <TD>
                        <p className="font-semibold text-brand-navy">{item.name}</p>
                        <p className="text-xs text-ink-soft">
                          {item.goldDataset} · {item.businessSources.join(', ')}
                        </p>
                      </TD>
                      <TD>{item.owner}</TD>
                      <TD>há {formatMinutes(item.freshness.minutes)}</TD>
                      <TD
                        className={
                          item.freshness.withinSLO ? undefined : 'font-semibold text-warning'
                        }
                      >
                        &lt; {formatMinutes(item.sloMinutes)}
                      </TD>
                      <TD
                        className="text-right font-semibold tabular-nums"
                        title={`Completude ${formatShare(item.measures.completeness)} · Validade ${formatShare(item.measures.validity)} · Unicidade ${formatShare(item.measures.uniqueness)}`}
                      >
                        {formatShare(item.qualityRatio)}
                      </TD>
                      <TD className="text-right tabular-nums">{formatCount(item.records)}</TD>
                      <TD>
                        <Badge tone={status.tone}>
                          <status.Icon aria-hidden className="h-3.5 w-3.5" />
                          {status.label}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          <p className="mt-4 text-xs text-ink-soft">
            Qualidade = média de completude, validade e unicidade medidas sobre os registros de
            origem. Atualização comparada ao SLO de cada produto.
          </p>
        </>
      )}
    </div>
  );
}
