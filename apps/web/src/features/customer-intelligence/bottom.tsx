import { ChartNoAxesColumn, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActionChip } from '@/components/ui/chip';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, LoadingRows } from '@/components/states/states';
import { buildExplorerHref } from '@/features/explorer/spec';
import { useSimilarCustomers, type CustomerIntelligenceResponse } from './api';
import { ClusterDnaView } from './cluster';

/** Playground link: the governed customer_intelligence dataset filtered to the peer group. */
export function similarExplorerHref(data: CustomerIntelligenceResponse) {
  return buildExplorerHref({
    datasets: ['customer_intelligence', 'customer_360'],
    metrics: [{ id: 'intelligence_customers' }, { id: 'avg_nba_score' }],
    dimensions: [{ id: 'nba_action' }],
    filters: [
      { field: 'company_size', operator: 'EQ', value: data.customer.companySize },
      { field: 'segment', operator: 'EQ', value: data.customer.segment },
    ],
    visualization: { type: 'BAR' },
  });
}

export function SimilarCustomersCard({ data }: { data: CustomerIntelligenceResponse }) {
  const [open, setOpen] = useState(false);
  const similar = useSimilarCustomers(data.customer.customerId, open);
  return (
    <Card className="flex h-full flex-col px-6 pt-6 pb-6">
      <Users aria-hidden className="h-7 w-7 text-brand-navy" strokeWidth={1.5} />
      <h2 className="m-0 mt-4 text-lg leading-snug font-semibold text-brand-navy">
        Encontre empresas com DNA semelhante
      </h2>
      <p className="m-0 mt-2 text-sm leading-relaxed text-ink-soft">
        {data.similar.count > 0
          ? `${data.similar.count.toLocaleString('pt-BR')} empresas têm DNA, porte e segmento próximos. Compare o que ajuda cada negócio a avançar.`
          : 'Nenhuma empresa ficou acima do limiar de similaridade. Explore o segmento no playground.'}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Link
          className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-3 text-[13px] font-semibold text-white hover:bg-brand-orange-hover"
          to={similarExplorerHref(data)}
        >
          <ChartNoAxesColumn aria-hidden className="h-4 w-4" strokeWidth={2.5} />
          Explorar empresas semelhantes
        </Link>
        {data.similar.count > 0 ? (
          <Button onClick={() => setOpen(true)} size="sm">
            Ver DNA do grupo
          </Button>
        ) : null}
      </div>
      {open ? (
        <Dialog
          description="Similaridade por distância normalizada (DNA 70%, porte 15%, segmento 10%, região 5%)."
          onClose={() => setOpen(false)}
          open
          placement="right"
          title="Empresas com DNA semelhante"
        >
          {similar.isLoading ? <LoadingRows rows={6} /> : null}
          {similar.isError ? (
            <ErrorState error={similar.error} onRetry={() => void similar.refetch()} />
          ) : null}
          {similar.data ? (
            <div className="flex flex-col gap-5">
              <ClusterDnaView cluster={similar.data.cluster} />
              <section aria-label="Mais semelhantes">
                <h3 className="m-0 text-sm font-semibold text-brand-navy">Mais semelhantes</h3>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {similar.data.items.map((item) => (
                    <li
                      className="flex items-center justify-between gap-3 text-[13px]"
                      key={item.customerId}
                    >
                      <Link
                        className="text-brand-navy hover:underline"
                        to={`/clientes/${item.customerId}`}
                      >
                        {item.tradeName}
                      </Link>
                      <span className="text-right text-ink-soft">
                        {item.topActionName} · {Math.round(item.similarity * 100)}% similar
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </Card>
  );
}

/** Questions that open Inteligência PJ with this customer as context. */
export function customerQuestions(data: CustomerIntelligenceResponse) {
  const top = data.recommendations[0];
  const topName = top?.actionName.replace(/^(Oferecer|Apresentar|Ofertar) /, '') ?? 'a ação';
  return [
    'Me explique este cliente',
    top && top.actionId !== 'NO_ACTION'
      ? `Por que ${topName} é a ação #1?`
      : 'Por que não há ação recomendada agora?',
    'O que mudou nos últimos 30 dias?',
    'Encontre clientes semelhantes',
    'Existe algum motivo para não abordar esse cliente agora?',
  ];
}

export function AskIntelligenceCard({ data }: { data: CustomerIntelligenceResponse }) {
  const navigate = useNavigate();
  const ask = (question: string) =>
    navigate(
      `/inteligencia?${new URLSearchParams({
        cliente: data.customer.customerId,
        pergunta: question,
      }).toString()}`,
    );
  return (
    <Card className="flex h-full flex-col px-6 pt-6 pb-6">
      <Sparkles aria-hidden className="h-7 w-7 text-brand-orange" strokeWidth={1.5} />
      <h2 className="m-0 mt-4 text-lg leading-snug font-semibold text-brand-navy">
        Perguntar à Inteligência PJ
      </h2>
      <p className="m-0 mt-2 text-sm text-ink-soft">
        Respostas a partir do DNA, dos sinais e das recomendações deste cliente.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {customerQuestions(data).map((question) => (
          <ActionChip key={question} onClick={() => ask(question)}>
            {question}
          </ActionChip>
        ))}
      </div>
    </Card>
  );
}
