import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Building2,
  ChartColumnIncreasing,
  ChartNoAxesColumn,
  CircleCheck,
  CreditCard,
  FilePen,
  Globe,
  Megaphone,
  MessagesSquare,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState } from '@/components/states/states';
import { useSpecLabels } from '@/features/catalog/hooks';
import {
  getCustomer360,
  maskCnpj,
  type Customer360,
  type JourneyMilestone,
} from '@/features/customers/api';
import { buildExplorerHref } from '@/features/explorer/spec';
import {
  formatDate,
  formatDayMonth,
  formatMetricValue,
  formatMonthYear,
  formatRelative,
} from '@/lib/format';

type TabValue =
  'overview' | 'journey' | 'products' | 'marketing' | 'crm' | 'conversations' | 'events';

const JOURNEY_ICONS: Record<JourneyMilestone['kind'], LucideIcon> = {
  media: Megaphone,
  site: Globe,
  lead: UserPlus,
  opening: FilePen,
  account: Building2,
  onboarding: CircleCheck,
  transaction: ArrowLeftRight,
  product: CreditCard,
  crm: MessagesSquare,
  activation: ChartNoAxesColumn,
};

function isToday(value: string | null) {
  return value ? new Date(value).toDateString() === new Date().toDateString() : false;
}

function Journey({ journey }: { journey: JourneyMilestone[] }) {
  const last = journey[journey.length - 1];
  return (
    <section aria-labelledby="journey-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[22px] font-semibold text-brand-navy" id="journey-title">
          Uma jornada, todas as conexões
        </h2>
        {last ? (
          <p className="text-xs text-ink-soft">
            {formatMonthYear(last.occurredAt)} · {journey.length} eventos
          </p>
        ) : null}
      </div>
      {journey.length === 0 ? (
        <EmptyState className="py-8" title="Sem eventos registrados" />
      ) : (
        <ol className="relative m-0 mt-5 list-none p-0">
          <span aria-hidden className="absolute top-3 bottom-3 left-[75px] w-px bg-line" />
          {journey.map((item) => {
            const Icon = JOURNEY_ICONS[item.kind];
            return (
              <li
                className="relative grid min-h-12 grid-cols-[60px_32px_minmax(0,1fr)_minmax(0,240px)] items-center gap-x-[15px]"
                key={item.id}
              >
                <time className="text-xs text-ink-soft" dateTime={item.occurredAt}>
                  {formatDayMonth(item.occurredAt)}
                </time>
                <span className="relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-brand-navy">
                  <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <span className="truncate text-sm text-ink">{item.title}</span>
                <span className="truncate text-[11px] text-ink-soft">
                  {item.category} · {item.source}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Overview({ customer }: { customer: Customer360 }) {
  const { company } = customer;
  const rows: Array<[string, string]> = [
    ['Razão social', company.legalName],
    ['Indústria', company.industry],
    ['Cidade', `${company.city} · ${company.state}`],
    ['Região', company.region],
    ['Funcionários', company.employeeCountRange],
    ['Perfil de risco', { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto' }[company.riskProfile]],
    ['Contas', String(customer.accounts.length)],
    [
      'Sócios e representantes',
      customer.partners.map((partner) => partner.role.toLowerCase().replace('_', ' ')).join(', ') ||
        '—',
    ],
    ['Consentimento LGPD', company.lgpdConsent ? 'Sim' : 'Não'],
  ];
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[13px] text-ink-soft">{label}</dt>
          <dd className="m-0 mt-1 text-sm font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string>>;
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState className="py-8" title={empty} />;
  return (
    <Table>
      <THead>
        <TR>
          {headers.map((header) => (
            <TH key={header}>{header}</TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR key={index}>
            {row.map((cell, cellIndex) => (
              <TD key={cellIndex}>{cell}</TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function CustomerDetailPage() {
  const { companyId = '' } = useParams();
  const labels = useSpecLabels();
  const [tab, setTab] = useState<TabValue>('journey');
  const customer = useQuery({
    queryKey: ['customer', companyId],
    queryFn: () => getCustomer360(companyId),
  });

  if (customer.isLoading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Carregando cliente">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (customer.isError || !customer.data) {
    return (
      <Card>
        <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />
      </Card>
    );
  }

  const data = customer.data;
  const { company, summary } = data;
  const similarHref = buildExplorerHref({
    datasets: ['customer_360'],
    metrics: [{ id: 'activation_d30_rate' }],
    dimensions: [{ id: 'acquisition_channel' }],
    filters: [
      { field: 'company_size', operator: 'EQ', value: company.companySize },
      { field: 'segment', operator: 'EQ', value: company.segment },
      { field: 'region', operator: 'EQ', value: company.region },
    ],
    dateRange: { type: 'LAST_N_DAYS', value: 365 },
    visualization: { type: 'BAR' },
  });
  const summaryItems: Array<[string, string]> = [
    ['Aquisição', labels.value('acquisition_channel', summary.acquisitionChannel)],
    ['Abertura', formatDate(summary.accountOpenedAt)],
    [
      'Onboarding',
      summary.onboardingStatus === 'COMPLETED'
        ? `Concluído em ${summary.onboardingDays ?? 0} ${summary.onboardingDays === 1 ? 'dia' : 'dias'}`
        : summary.onboardingStatus === 'IN_PROGRESS'
          ? 'Em andamento'
          : 'Não iniciado',
    ],
    ['Ativação D30', summary.activatedD30 ? 'Sim' : 'Não'],
    ['Produtos', String(summary.activeProducts)],
    [
      'Última interação',
      isToday(summary.lastInteractionAt) ? 'Hoje' : formatRelative(summary.lastInteractionAt),
    ],
  ];

  return (
    <div className="px-2">
      <PageHeader
        breadcrumbs={[{ label: 'Clientes PJ', to: '/clientes' }, { label: 'Cliente' }]}
        title={company.tradeName}
      />
      <Card className="flex items-center gap-6 px-6 py-7">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-tint text-brand-navy">
          <Building2 aria-hidden className="h-8 w-8" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink">{company.legalName}</p>
          <p className="mt-2 text-[13px] text-ink-soft">
            CNPJ {maskCnpj(company.cnpjMasked)} · Empresa fictícia
          </p>
          <p className="mt-2 text-[13px] text-ink-soft">
            {company.companySize === 'MEI' ? 'MEI' : `${company.companySize} empresa`}
            <span className="mx-2">·</span>
            {company.segment}
            <span className="mx-2">·</span>
            {company.city} · {company.state}
          </p>
        </div>
        <Badge tone={company.status === 'ACTIVE' ? 'success' : 'neutral'} uppercase>
          {labels.value('company_status', company.status)}
        </Badge>
      </Card>

      <dl className="mt-9 grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-6">
        {summaryItems.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[13px] text-ink-soft">{label}</dt>
            <dd className="m-0 mt-2 text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <Tabs
        className="mt-10 gap-6 [&>button]:pb-3 [&>button]:text-[15px]"
        idPrefix="customer"
        items={[
          { value: 'overview', label: 'Visão geral' },
          { value: 'journey', label: 'Jornada' },
          { value: 'products', label: 'Produtos' },
          { value: 'marketing', label: 'Marketing' },
          { value: 'crm', label: 'CRM' },
          { value: 'conversations', label: 'Conversas' },
          { value: 'events', label: 'Eventos' },
        ]}
        label="Seções do cliente"
        onChange={setTab}
        value={tab}
      />

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div aria-labelledby={`customer-tab-${tab}`} id={`customer-panel-${tab}`} role="tabpanel">
          {tab === 'journey' ? <Journey journey={data.journey} /> : null}
          {tab === 'overview' ? <Overview customer={data} /> : null}
          {tab === 'products' ? (
            <SimpleTable
              empty="Nenhum produto contratado"
              headers={['Produto', 'Categoria', 'Status', 'Contratação', 'Receita proxy/mês']}
              rows={data.products.map(({ companyProduct, product }) => [
                product?.name ?? companyProduct.productId,
                product ? labels.value('product_category', product.category) : '—',
                { CONTRACTED: 'Contratado', ACTIVE: 'Ativo', CANCELLED: 'Cancelado' }[
                  companyProduct.status
                ],
                formatDate(companyProduct.contractedAt),
                formatMetricValue(companyProduct.monthlyRevenueProxy, 'currency'),
              ])}
            />
          ) : null}
          {tab === 'marketing' ? (
            <SimpleTable
              empty="Sem touchpoints de mídia"
              headers={['Data', 'Canal', 'Tipo', 'Custo']}
              rows={data.touchpoints
                .slice(-30)
                .reverse()
                .map((touchpoint) => [
                  formatDate(touchpoint.occurredAt),
                  labels.value('acquisition_channel', touchpoint.channel),
                  {
                    IMPRESSION: 'Impressão',
                    CLICK: 'Clique',
                    LANDING_PAGE_VISIT: 'Visita ao site',
                    FORM_SUBMIT: 'Formulário',
                  }[touchpoint.touchpointType],
                  formatMetricValue(touchpoint.cost, 'currency'),
                ])}
            />
          ) : null}
          {tab === 'crm' ? (
            <SimpleTable
              empty="Sem interações de CRM"
              headers={['Data', 'Tipo', 'Direção', 'Resultado']}
              rows={[...data.crm].reverse().map((interaction) => [
                formatDate(interaction.occurredAt),
                {
                  CALL: 'Ligação',
                  EMAIL: 'E-mail',
                  WHATSAPP: 'WhatsApp',
                  MEETING: 'Reunião',
                  TASK: 'Tarefa',
                }[interaction.interactionType],
                interaction.direction === 'INBOUND' ? 'Entrada' : 'Saída',
                {
                  CONNECTED: 'Conectado',
                  NO_ANSWER: 'Sem resposta',
                  FOLLOW_UP: 'Follow-up',
                  RESOLVED: 'Resolvido',
                  OPEN: 'Em aberto',
                }[interaction.outcome],
              ])}
            />
          ) : null}
          {tab === 'conversations' ? (
            <SimpleTable
              empty="Sem conversas"
              headers={['Início', 'Canal', 'Assunto', 'Status', 'Mensagens']}
              rows={[...data.conversations]
                .reverse()
                .map((conversation) => [
                  formatDate(conversation.startedAt),
                  labels.value('conversation_channel', conversation.channel),
                  conversation.subject,
                  labels.value('conversation_status', conversation.status),
                  String(conversation.messageCount),
                ])}
            />
          ) : null}
          {tab === 'events' ? (
            <SimpleTable
              empty="Sem eventos digitais"
              headers={['Data', 'Evento', 'Canal']}
              rows={data.digitalEvents
                .slice(-40)
                .reverse()
                .map((event) => [
                  formatDate(event.occurredAt),
                  {
                    LOGIN: 'Login',
                    FEATURE_USE: 'Uso de funcionalidade',
                    TRANSACTION: 'Transação',
                    ERROR: 'Erro',
                    DOCUMENT_UPLOAD: 'Envio de documento',
                  }[event.eventType],
                  { WEB: 'Web', MOBILE: 'App', API: 'API' }[event.channel],
                ])}
            />
          ) : null}
        </div>

        <Card className="h-fit px-6 pt-6 pb-8">
          <ChartColumnIncreasing
            aria-hidden
            className="h-7 w-7 text-brand-navy"
            strokeWidth={1.5}
          />
          <h2 className="mt-5 text-[22px] leading-snug font-semibold text-brand-navy">
            Do contexto à próxima pergunta
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Compare empresas de mesmo porte, segmento e região no playground. Entenda o que ajuda
            cada negócio a avançar.
          </p>
          <Link
            className="mt-5 inline-flex h-8 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-3 text-[13px] font-semibold text-white hover:bg-brand-orange-hover"
            to={similarHref}
          >
            <ChartNoAxesColumn aria-hidden className="h-4 w-4" strokeWidth={2.5} />
            Explorar empresas semelhantes
          </Link>
          <hr className="my-6 border-line" />
          <p className="text-xs leading-relaxed text-ink-soft">
            Fontes integradas de negócio. Visão contextual, com acesso conforme seu perfil.
          </p>
        </Card>
      </div>
    </div>
  );
}
