import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState } from '@/components/states/states';
import { describeError } from '@/lib/errors';
import { useCustomerIntelligence } from '@/features/customer-intelligence/api';
import { AskIntelligenceCard, SimilarCustomersCard } from '@/features/customer-intelligence/bottom';
import {
  CustomerChangesStrip,
  CustomerDnaPanel,
  CustomerHeader,
  NextBestActionCard,
} from '@/features/customer-intelligence/hero';
import {
  DigitalTab,
  InteractionsTab,
  JourneyTab,
  NextActionsTab,
  OverviewTab,
  ProductsTab,
  SignalsTab,
  TAB_ITEMS,
  TransactionsTab,
  type TabValue,
} from '@/features/customer-intelligence/tabs';

/**
 * Cliente PJ 360: Customer DNA, signals and next best action on top of the customer view.
 * Everything comes from the materialized intelligence read model; nothing is computed here.
 */
export function CustomerDetailPage() {
  const { companyId = '' } = useParams();
  // Keyed by customer so tabs and drawers reset when navigating to a similar company.
  return <CustomerDetail companyId={companyId} key={companyId} />;
}

function CustomerDetail({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState<TabValue>('overview');
  const [compare, setCompare] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const intelligence = useCustomerIntelligence(companyId);

  function openTab(next: TabValue, options: { compare?: boolean } = {}) {
    setTab(next);
    if (options.compare !== undefined) setCompare(options.compare);
    tabsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  if (intelligence.isLoading) {
    return (
      <div aria-label="Carregando cliente" className="flex flex-col gap-4" role="status">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-24" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (intelligence.isError && describeError(intelligence.error).kind === 'not_found') {
    return (
      <div className="px-2">
        <PageHeader
          breadcrumbs={[{ label: 'Clientes PJ', to: '/clientes' }, { label: 'Cliente' }]}
          title="Cliente"
        />
        <Card>
          <EmptyState
            description="O perfil deste cliente ainda não foi calculado. Ele aparece no próximo recálculo diário da inteligência."
            title="Inteligência ainda não disponível"
          />
        </Card>
      </div>
    );
  }

  if (intelligence.isError || !intelligence.data) {
    return (
      <Card>
        <ErrorState error={intelligence.error} onRetry={() => void intelligence.refetch()} />
      </Card>
    );
  }

  const data = intelligence.data;

  return (
    <div className="px-2 pb-10">
      <PageHeader
        breadcrumbs={[{ label: 'Clientes PJ', to: '/clientes' }, { label: 'Cliente' }]}
        title={data.customer.tradeName}
      />
      <CustomerHeader data={data} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <CustomerDnaPanel data={data} />
        <NextBestActionCard
          data={data}
          onCompare={() => openTab('next-actions', { compare: true })}
          onShowEvidence={() => openTab('signals')}
        />
      </div>

      <div className="mt-4">
        <CustomerChangesStrip data={data} />
      </div>

      <div className="mt-8 scroll-mt-4" ref={tabsRef}>
        <Tabs
          className="gap-6 overflow-x-auto [&>button]:pb-3 [&>button]:text-[15px]"
          idPrefix="customer"
          items={TAB_ITEMS}
          label="Seções do cliente"
          onChange={(value) => setTab(value)}
          value={tab}
        />
        <div
          aria-labelledby={`customer-tab-${tab}`}
          className="mt-6"
          id={`customer-panel-${tab}`}
          role="tabpanel"
        >
          {tab === 'overview' ? <OverviewTab data={data} onOpenTab={openTab} /> : null}
          {tab === 'journey' ? <JourneyTab data={data} /> : null}
          {tab === 'products' ? <ProductsTab data={data} /> : null}
          {tab === 'transactions' ? <TransactionsTab data={data} /> : null}
          {tab === 'digital' ? <DigitalTab data={data} /> : null}
          {tab === 'interactions' ? <InteractionsTab data={data} /> : null}
          {tab === 'signals' ? <SignalsTab data={data} /> : null}
          {tab === 'next-actions' ? (
            <NextActionsTab compare={compare} data={data} onCompareChange={setCompare} />
          ) : null}
        </div>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <SimilarCustomersCard data={data} />
        <AskIntelligenceCard data={data} />
      </div>
    </div>
  );
}
