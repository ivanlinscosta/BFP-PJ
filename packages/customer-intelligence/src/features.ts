import { CREDIT_TOPICS, PRODUCT_CATALOG } from './config';
import type { ContentTopic, CustomerFeatureSet, CustomerRawData, ProductCode } from './types';

const DAY_MS = 86_400_000;

export function daysBetween(from: string | Date, to: string | Date) {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
}

/** Relative change; null-safe (no previous value → 0 when current is also 0, else +100%). */
export function relativeChange(current: number, previous: number) {
  // No comparable history: report no change instead of an artificial +100%.
  if (previous === 0) return 0;
  return (current - previous) / previous;
}

function within(timestamp: string, asOf: Date, fromDays: number, toDays = 0) {
  const age = (asOf.getTime() - new Date(timestamp).getTime()) / DAY_MS;
  return age >= toDays && age < fromDays;
}

/** Products that make a meaningful gap when missing (credit, collection, card, POS). */
export const RELEVANT_GAP_PRODUCTS: ProductCode[] = [
  'CAPITAL_DE_GIRO',
  'PIX_COBRANCA',
  'CARTAO_EMPRESARIAL',
  'MAQUININHA',
];

/**
 * Feature layer: one row per customer computed from raw data at `asOf`. Windows are
 * expressed in days (30d = last 4 weekly aggregates for transactions).
 */
export function computeFeatures(raw: CustomerRawData, asOfInput: string): CustomerFeatureSet {
  const asOf = new Date(asOfInput);
  const { identity } = raw;

  // Transactions: weekly aggregates up to asOf, newest last.
  const weeks = raw.transactions
    .filter((week) => new Date(week.date).getTime() <= asOf.getTime())
    .sort((left, right) => left.date.localeCompare(right.date));
  const sumWeeks = (from: number, to: number, pick: (week: (typeof weeks)[number]) => number) =>
    weeks
      .slice(Math.max(0, weeks.length - from), weeks.length - to)
      .reduce((sum, week) => sum + pick(week), 0);
  const volume = (week: (typeof weeks)[number]) => week.inflowAmount + week.outflowAmount;
  // Previous windows only count weeks after the account opened, normalized per week, so young
  // accounts are not compared with empty pre-account weeks.
  const openedAt = identity.accountOpenedAt ?? identity.relationshipStartDate;
  const previousWindow = (
    from: number,
    to: number,
    pick: (week: (typeof weeks)[number]) => number,
  ) => {
    const slice = weeks
      .slice(Math.max(0, weeks.length - from), weeks.length - to)
      .filter((week) => new Date(week.date).getTime() + 6 * DAY_MS >= new Date(openedAt).getTime());
    if (slice.length === 0) return 0;
    return (slice.reduce((sum, week) => sum + pick(week), 0) * (from - to)) / slice.length;
  };
  const tx30 = sumWeeks(4, 0, volume);
  const txPrev30 = previousWindow(8, 4, volume);
  const tx60 = sumWeeks(8, 0, volume);
  const txPrev60 = previousWindow(16, 8, volume);
  const inflow60 = sumWeeks(8, 0, (week) => week.inflowAmount);
  const inflowPrev60 = previousWindow(16, 8, (week) => week.inflowAmount);
  const pay60 = sumWeeks(8, 0, (week) => week.paymentsVolume);
  const payPrev60 = previousWindow(16, 8, (week) => week.paymentsVolume);
  const card30 = sumWeeks(4, 0, (week) => week.cardSpend);
  const cardPrev30 = previousWindow(8, 4, (week) => week.cardSpend);
  const pixCount30 = sumWeeks(4, 0, (week) => week.pixInCount + week.pixOutCount);
  const pixVolume30 = sumWeeks(4, 0, (week) => week.pixVolume);
  const boleto30 = sumWeeks(4, 0, (week) => week.boletoCount);
  const payments30 = sumWeeks(4, 0, (week) => week.paymentsCount);
  const last12 = weeks.slice(-52);
  const avgMonthly = last12.length
    ? (last12.reduce((sum, week) => sum + volume(week), 0) / last12.length) * 4.33
    : 0;
  const lastActiveWeek = [...weeks].reverse().find((week) => volume(week) > 0);

  // Digital.
  const sessions30 = raw.sessions.filter((session) => within(session.timestamp, asOf, 30));
  const sessionsPrev30 = raw.sessions.filter((session) => within(session.timestamp, asOf, 60, 30));
  const activeDays = new Set(sessions30.map((session) => session.timestamp.slice(0, 10)));
  const features = new Set(sessions30.flatMap((session) => session.featuresUsed));
  const mobile = sessions30.filter((session) => session.channel === 'APP').length;
  const web = sessions30.length - mobile;
  const events30 = raw.events.filter((event) => within(event.timestamp, asOf, 30));
  const events14 = raw.events.filter((event) => within(event.timestamp, asOf, 14));
  const eventsPrev14 = raw.events.filter((event) => within(event.timestamp, asOf, 28, 14));
  const isCredit = (topic?: ContentTopic) => Boolean(topic && CREDIT_TOPICS.includes(topic));
  const creditViews = (list: typeof events14) =>
    list.filter(
      (event) =>
        (event.kind === 'PAGE_VIEW' || event.kind === 'PRODUCT_VIEW') && isCredit(event.topic),
    ).length;
  const interest: Partial<Record<ContentTopic, number>> = {};
  for (const event of events30) {
    if (event.topic && (event.kind === 'PAGE_VIEW' || event.kind === 'PRODUCT_VIEW')) {
      interest[event.topic] = (interest[event.topic] ?? 0) + 1;
    }
  }
  const logins = raw.events.filter((event) => event.kind === 'LOGIN');
  const lastLogin = logins.reduce<string | null>(
    (latest, event) =>
      event.timestamp <= asOf.toISOString() && (!latest || event.timestamp > latest)
        ? event.timestamp
        : latest,
    null,
  );

  // Relationship and service.
  const interactions = raw.interactions.filter((item) => item.timestamp <= asOf.toISOString());
  const crm30 = interactions.filter((item) => within(item.timestamp, asOf, 30));
  const crm90 = interactions.filter((item) => within(item.timestamp, asOf, 90));
  const lastContact = interactions.reduce<string | null>(
    (latest, item) => (!latest || item.timestamp > latest ? item.timestamp : latest),
    null,
  );
  const cases30 = raw.serviceCases.filter((item) => within(item.openedAt, asOf, 30));

  // Products.
  const owned = raw.products.filter(
    (product) => product.status !== 'CANCELLED' && product.contractedAt <= asOf.toISOString(),
  );
  const active = owned.filter((product) => product.usageFrequency !== 'RARE');
  const categories = new Set(owned.map((product) => PRODUCT_CATALOG[product.code].category));
  const ownedCodes = owned.map((product) => product.code);

  return {
    customer_id: identity.customerId,
    as_of: asOf.toISOString(),
    relationship_tenure_days: Math.max(0, daysBetween(identity.relationshipStartDate, asOf)),
    account_age_days: identity.accountOpenedAt
      ? Math.max(0, daysBetween(identity.accountOpenedAt, asOf))
      : 0,
    onboarding_completed: Boolean(
      identity.onboardingCompletedAt && identity.onboardingCompletedAt <= asOf.toISOString(),
    ),
    has_relationship_manager: Boolean(identity.relationshipManager),
    products_count: owned.length,
    active_products_count: active.length,
    active_products_ratio: owned.length ? active.length / owned.length : 0,
    product_categories_count: categories.size,
    // Baseline products (account and Pix) do not count as product expansion.
    new_products_90d: owned.filter(
      (product) =>
        product.code !== 'CONTA_PJ' &&
        product.code !== 'PIX' &&
        within(product.contractedAt, asOf, 90),
    ).length,
    owned_products: ownedCodes,
    relevant_gaps: Math.min(
      3,
      RELEVANT_GAP_PRODUCTS.filter((code) => !ownedCodes.includes(code)).length,
    ),
    avg_monthly_transaction_volume: Math.round(avgMonthly),
    transaction_volume_30d: Math.round(tx30),
    transaction_volume_prev_30d: Math.round(txPrev30),
    transaction_volume_60d: Math.round(tx60),
    transaction_volume_prev_60d: Math.round(txPrev60),
    transaction_volume_change_30d: relativeChange(tx30, txPrev30),
    transaction_volume_change_60d: relativeChange(tx60, txPrev60),
    inflow_30d: Math.round(sumWeeks(4, 0, (week) => week.inflowAmount)),
    inflow_change_60d: relativeChange(inflow60, inflowPrev60),
    outflow_30d: Math.round(sumWeeks(4, 0, (week) => week.outflowAmount)),
    pix_tx_count_30d: pixCount30,
    pix_volume_30d: Math.round(pixVolume30),
    pix_share_30d: tx30 ? pixVolume30 / tx30 : 0,
    boleto_count_30d: boleto30,
    card_volume_30d: Math.round(card30),
    card_volume_prev_30d: Math.round(cardPrev30),
    card_volume_change_30d: relativeChange(card30, cardPrev30),
    payments_volume_60d: Math.round(pay60),
    payments_volume_prev_60d: Math.round(payPrev60),
    payments_volume_change_60d: relativeChange(pay60, payPrev60),
    transactions_count_30d: pixCount30 + boleto30 + payments30,
    payment_means_used: [pixCount30 > 0, boleto30 > 0, card30 > 0].filter(Boolean).length,
    digital_sessions_30d: sessions30.length,
    digital_sessions_prev_30d: sessionsPrev30.length,
    digital_sessions_change_30d: relativeChange(sessions30.length, sessionsPrev30.length),
    digital_active_days_30d: activeDays.size,
    mobile_sessions_30d: mobile,
    web_sessions_30d: web,
    channel_mix: mobile > 0 && web > 0 ? 1 : mobile + web > 0 ? 0.6 : 0,
    logins_30d: events30.filter((event) => event.kind === 'LOGIN').length,
    features_used_30d: features.size,
    credit_page_views_14d: creditViews(events14),
    credit_page_views_prev_14d: creditViews(eventsPrev14),
    credit_searches_14d: events14.filter(
      (event) => event.kind === 'SEARCH' && isCredit(event.topic),
    ).length,
    credit_simulations_30d: events30.filter(
      (event) =>
        (event.kind === 'SIMULATION_COMPLETED' || event.kind === 'SIMULATION_STARTED') &&
        isCredit(event.topic),
    ).length,
    working_capital_simulations_30d: events30.filter(
      (event) => event.kind === 'SIMULATION_COMPLETED' && event.topic === 'CAPITAL_DE_GIRO',
    ).length,
    abandoned_credit_journeys_30d: events30.filter(
      (event) => event.kind === 'SIMULATION_ABANDONED' && isCredit(event.topic),
    ).length,
    product_views_30d: events30.filter(
      (event) => event.kind === 'PRODUCT_VIEW' || event.kind === 'CTA_CLICK',
    ).length,
    product_interest_30d: interest,
    crm_interactions_30d: crm30.length,
    crm_interactions_90d: crm90.length,
    commercial_contacts_30d: crm30.filter(
      (item) => item.commercial && item.direction === 'OUTBOUND',
    ).length,
    complaints_30d: cases30.filter((item) => item.kind === 'COMPLAINT').length,
    critical_complaints_30d: cases30.filter(
      (item) => item.kind === 'COMPLAINT' && item.severity === 'CRITICAL' && !item.resolved,
    ).length,
    unresolved_interactions_30d:
      crm30.filter((item) => !item.resolved).length +
      cases30.filter((item) => !item.resolved).length,
    days_since_last_contact: lastContact ? daysBetween(lastContact, asOf) : 999,
    days_since_last_login: lastLogin ? daysBetween(lastLogin, asOf) : 999,
    days_since_last_transaction: lastActiveWeek
      ? Math.max(0, daysBetween(lastActiveWeek.date, asOf) - 6)
      : 999,
    commercial_contact_allowed: raw.consent.commercialContact,
    data_quality: raw.sourceCoverage,
  };
}
