import { PRODUCT_CATALOG, TOPIC_LABELS } from './config';
import { relativeChange } from './features';
import type {
  ContentTopic,
  CustomerFeatureSet,
  CustomerProfileTabs,
  CustomerRawData,
  JourneyEvent,
} from './types';

const DAY_MS = 86_400_000;
const pct = (value: number) =>
  `${value >= 0 ? '+' : '−'}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.abs(value) * 100)}%`;

function trendLabel(change: number) {
  if (change >= 0.08) return 'Tendência de crescimento';
  if (change <= -0.08) return 'Tendência de queda';
  return 'Estável';
}

function bandLabel(count: number) {
  if (count >= 12) return 'Recorrente';
  if (count >= 3) return 'Frequente';
  if (count > 0) return 'Uso pontual';
  return 'Sem uso';
}

/** Pre-aggregated data behind the profile tabs (served from the read model). */
export function buildProfileTabs(
  raw: CustomerRawData,
  features: CustomerFeatureSet,
): CustomerProfileTabs {
  const asOf = features.as_of;
  const now = new Date(asOf).getTime();

  // Journey: lifecycle milestones + first product uses + first relationship contact.
  const journey: JourneyEvent[] = [...raw.milestones];
  for (const product of raw.products) {
    if (product.code === 'CONTA_PJ' || product.contractedAt > asOf) continue;
    journey.push({
      date: product.contractedAt,
      title:
        product.code === 'PIX'
          ? 'Primeiro Pix'
          : `${PRODUCT_CATALOG[product.code].name} contratado`,
      source: product.code === 'PIX' ? 'Transações' : 'Produtos',
      kind: product.code === 'PIX' ? 'TRANSACTION' : 'PRODUCT',
    });
  }
  const firstCrm = [...raw.interactions]
    .filter((item) => item.timestamp <= asOf)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0];
  if (firstCrm) {
    journey.push({ date: firstCrm.timestamp, title: 'Interação CRM', source: 'CRM', kind: 'CRM' });
  }

  // Products.
  const products = raw.products
    .filter((product) => product.status !== 'CANCELLED' && product.contractedAt <= asOf)
    .map((product) => ({
      code: product.code,
      name: PRODUCT_CATALOG[product.code].name,
      status: product.status,
      contractedAt: product.contractedAt,
      usageFrequency: product.usageFrequency,
      usageVolumeBand: product.usageVolumeBand,
      trend:
        product.code === 'CARTAO_EMPRESARIAL'
          ? { label: 'Uso em 30 dias vs. 30 anteriores', change: features.card_volume_change_30d }
          : product.code === 'PIX'
            ? { label: 'Transações Pix em 30 dias', change: features.pix_tx_count_30d }
            : undefined,
    }));

  // Transactions.
  const weeks = raw.transactions
    .filter((week) => week.date <= asOf)
    .sort((left, right) => left.date.localeCompare(right.date));
  const lastWeeks = weeks.slice(-4).map((week) => ({
    weekStart: week.date,
    volume: Math.round(week.inflowAmount + week.outflowAmount),
  }));
  const peak = Math.max(1, ...lastWeeks.map((week) => week.volume));
  const monthly = new Map<
    string,
    { inflow: number; outflow: number; pixVolume: number; boletoVolume: number; cardSpend: number }
  >();
  for (const week of weeks) {
    const month = week.date.slice(0, 7);
    const current = monthly.get(month) ?? {
      inflow: 0,
      outflow: 0,
      pixVolume: 0,
      boletoVolume: 0,
      cardSpend: 0,
    };
    current.inflow += week.inflowAmount;
    current.outflow += week.outflowAmount;
    current.pixVolume += week.pixVolume;
    current.boletoVolume += week.boletoVolume;
    current.cardSpend += week.cardSpend;
    monthly.set(month, current);
  }
  const sum = (from: number, to: number, pick: (week: (typeof weeks)[number]) => number) =>
    weeks
      .slice(Math.max(0, weeks.length - from), weeks.length - to)
      .reduce((total, week) => total + pick(week), 0);
  const outflowChange = relativeChange(
    sum(8, 0, (week) => week.outflowAmount),
    sum(16, 8, (week) => week.outflowAmount),
  );
  const pixChange = relativeChange(
    sum(4, 0, (week) => week.pixVolume),
    sum(8, 4, (week) => week.pixVolume),
  );

  // Digital.
  const events30 = raw.events.filter(
    (event) => (now - new Date(event.timestamp).getTime()) / DAY_MS < 30 && event.timestamp <= asOf,
  );
  const topicVisits = new Map<ContentTopic, string[]>();
  for (const event of events30) {
    if (event.topic && (event.kind === 'PAGE_VIEW' || event.kind === 'PRODUCT_VIEW')) {
      topicVisits.set(event.topic, [...(topicVisits.get(event.topic) ?? []), event.timestamp]);
    }
  }
  const topics = [...topicVisits.entries()]
    .map(([topic, dates]) => {
      const sorted = [...dates].sort();
      const span = Math.max(1, Math.ceil((now - new Date(sorted[0]!).getTime()) / DAY_MS));
      return {
        topic,
        label: TOPIC_LABELS[topic],
        visits: dates.length,
        window: `Últimos ${span} dias`,
        lastVisit: sorted.at(-1)!,
      };
    })
    .sort(
      (left, right) => right.visits - left.visits || right.lastVisit.localeCompare(left.lastVisit),
    );
  const sessions30 = raw.sessions.filter(
    (session) =>
      (now - new Date(session.timestamp).getTime()) / DAY_MS < 30 && session.timestamp <= asOf,
  );
  const featureCounts = new Map<string, number>();
  for (const session of sessions30) {
    for (const feature of session.featuresUsed)
      featureCounts.set(feature, (featureCounts.get(feature) ?? 0) + 1);
  }
  const appSessions = sessions30.filter((session) => session.channel === 'APP').length;

  return {
    journey: journey.sort((left, right) => left.date.localeCompare(right.date)),
    products,
    transactions: {
      weekly: lastWeeks.map((week) => ({ ...week, index: Math.round((week.volume / peak) * 100) })),
      monthly: [...monthly.entries()].slice(-18).map(([month, value]) => ({
        month,
        inflow: Math.round(value.inflow),
        outflow: Math.round(value.outflow),
        pixVolume: Math.round(value.pixVolume),
        boletoVolume: Math.round(value.boletoVolume),
        cardSpend: Math.round(value.cardSpend),
      })),
      flows: [
        {
          label: 'Entradas',
          band: features.inflow_30d > 0 ? 'Recorrente' : 'Sem movimento',
          trend: trendLabel(features.inflow_change_60d),
        },
        {
          label: 'Saídas',
          band: features.outflow_30d > 0 ? 'Recorrente' : 'Sem movimento',
          trend: outflowChange >= 0.08 ? 'Concentração operacional' : trendLabel(outflowChange),
        },
        {
          label: 'Pix',
          band: features.pix_tx_count_30d > 0 ? 'Uso ativo' : 'Sem uso',
          trend:
            pixChange >= 0.08 ? 'Recebimentos e pagamentos em alta' : 'Recebimentos e pagamentos',
        },
      ],
      means: [
        {
          label: 'Boletos',
          band: bandLabel(features.boleto_count_30d),
          trend: `${features.boleto_count_30d} em 30 dias`,
        },
        {
          label: 'Cartão PJ',
          band:
            features.card_volume_30d > 0
              ? `Uso ${pct(features.card_volume_change_30d)}`
              : 'Sem uso',
          trend: '30 dias vs. 30 anteriores',
        },
        {
          label: 'Pagamentos',
          band: `Volume ${pct(features.payments_volume_change_60d)}`,
          trend: 'Últimos 60 dias',
        },
      ],
    },
    digital: {
      sessions30d: features.digital_sessions_30d,
      sessionsPrev30d: features.digital_sessions_prev_30d,
      activeDays30d: features.digital_active_days_30d,
      appShare: sessions30.length ? appSessions / sessions30.length : 0,
      preferredChannel:
        sessions30.length === 0
          ? 'Sem acessos'
          : appSessions / sessions30.length >= 0.65
            ? 'App'
            : appSessions / sessions30.length <= 0.35
              ? 'Internet Banking'
              : 'App / Internet Banking',
      topics: topics.slice(0, 5),
      features: [...featureCounts.entries()]
        .map(([feature, count]) => ({ feature, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 6),
      abandonedJourneys: events30
        .filter((event) => event.kind === 'SIMULATION_ABANDONED' && event.topic)
        .map((event) => ({
          topic: event.topic!,
          label: TOPIC_LABELS[event.topic!],
          at: event.timestamp,
        })),
      simulations: events30
        .filter(
          (event) =>
            (event.kind === 'SIMULATION_COMPLETED' || event.kind === 'SIMULATION_ABANDONED') &&
            event.topic,
        )
        .map((event) => ({
          topic: event.topic!,
          label: TOPIC_LABELS[event.topic!],
          at: event.timestamp,
          completed: event.kind === 'SIMULATION_COMPLETED',
        })),
    },
    interactions: [...raw.interactions]
      .filter((item) => item.timestamp <= asOf)
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        channel: item.channel,
        subject: item.subject,
        result: item.result,
        resolved: item.resolved,
        sentiment: item.sentiment,
        responsible: item.relationshipManager,
      })),
    serviceCases: raw.serviceCases
      .filter((item) => item.openedAt <= asOf)
      .sort((left, right) => right.openedAt.localeCompare(left.openedAt))
      .slice(0, 5),
  };
}
