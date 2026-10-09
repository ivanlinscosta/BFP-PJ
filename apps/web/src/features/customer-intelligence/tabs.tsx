import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  CircleCheck,
  CreditCard,
  FilePen,
  Globe,
  Headset,
  Lightbulb,
  Megaphone,
  MessagesSquare,
  Smartphone,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  CustomerSignal,
  JourneyEvent,
  NextBestActionRecommendation,
} from '@bfp/customer-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/states/states';
import { useSpecLabels } from '@/features/catalog/hooks';
import { getCustomer360 } from '@/features/customers/api';
import { formatDate, formatDayMonth, formatMetricValue, formatMonthYear } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CustomerIntelligenceResponse } from './api';
import { RecommendationExplanationDrawer } from './hero';
import {
  CHANNEL_LABELS,
  DNA_LABELS,
  FEATURE_LABELS,
  INTERACTION_CHANNEL_LABELS,
  PRODUCT_STATUS_LABELS,
  SIGNAL_CATEGORY_LABELS,
  SIGNAL_FILTERS,
  SIGNAL_KIND_LABELS,
  USAGE_LABELS,
  priorityOf,
  windowLabel,
} from './labels';

type Data = CustomerIntelligenceResponse;

const currency = (value: number) => formatMetricValue(value, 'currency', { compact: true });
const pct = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;

function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="m-0 text-base font-semibold text-brand-navy">{children}</h3>
      {hint ? <p className="m-0 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-card px-4 py-3">
      <p className="m-0 text-xs text-ink-soft">{label}</p>
      <p className="m-0 mt-1 text-xl font-semibold text-brand-navy">{value}</p>
      {hint ? <p className="m-0 mt-0.5 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

function Bar({ value, tone = 'navy' }: { value: number; tone?: 'navy' | 'orange' }) {
  return (
    <div className="h-1.5 rounded-full bg-muted">
      <div
        className={cn(
          'h-1.5 rounded-full',
          tone === 'orange' ? 'bg-brand-orange' : 'bg-brand-navy',
        )}
        style={{ width: `${Math.max(2, Math.min(100, Math.round(value * 100)))}%` }}
      />
    </div>
  );
}

/* ---------------------------------- Visão geral ---------------------------------- */

export function OverviewTab({ data, onOpenTab }: { data: Data; onOpenTab(tab: TabValue): void }) {
  const labels = useSpecLabels();
  const { customer, tabs } = data;
  const onboarding = customer.onboardingCompletedAt
    ? `Concluído em ${formatDate(customer.onboardingCompletedAt)}`
    : 'Em andamento';
  const lastInteraction = tabs.interactions[0]?.timestamp ?? null;
  const rows: Array<[string, string]> = [
    ['Razão social', customer.legalName],
    ['Segmento', `${customer.industry} · ${customer.segment}`],
    ['Localização', `${customer.city} · ${customer.state} · ${customer.region}`],
    ['Início do relacionamento', formatDate(customer.relationshipStartDate)],
    ['Abertura da conta', formatDate(customer.accountOpenedAt)],
    ['Onboarding', onboarding],
    ['Canal de aquisição', labels.value('acquisition_channel', customer.acquisitionChannel)],
    ['Produtos ativos', String(tabs.products.length)],
    ['Última interação', formatDate(lastInteraction)],
  ];
  const opportunities = data.signals.filter((signal) => signal.kind !== 'OBSERVATION').slice(0, 4);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Resumo do cliente</SectionTitle>
        <p className="m-0 mb-4 text-sm text-ink">{data.dna.overallSummary}</p>
        <dl className="m-0 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] text-ink-soft">{label}</dt>
              <dd className="m-0 mt-1 text-sm font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <SectionTitle hint="Clique para ver todos os sinais">Principais sinais</SectionTitle>
        {opportunities.length === 0 ? (
          <EmptyState className="py-6" title="Sem sinais ativos" />
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {opportunities.map((signal) => (
              <li key={signal.id}>
                <button
                  className="w-full rounded-[var(--radius-control)] border border-line bg-card px-4 py-3 text-left hover:border-line-strong"
                  onClick={() => onOpenTab('signals')}
                  type="button"
                >
                  <span className="text-[11px] font-semibold text-brand-orange uppercase">
                    {SIGNAL_KIND_LABELS[signal.kind]}
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-ink">{signal.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{signal.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <SectionTitle>Qualidade e governança</SectionTitle>
        <p className="m-0 text-xs text-ink-soft">
          Qualidade dos dados {Math.round(data.dataQuality.score * 100)}% · atualização{' '}
          {formatDate(data.dataQuality.freshness)} · DNA {data.dnaVersion} · modelo{' '}
          {data.modelVersion}. Dados fictícios; nenhum atributo pessoal sensível é usado.
        </p>
      </section>
    </div>
  );
}

/* ----------------------------------- Jornada ------------------------------------ */

const JOURNEY_ICONS: Record<JourneyEvent['kind'], LucideIcon> = {
  MEDIA: Megaphone,
  DIGITAL: Globe,
  LEAD: UserPlus,
  OPENING: FilePen,
  ACCOUNT: Building2,
  ONBOARDING: CircleCheck,
  TRANSACTION: ArrowLeftRight,
  PRODUCT: CreditCard,
  CRM: MessagesSquare,
  SERVICE: Headset,
};

export function JourneyTab({ data }: { data: Data }) {
  const journey = data.tabs.journey;
  const last = journey[journey.length - 1];
  return (
    <section aria-labelledby="journey-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="m-0 text-lg font-semibold text-brand-navy" id="journey-title">
          Uma jornada, todas as conexões
        </h3>
        {last ? (
          <p className="text-xs text-ink-soft">
            {formatMonthYear(last.date)} · {journey.length} eventos
          </p>
        ) : null}
      </div>
      {journey.length === 0 ? (
        <EmptyState className="py-8" title="Sem eventos registrados" />
      ) : (
        <ol className="relative m-0 mt-5 list-none p-0">
          <span aria-hidden className="absolute top-3 bottom-3 left-[75px] w-px bg-line" />
          {journey.map((item, index) => {
            const Icon = JOURNEY_ICONS[item.kind];
            return (
              <li
                className="relative grid min-h-12 grid-cols-[60px_32px_minmax(0,1fr)_minmax(0,220px)] items-center gap-x-[15px]"
                key={`${item.date}-${index}`}
              >
                <time className="text-xs text-ink-soft" dateTime={item.date}>
                  {formatDayMonth(item.date)}
                </time>
                <span className="relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-brand-navy">
                  <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <span className="truncate text-sm text-ink">{item.title}</span>
                <span className="truncate text-[11px] text-ink-soft">{item.source}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ----------------------------------- Produtos ----------------------------------- */

export function ProductsTab({ data }: { data: Data }) {
  const gaps = data.signals.filter((signal) => signal.category === 'PRODUCT_GAP');
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle hint={`${data.tabs.products.length} produtos contratados`}>
          Produtos do cliente
        </SectionTitle>
        {data.tabs.products.length === 0 ? (
          <EmptyState className="py-8" title="Nenhum produto contratado" />
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {data.tabs.products.map((product) => {
              const status = PRODUCT_STATUS_LABELS[product.status];
              return (
                <li
                  className="rounded-[var(--radius-control)] border border-line bg-card px-4 py-3"
                  key={product.code}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{product.name}</span>
                    {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                  </div>
                  <p className="m-0 mt-1 text-xs text-ink-soft">
                    Contratado em {formatDate(product.contractedAt)} ·{' '}
                    {USAGE_LABELS[product.usageFrequency] ?? product.usageFrequency}
                  </p>
                  {product.trend ? (
                    <p className="m-0 mt-1 text-xs font-semibold text-brand-navy">
                      {product.trend.label}:{' '}
                      {product.code === 'PIX'
                        ? Math.round(product.trend.change).toLocaleString('pt-BR')
                        : pct(product.trend.change)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <SectionTitle hint="Produtos aderentes ao perfil que o cliente ainda não possui">
          Lacunas relevantes
        </SectionTitle>
        {gaps.length === 0 ? (
          <p className="m-0 text-sm text-ink-soft">Nenhuma lacuna relevante identificada.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {gaps.map((signal) => (
              <li className="flex items-start gap-2 text-sm text-ink" key={signal.id}>
                <Lightbulb aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                <span>
                  <span className="font-semibold">{signal.title}</span>
                  <span className="text-ink-soft"> · {signal.description}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------- Transações ---------------------------------- */

export function TransactionsTab({ data }: { data: Data }) {
  const { weekly, monthly, flows, means } = data.tabs.transactions;
  const recentMonths = monthly.slice(-6).reverse();
  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle hint="Volume total (entradas + saídas) por semana">
          Últimas semanas
        </SectionTitle>
        {weekly.length === 0 ? (
          <EmptyState className="py-6" title="Sem transações registradas" />
        ) : (
          <ul className="m-0 flex list-none items-end gap-4 p-0" style={{ height: 150 }}>
            {weekly.map((week) => (
              <li
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                key={week.weekStart}
              >
                <span className="text-xs font-semibold text-brand-navy">
                  {currency(week.volume)}
                </span>
                <span
                  className="w-full max-w-16 rounded-t bg-brand-navy"
                  style={{ height: `${Math.max(4, week.index * 100)}px` }}
                />
                <span className="text-[11px] text-ink-soft">{formatDayMonth(week.weekStart)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Fluxos</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {flows.map((flow) => (
              <li
                className="flex justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm"
                key={flow.label}
              >
                <span className="text-ink">{flow.label}</span>
                <span className="text-right text-ink-soft">
                  <span className="font-semibold text-ink">{flow.band}</span> · {flow.trend}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>Meios de pagamento</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {means.map((item) => (
              <li
                className="flex justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm"
                key={item.label}
              >
                <span className="text-ink">{item.label}</span>
                <span className="text-right text-ink-soft">
                  <span className="font-semibold text-ink">{item.band}</span> · {item.trend}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section>
        <SectionTitle hint="Valores sintéticos agregados por mês">Histórico mensal</SectionTitle>
        <Table>
          <THead>
            <TR>
              <TH>Mês</TH>
              <TH>Entradas</TH>
              <TH>Saídas</TH>
              <TH>Pix</TH>
              <TH>Boletos</TH>
              <TH>Cartão</TH>
            </TR>
          </THead>
          <TBody>
            {recentMonths.map((month) => (
              <TR key={month.month}>
                <TD>{formatMonthYear(`${month.month}-15T12:00:00Z`)}</TD>
                <TD>{currency(month.inflow)}</TD>
                <TD>{currency(month.outflow)}</TD>
                <TD>{currency(month.pixVolume)}</TD>
                <TD>{currency(month.boletoVolume)}</TD>
                <TD>{currency(month.cardSpend)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

/* ----------------------------------- Digital ------------------------------------ */

export function DigitalTab({ data }: { data: Data }) {
  const digital = data.tabs.digital;
  const sessionsChange =
    digital.sessionsPrev30d > 0
      ? (digital.sessions30d - digital.sessionsPrev30d) / digital.sessionsPrev30d
      : 0;
  const maxFeature = Math.max(1, ...digital.features.map((item) => item.count));
  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          hint={
            digital.sessionsPrev30d > 0
              ? `${pct(sessionsChange)} vs. 30 dias anteriores`
              : undefined
          }
          label="Sessões em 30 dias"
          value={String(digital.sessions30d)}
        />
        <Kpi label="Dias ativos em 30 dias" value={String(digital.activeDays30d)} />
        <Kpi label="Acesso pelo app" value={`${Math.round(digital.appShare * 100)}%`} />
        <Kpi
          label="Canal preferido"
          value={CHANNEL_LABELS[digital.preferredChannel] ?? digital.preferredChannel}
        />
      </section>
      <section>
        <SectionTitle hint="Últimos 30 dias">Conteúdos e produtos visitados</SectionTitle>
        {digital.topics.length === 0 ? (
          <p className="m-0 text-sm text-ink-soft">
            Nenhum conteúdo de produto visitado no período.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Conteúdo</TH>
                <TH>Visitas</TH>
                <TH>Janela</TH>
                <TH>Última visita</TH>
              </TR>
            </THead>
            <TBody>
              {digital.topics.map((topic) => (
                <TR key={topic.topic}>
                  <TD>{topic.label}</TD>
                  <TD>{topic.visits}</TD>
                  <TD>{topic.window}</TD>
                  <TD>{formatDate(topic.lastVisit)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <SectionTitle>Funcionalidades mais usadas</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {digital.features.map((item) => (
              <li className="text-[13px]" key={item.feature}>
                <div className="mb-1 flex justify-between">
                  <span className="text-ink">{FEATURE_LABELS[item.feature] ?? item.feature}</span>
                  <span className="font-semibold text-brand-navy">{item.count}</span>
                </div>
                <Bar value={item.count / maxFeature} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>Simulações e jornadas</SectionTitle>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {digital.simulations.map((item) => (
              <li
                className="flex items-center justify-between gap-2 text-sm"
                key={`${item.topic}-${item.at}`}
              >
                <span className="text-ink">
                  <Smartphone aria-hidden className="mr-1.5 inline h-3.5 w-3.5 text-brand-navy" />
                  Simulação de {item.label}
                </span>
                <Badge tone={item.completed ? 'success' : 'warning'}>
                  {item.completed ? 'Concluída' : 'Iniciada'} · {formatDate(item.at)}
                </Badge>
              </li>
            ))}
            {digital.abandonedJourneys.map((item) => (
              <li
                className="flex items-center justify-between gap-2 text-sm"
                key={`abandoned-${item.topic}-${item.at}`}
              >
                <span className="text-ink">Jornada de {item.label}</span>
                <Badge tone="warning">Abandonada · {formatDate(item.at)}</Badge>
              </li>
            ))}
            {digital.simulations.length + digital.abandonedJourneys.length === 0 ? (
              <li className="text-sm text-ink-soft">Nenhuma simulação ou jornada abandonada.</li>
            ) : null}
          </ul>
        </div>
      </section>
      <FullStorySessions customerId={data.customer.customerId} />
    </div>
  );
}

/** Live session replays from FullStory (FS.identify(company_id)), when the integration is set. */
function FullStorySessions({ customerId }: { customerId: string }) {
  const customer = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => getCustomer360(customerId),
    staleTime: 5 * 60_000,
  });
  const fullstory = customer.data?.fullstory;
  return (
    <section>
      <SectionTitle hint="FullStory · ao vivo">Sessões gravadas</SectionTitle>
      {customer.isLoading ? (
        <p className="m-0 text-sm text-ink-soft">Carregando sessões…</p>
      ) : !fullstory || fullstory.status === 'not_configured' ? (
        <p className="m-0 text-sm text-ink-soft">Integração com o FullStory não configurada.</p>
      ) : fullstory.status === 'error' ? (
        <p className="m-0 text-sm text-ink-soft">Não foi possível consultar o FullStory agora.</p>
      ) : fullstory.sessions.length === 0 ? (
        <p className="m-0 text-sm text-ink-soft">Nenhuma sessão gravada para esta empresa.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {fullstory.sessions.map((session) => (
            <li className="text-sm" key={session.sessionId}>
              <a
                className="text-brand-navy hover:underline"
                href={session.url}
                rel="noreferrer"
                target="_blank"
              >
                Sessão de {formatDate(session.createdAt)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------- Interações ----------------------------------- */

export function InteractionsTab({ data }: { data: Data }) {
  const { interactions, serviceCases } = data.tabs;
  const open = serviceCases.filter((item) => !item.resolved);
  return (
    <div className="flex flex-col gap-8">
      {open.length > 0 ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-warning-soft px-4 py-3 text-sm text-ink">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {open.length} atendimento{open.length > 1 ? 's' : ''} pendente{open.length > 1 ? 's' : ''}
          : {open.map((item) => item.subject).join(' · ')}
        </div>
      ) : null}
      <section>
        <SectionTitle hint={`${interactions.length} interações`}>Interações recentes</SectionTitle>
        {interactions.length === 0 ? (
          <EmptyState className="py-8" title="Sem interações registradas" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Canal</TH>
                <TH>Assunto</TH>
                <TH>Resultado</TH>
                <TH>Responsável</TH>
              </TR>
            </THead>
            <TBody>
              {interactions.map((item) => (
                <TR key={item.id}>
                  <TD>{formatDate(item.timestamp)}</TD>
                  <TD>{INTERACTION_CHANNEL_LABELS[item.channel] ?? item.channel}</TD>
                  <TD>{item.subject}</TD>
                  <TD>
                    <span className={cn(!item.resolved && 'font-semibold text-warning')}>
                      {item.result}
                    </span>
                  </TD>
                  <TD>{item.responsible ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
      <section>
        <SectionTitle>Atendimentos</SectionTitle>
        {serviceCases.length === 0 ? (
          <p className="m-0 text-sm text-ink-soft">Nenhum atendimento aberto no histórico.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {serviceCases.map((item) => (
              <li
                className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm"
                key={item.id}
              >
                <span className="text-ink">
                  {item.subject}
                  <span className="text-ink-soft">
                    {' '}
                    ·{' '}
                    {
                      { COMPLAINT: 'Reclamação', QUESTION: 'Dúvida', PROBLEM: 'Problema' }[
                        item.kind
                      ]
                    }{' '}
                    · {formatDate(item.openedAt)}
                  </span>
                </span>
                <Badge tone={item.resolved ? 'success' : 'warning'}>
                  {item.resolved ? 'Resolvido' : 'Pendente'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------ Sinais ------------------------------------ */

function SignalCard({ signal }: { signal: CustomerSignal }) {
  return (
    <li className="rounded-[var(--radius-control)] border border-line bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            'text-[11px] font-semibold uppercase',
            signal.kind === 'RISK'
              ? 'text-warning'
              : signal.kind === 'OPPORTUNITY'
                ? 'text-brand-orange'
                : 'text-brand-navy',
          )}
        >
          {SIGNAL_KIND_LABELS[signal.kind]}
        </span>
        <Badge tone="neutral">{SIGNAL_CATEGORY_LABELS[signal.category]}</Badge>
      </div>
      <p className="m-0 mt-1.5 text-sm font-semibold text-ink">{signal.title}</p>
      <p className="m-0 mt-0.5 text-xs text-ink-soft">{signal.description}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <span className="w-24 shrink-0 text-[11px] text-ink-soft">
          Força {Math.round(signal.strength * 100)}%
        </span>
        <div className="flex-1">
          <Bar tone={signal.kind === 'OPPORTUNITY' ? 'orange' : 'navy'} value={signal.strength} />
        </div>
      </div>
      <p className="m-0 mt-2 text-[11px] text-ink-faint">
        Detectado em {formatDate(signal.detectedAt)}
        {signal.expiresAt ? ` · expira em ${formatDate(signal.expiresAt)}` : ''} · {signal.source}
        {signal.dnaDimension ? ` · DNA: ${DNA_LABELS[signal.dnaDimension].title}` : ''}
      </p>
      {signal.nbaImpact ? (
        <p className="m-0 mt-1 text-[11px] font-semibold text-brand-navy">{signal.nbaImpact}</p>
      ) : null}
    </li>
  );
}

export function SignalsTab({ data }: { data: Data }) {
  const [filter, setFilter] = useState('all');
  const active = SIGNAL_FILTERS.find((item) => item.value === filter) ?? SIGNAL_FILTERS[0]!;
  const signals = data.signals.filter(
    (signal) => !active.categories || active.categories.includes(signal.category),
  );
  return (
    <section>
      <Tabs
        items={SIGNAL_FILTERS.map((item) => ({ value: item.value, label: item.label }))}
        label="Filtrar sinais"
        onChange={setFilter}
        value={filter}
        variant="segmented"
      />
      <p className="m-0 mt-3 text-xs text-ink-soft">
        Sinais detectados por regras determinísticas, com decaimento temporal (meia-vida de 21
        dias).
      </p>
      {signals.length === 0 ? (
        <EmptyState className="py-8" title="Nenhum sinal nesta categoria" />
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-3 p-0 md:grid-cols-2">
          {signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------- Próximas ações -------------------------------- */

const COMPONENT_LABELS: Array<[keyof NextBestActionRecommendation['components'], string]> = [
  ['relevance', 'Relevância'],
  ['intent', 'Intenção'],
  ['expectedImpact', 'Impacto'],
  ['timing', 'Momento'],
  ['confidence', 'Confiança'],
];

export function NextActionsTab({
  data,
  compare,
  onCompareChange,
}: {
  data: Data;
  compare: boolean;
  onCompareChange(value: boolean): void;
}) {
  const [explain, setExplain] = useState<NextBestActionRecommendation | null>(null);
  const items = data.recommendations;
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-ink-soft">
          Ranking do NextBestActionEngine ({data.modelVersion}) entre as ações elegíveis. A IA
          apenas explica.
        </p>
        <Button onClick={() => onCompareChange(!compare)} size="sm">
          {compare ? 'Ver ranking' : 'Comparar recomendações'}
        </Button>
      </div>
      {compare ? (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Ação</TH>
                <TH>Score</TH>
                {COMPONENT_LABELS.map(([key, label]) => (
                  <TH key={key}>{label}</TH>
                ))}
                <TH>Penalidades</TH>
                <TH>Canal</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    #{item.rank} {item.actionName}
                  </TD>
                  <TD>
                    <span className="font-semibold text-brand-navy">{item.score}</span>
                  </TD>
                  {COMPONENT_LABELS.map(([key]) => (
                    <TD key={key}>{Math.round(item.components[key] * 100)}</TD>
                  ))}
                  <TD>{Math.round((item.penalties.fatigue + item.penalties.risk) * 100)}</TD>
                  <TD>{CHANNEL_LABELS[item.recommendedChannel] ?? item.recommendedChannel}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {items.map((item) => {
            const priority = priorityOf(item.score);
            return (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-sm font-semibold text-brand-navy">
                    #{item.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-semibold text-ink">{item.actionName}</p>
                    <p className="m-0 mt-0.5 text-xs text-ink-soft">
                      {item.objective} ·{' '}
                      {CHANNEL_LABELS[item.recommendedChannel] ?? item.recommendedChannel} ·{' '}
                      {windowLabel(item.recommendedWindow)}
                    </p>
                  </div>
                  <div className="w-40">
                    <div className="mb-1 flex justify-between text-xs">
                      <Badge tone={priority.tone}>{priority.label}</Badge>
                      <span className="font-semibold text-brand-navy">{item.score}</span>
                    </div>
                    <Bar tone={item.rank === 1 ? 'orange' : 'navy'} value={item.score / 100} />
                  </div>
                  <Button onClick={() => setExplain(item)} size="sm" variant="ghost">
                    Entender
                  </Button>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      <RecommendationExplanationDrawer
        data={data}
        onClose={() => setExplain(null)}
        recommendation={explain}
      />
    </section>
  );
}

export type TabValue =
  | 'overview'
  | 'journey'
  | 'products'
  | 'transactions'
  | 'digital'
  | 'interactions'
  | 'signals'
  | 'next-actions';

export const TAB_ITEMS: Array<{ value: TabValue; label: string }> = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'journey', label: 'Jornada' },
  { value: 'products', label: 'Produtos' },
  { value: 'transactions', label: 'Transações' },
  { value: 'digital', label: 'Digital' },
  { value: 'interactions', label: 'Interações' },
  { value: 'signals', label: 'Sinais' },
  { value: 'next-actions', label: 'Próximas ações' },
];
