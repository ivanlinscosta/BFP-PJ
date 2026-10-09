import { CREDIT_TOPICS, SIGNAL_HALF_LIFE_DAYS, TOPIC_LABELS } from './config';
import { daysBetween } from './features';
import type {
  ContentTopic,
  CustomerDNA,
  CustomerFeatureSet,
  CustomerRawData,
  CustomerSignal,
  DnaDimensionId,
  SignalCategory,
  SignalEvidence,
} from './types';

const DAY_MS = 86_400_000;
const pct = (value: number) =>
  `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value * 100)}%`;

/** Exponential decay: a signal loses half of its strength every half-life. */
export function decayStrength(
  strength: number,
  detectedAt: string,
  asOf: string,
  halfLifeDays = SIGNAL_HALF_LIFE_DAYS,
) {
  const age = Math.max(0, daysBetween(detectedAt, asOf));
  return Math.round(strength * Math.pow(0.5, age / halfLifeDays) * 1000) / 1000;
}

interface SignalRule {
  type: string;
  category: SignalCategory;
  kind: CustomerSignal['kind'];
  ttlDays: number;
  dnaDimension?: DnaDimensionId;
  detect(input: SignalInput): null | {
    strength: number;
    title: string;
    description: string;
    value?: number | string;
    detectedAt?: string;
    source: string;
    evidence: SignalEvidence[];
  };
}

interface SignalInput {
  features: CustomerFeatureSet;
  raw: CustomerRawData;
  dna: CustomerDNA;
  asOf: string;
}

function latest(timestamps: string[]) {
  return timestamps.reduce<string | undefined>(
    (max, value) => (!max || value > max ? value : max),
    undefined,
  );
}

function recentEvents(raw: CustomerRawData, asOf: string, days: number) {
  const limit = new Date(asOf).getTime() - days * DAY_MS;
  return raw.events.filter(
    (event) => event.timestamp <= asOf && new Date(event.timestamp).getTime() >= limit,
  );
}

const ev = (
  feature: string,
  value: number | string | boolean,
  source: string,
  period?: string,
): SignalEvidence => ({
  feature,
  value,
  source,
  period,
});

export const SIGNAL_RULES: SignalRule[] = [
  {
    type: 'HIGH_CREDIT_INTENT',
    category: 'INTENT',
    kind: 'OPPORTUNITY',
    ttlDays: 30,
    dnaDimension: 'commercialIntent',
    detect({ features: f, raw, dna, asOf }) {
      const points = f.credit_page_views_14d + f.credit_searches_14d + f.credit_simulations_30d * 2;
      if (points < 5) return null;
      const credit = recentEvents(raw, asOf, 30).filter(
        (event) => event.topic && CREDIT_TOPICS.includes(event.topic),
      );
      return {
        strength: Math.min(1, 0.45 + points * 0.09),
        title: `Alta intenção em crédito · ${dna.commercialIntent.score}/100`,
        description: `${f.credit_page_views_14d} visitas a conteúdo de crédito em 14 dias e ${f.working_capital_simulations_30d} simulação(ões) concluída(s) em 30 dias.`,
        value: dna.commercialIntent.score,
        detectedAt: latest(credit.map((event) => event.timestamp)),
        source: 'Digital / CRM',
        evidence: [
          ev('credit_page_views_14d', f.credit_page_views_14d, 'Digital', '14 dias'),
          ev('credit_searches_14d', f.credit_searches_14d, 'Digital', '14 dias'),
          ev('credit_simulations_30d', f.credit_simulations_30d, 'Digital', '30 dias'),
          ev(
            'working_capital_simulations_30d',
            f.working_capital_simulations_30d,
            'Digital',
            '30 dias',
          ),
        ],
      };
    },
  },
  {
    type: 'HIGH_VALUE_RELATIONSHIP',
    category: 'RELATIONSHIP',
    kind: 'OPPORTUNITY',
    ttlDays: 30,
    dnaDimension: 'transactionActivity',
    detect({ features: f, dna }) {
      if (dna.transactionActivity.score < 65 || dna.digitalEngagement.score >= 45) return null;
      return {
        strength: Math.min(
          0.9,
          0.4 + (dna.transactionActivity.score - dna.digitalEngagement.score) / 120,
        ),
        title: 'Alto valor com pouco uso digital',
        description: `Atividade transacional ${dna.transactionActivity.score}/100 e engajamento digital ${dna.digitalEngagement.score}/100.`,
        value: dna.transactionActivity.score,
        source: 'Transações / Digital',
        evidence: [
          ev('transaction_volume_30d', f.transaction_volume_30d, 'Transações', '30 dias'),
          ev('logins_30d', f.logins_30d, 'Digital', '30 dias'),
        ],
      };
    },
  },
  {
    type: 'TRANSACTION_GROWTH',
    category: 'GROWTH',
    kind: 'OBSERVATION',
    ttlDays: 45,
    dnaDimension: 'businessMomentum',
    detect({ features: f }) {
      if (f.transaction_volume_change_60d < 0.1) return null;
      return {
        strength: Math.min(1, 0.4 + f.transaction_volume_change_60d * 2.5),
        title: `Volume transacional ${pct(f.transaction_volume_change_60d)} (60 dias)`,
        description: 'Volume de entradas e saídas acima da janela anterior de 60 dias.',
        value: Math.round(f.transaction_volume_change_60d * 100),
        source: 'Transações',
        evidence: [
          ev('transaction_volume_60d', f.transaction_volume_60d, 'Transações', '60 dias'),
          ev(
            'transaction_volume_change_60d',
            f.transaction_volume_change_60d,
            'Transações',
            '60 dias',
          ),
        ],
      };
    },
  },
  {
    type: 'TRANSACTION_DECLINE',
    category: 'TRANSACTION',
    kind: 'RISK',
    ttlDays: 45,
    dnaDimension: 'transactionActivity',
    detect({ features: f }) {
      if (f.transaction_volume_change_60d > -0.15) return null;
      return {
        strength: Math.min(1, 0.4 + Math.abs(f.transaction_volume_change_60d) * 2),
        title: `Queda do volume transacional ${pct(f.transaction_volume_change_60d)} (60 dias)`,
        description: 'Movimentação abaixo da janela anterior; acompanhar antes de qualquer oferta.',
        value: Math.round(f.transaction_volume_change_60d * 100),
        source: 'Transações',
        evidence: [
          ev(
            'transaction_volume_change_60d',
            f.transaction_volume_change_60d,
            'Transações',
            '60 dias',
          ),
        ],
      };
    },
  },
  {
    type: 'HIGH_DIGITAL_ENGAGEMENT',
    category: 'DIGITAL',
    kind: 'OBSERVATION',
    ttlDays: 30,
    dnaDimension: 'digitalEngagement',
    detect({ features: f, dna }) {
      if (dna.digitalEngagement.score < 80) return null;
      return {
        strength: Math.min(1, dna.digitalEngagement.score / 100),
        title:
          dna.digitalEngagement.score >= 90
            ? 'Engajamento digital muito alto'
            : 'Engajamento digital alto',
        description: `${f.logins_30d} logins e ${f.digital_active_days_30d} dias ativos nos últimos 30 dias.`,
        value: dna.digitalEngagement.score,
        source: 'Digital',
        evidence: [
          ev('logins_30d', f.logins_30d, 'Digital', '30 dias'),
          ev('digital_active_days_30d', f.digital_active_days_30d, 'Digital', '30 dias'),
          ev('features_used_30d', f.features_used_30d, 'Digital', '30 dias'),
        ],
      };
    },
  },
  {
    type: 'LOW_DIGITAL_ENGAGEMENT',
    category: 'DIGITAL',
    kind: 'RISK',
    ttlDays: 30,
    dnaDimension: 'digitalEngagement',
    detect({ features: f }) {
      if (f.logins_30d > 2 || f.account_age_days < 60) return null;
      return {
        strength: 0.6,
        title: 'Baixo engajamento digital',
        description: `${f.logins_30d} login(s) em 30 dias; último acesso há ${Math.min(f.days_since_last_login, 999)} dias.`,
        value: f.logins_30d,
        source: 'Digital',
        evidence: [
          ev('logins_30d', f.logins_30d, 'Digital', '30 dias'),
          ev('days_since_last_login', f.days_since_last_login, 'Digital'),
        ],
      };
    },
  },
  {
    type: 'PRODUCT_GAP_WORKING_CAPITAL',
    category: 'PRODUCT_GAP',
    kind: 'OPPORTUNITY',
    ttlDays: 60,
    dnaDimension: 'productDepth',
    detect({ features: f, raw }) {
      if (f.owned_products.includes('CAPITAL_DE_GIRO') || raw.identity.companySize === 'MEI')
        return null;
      if (
        f.credit_page_views_14d + f.credit_simulations_30d === 0 &&
        f.transaction_volume_change_60d < 0.08
      )
        return null;
      return {
        strength:
          0.55 +
          Math.min(
            0.35,
            f.credit_simulations_30d * 0.15 + Math.max(0, f.transaction_volume_change_60d),
          ),
        title: 'Gap identificado: Capital de Giro',
        description: 'Produto ainda não contratado, com sinais de necessidade de capital.',
        value: 'CAPITAL_DE_GIRO',
        source: 'Produtos',
        evidence: [
          ev('working_capital_owned', false, 'Produtos'),
          ev('products_count', f.products_count, 'Produtos'),
        ],
      };
    },
  },
  {
    type: 'PRODUCT_GAP_PIX_COLLECTION',
    category: 'PRODUCT_GAP',
    kind: 'OPPORTUNITY',
    ttlDays: 60,
    dnaDimension: 'productDepth',
    detect({ features: f }) {
      const interest = f.product_interest_30d.PIX_COBRANCA ?? 0;
      if (f.owned_products.includes('PIX_COBRANCA') || (f.pix_tx_count_30d < 40 && interest === 0))
        return null;
      return {
        strength: Math.min(0.95, 0.45 + interest * 0.12 + Math.min(0.3, f.pix_tx_count_30d / 400)),
        title: 'Gap identificado: Pix Cobrança',
        description: `${f.pix_tx_count_30d} transações Pix em 30 dias sem solução de cobrança Pix.`,
        value: 'PIX_COBRANCA',
        source: 'Produtos / Transações',
        evidence: [
          ev('pix_tx_count_30d', f.pix_tx_count_30d, 'Transações', '30 dias'),
          ev('pix_collection_interest_30d', interest, 'Digital', '30 dias'),
        ],
      };
    },
  },
  {
    type: 'PRODUCT_GAP_CARD',
    category: 'PRODUCT_GAP',
    kind: 'OPPORTUNITY',
    ttlDays: 60,
    dnaDimension: 'productDepth',
    detect({ features: f }) {
      if (f.owned_products.includes('CARTAO_EMPRESARIAL') || f.outflow_30d < 40_000) return null;
      return {
        strength: Math.min(0.85, 0.4 + Math.log10(Math.max(1, f.outflow_30d)) / 15),
        title: 'Gap identificado: Cartão PJ',
        description: 'Saídas recorrentes sem cartão empresarial para concentrar despesas.',
        value: 'CARTAO_EMPRESARIAL',
        source: 'Produtos / Transações',
        evidence: [ev('outflow_30d', f.outflow_30d, 'Transações', '30 dias')],
      };
    },
  },
  {
    type: 'ONBOARDING_INCOMPLETE',
    category: 'JOURNEY',
    kind: 'RISK',
    ttlDays: 90,
    detect({ features: f, raw }) {
      if (f.onboarding_completed || !raw.identity.accountOpenedAt || f.account_age_days < 3)
        return null;
      return {
        strength: Math.min(1, 0.6 + f.account_age_days / 60),
        title: 'Onboarding incompleto',
        description: `Conta aberta há ${f.account_age_days} dias sem onboarding concluído.`,
        value: f.account_age_days,
        detectedAt: raw.identity.accountOpenedAt,
        source: 'Onboarding',
        evidence: [
          ev('onboarding_completed', false, 'Onboarding'),
          ev('account_age_days', f.account_age_days, 'Cadastro PJ'),
        ],
      };
    },
  },
  {
    type: 'RECENT_COMPLAINT',
    category: 'RISK',
    kind: 'RISK',
    ttlDays: 45,
    dnaDimension: 'relationshipStrength',
    detect({ features: f, raw, asOf }) {
      if (f.complaints_30d === 0) return null;
      const last = raw.serviceCases
        .filter((item) => item.kind === 'COMPLAINT' && item.openedAt <= asOf)
        .sort((left, right) => right.openedAt.localeCompare(left.openedAt))[0];
      return {
        strength: f.critical_complaints_30d > 0 ? 1 : 0.7,
        title: f.critical_complaints_30d > 0 ? 'Reclamação crítica recente' : 'Reclamação recente',
        description: last
          ? `${last.subject}${last.resolved ? ' · resolvida' : ' · em aberto'}.`
          : 'Reclamação registrada nos últimos 30 dias.',
        value: f.complaints_30d,
        detectedAt: last?.openedAt,
        source: 'Atendimento',
        evidence: [
          ev('complaints_30d', f.complaints_30d, 'Atendimento', '30 dias'),
          ev('critical_complaints_30d', f.critical_complaints_30d, 'Atendimento', '30 dias'),
        ],
      };
    },
  },
  {
    type: 'UNRESOLVED_SERVICE',
    category: 'RELATIONSHIP',
    kind: 'RISK',
    ttlDays: 30,
    dnaDimension: 'relationshipStrength',
    detect({ features: f, raw, asOf }) {
      if (f.unresolved_interactions_30d === 0) return null;
      const open = raw.interactions
        .filter((item) => !item.resolved && item.timestamp <= asOf)
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
      return {
        strength: Math.min(1, 0.5 + f.unresolved_interactions_30d * 0.15),
        title: 'Contato recente sem resolução',
        description: open
          ? `${open.subject} · ${open.result}.`
          : 'Interação em aberto nos últimos 30 dias.',
        value: f.unresolved_interactions_30d,
        detectedAt: open?.timestamp,
        source: 'Relacionamento / CRM',
        evidence: [
          ev('unresolved_interactions_30d', f.unresolved_interactions_30d, 'CRM', '30 dias'),
        ],
      };
    },
  },
  {
    type: 'RELATIONSHIP_COOLDOWN',
    category: 'RELATIONSHIP',
    kind: 'OBSERVATION',
    ttlDays: 30,
    dnaDimension: 'relationshipStrength',
    detect({ features: f }) {
      if (!f.has_relationship_manager || f.days_since_last_contact < 60) return null;
      return {
        strength: Math.min(0.9, 0.4 + (f.days_since_last_contact - 60) / 200),
        title: 'Relacionamento esfriando',
        description: `Sem contato com o gerente há ${Math.min(f.days_since_last_contact, 999)} dias.`,
        value: f.days_since_last_contact,
        source: 'CRM',
        evidence: [ev('days_since_last_contact', f.days_since_last_contact, 'CRM')],
      };
    },
  },
  {
    type: 'CUSTOMER_INACTIVITY',
    category: 'RISK',
    kind: 'RISK',
    ttlDays: 30,
    dnaDimension: 'transactionActivity',
    detect({ features: f }) {
      if (f.days_since_last_transaction < 21 || f.days_since_last_login < 21) return null;
      return {
        strength: 0.75,
        title: 'Cliente inativo',
        description: `Sem transações há ${Math.min(f.days_since_last_transaction, 999)} dias e sem acesso há ${Math.min(f.days_since_last_login, 999)} dias.`,
        source: 'Transações / Digital',
        evidence: [
          ev('days_since_last_transaction', f.days_since_last_transaction, 'Transações'),
          ev('days_since_last_login', f.days_since_last_login, 'Digital'),
        ],
      };
    },
  },
  {
    type: 'INCREASED_PAYMENT_VOLUME',
    category: 'TRANSACTION',
    kind: 'OBSERVATION',
    ttlDays: 45,
    dnaDimension: 'transactionActivity',
    detect({ features: f }) {
      if (f.payments_volume_change_60d < 0.12) return null;
      return {
        strength: Math.min(0.9, 0.35 + f.payments_volume_change_60d * 2),
        title: `Pagamentos ${pct(f.payments_volume_change_60d)} (60 dias)`,
        description: 'Volume de pagamentos acima da janela anterior de 60 dias.',
        value: Math.round(f.payments_volume_change_60d * 100),
        source: 'Transações',
        evidence: [
          ev('payments_volume_change_60d', f.payments_volume_change_60d, 'Transações', '60 dias'),
        ],
      };
    },
  },
  {
    type: 'HIGH_PIX_USAGE',
    category: 'TRANSACTION',
    kind: 'OBSERVATION',
    ttlDays: 30,
    dnaDimension: 'transactionActivity',
    detect({ features: f }) {
      if (f.pix_share_30d < 0.45 || f.pix_tx_count_30d < 30) return null;
      return {
        strength: Math.min(0.9, f.pix_share_30d),
        title: 'Uso intenso de Pix',
        description: `${f.pix_tx_count_30d} transações Pix em 30 dias.`,
        value: f.pix_tx_count_30d,
        source: 'Transações',
        evidence: [
          ev('pix_tx_count_30d', f.pix_tx_count_30d, 'Transações', '30 dias'),
          ev('pix_share_30d', Math.round(f.pix_share_30d * 100) / 100, 'Transações', '30 dias'),
        ],
      };
    },
  },
  {
    type: 'ABANDONED_CREDIT_SIMULATION',
    category: 'JOURNEY',
    kind: 'OPPORTUNITY',
    ttlDays: 30,
    dnaDimension: 'commercialIntent',
    detect({ features: f, raw, asOf }) {
      if (f.abandoned_credit_journeys_30d === 0) return null;
      const abandoned = recentEvents(raw, asOf, 30).filter(
        (event) =>
          event.kind === 'SIMULATION_ABANDONED' &&
          event.topic &&
          CREDIT_TOPICS.includes(event.topic),
      );
      return {
        strength: Math.min(0.9, 0.5 + f.abandoned_credit_journeys_30d * 0.2),
        title: 'Simulação de crédito abandonada',
        description: 'Jornada de crédito iniciada no digital e não concluída.',
        value: f.abandoned_credit_journeys_30d,
        detectedAt: latest(abandoned.map((event) => event.timestamp)),
        source: 'Digital',
        evidence: [
          ev(
            'abandoned_credit_journeys_30d',
            f.abandoned_credit_journeys_30d,
            'Digital',
            '30 dias',
          ),
        ],
      };
    },
  },
  {
    type: 'RECENT_PRODUCT_INTEREST',
    category: 'INTENT',
    kind: 'OPPORTUNITY',
    ttlDays: 30,
    dnaDimension: 'commercialIntent',
    detect({ features: f, raw, asOf }) {
      const [topic, views] =
        (Object.entries(f.product_interest_30d) as Array<[ContentTopic, number]>)
          .filter(([candidate]) => !CREDIT_TOPICS.includes(candidate))
          .sort((left, right) => right[1] - left[1])[0] ?? [];
      if (!topic || !views || views < 2) return null;
      const last = recentEvents(raw, asOf, 30).filter((event) => event.topic === topic);
      return {
        strength: Math.min(0.85, 0.35 + views * 0.1),
        title: `Interesse recente: ${TOPIC_LABELS[topic]}`,
        description: `${views} interações com ${TOPIC_LABELS[topic]} nos últimos 30 dias.`,
        value: topic,
        detectedAt: latest(last.map((event) => event.timestamp)),
        source: 'Digital',
        evidence: [ev(`${topic.toLowerCase()}_views_30d`, views, 'Digital', '30 dias')],
      };
    },
  },
];

/**
 * Signal engine: evaluates every rule, stamps detection/expiry and applies temporal decay.
 * Expired signals are dropped; the rest are ordered by strength.
 */
export function detectSignals(input: SignalInput): CustomerSignal[] {
  const signals: CustomerSignal[] = [];
  for (const rule of SIGNAL_RULES) {
    const detected = rule.detect(input);
    if (!detected) continue;
    const detectedAt =
      detected.detectedAt && detected.detectedAt <= input.asOf ? detected.detectedAt : input.asOf;
    const expiresAt = new Date(
      new Date(detectedAt).getTime() + rule.ttlDays * DAY_MS,
    ).toISOString();
    if (expiresAt < input.asOf) continue;
    signals.push({
      id: `${input.features.customer_id}:${rule.type}`,
      customerId: input.features.customer_id,
      type: rule.type,
      category: rule.category,
      kind: rule.kind,
      title: detected.title,
      description: detected.description,
      value: detected.value,
      strength: decayStrength(Math.min(1, detected.strength), detectedAt, input.asOf),
      detectedAt,
      expiresAt,
      source: detected.source,
      evidence: detected.evidence,
      dnaDimension: rule.dnaDimension,
    });
  }
  return signals.sort((left, right) => right.strength - left.strength);
}
