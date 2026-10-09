import type {
  ContentTopic,
  CrmInteraction,
  CustomerProduct,
  CustomerRawData,
  DigitalEvent,
  DigitalSession,
  InteractionChannel,
  JourneyEvent,
  ProductCode,
  RecommendationOutcome,
  ServiceCase,
  TransactionAggregate,
} from '@bfp/customer-intelligence';
import type { CRMInteraction, Company, DatasetBundle } from '@bfp/domain';
import { DATASET_SEED } from '../constants';
import { createKeyedRandom } from '../prng';

/** Reference instant of the customer-intelligence dataset ("today" of the demo). */
export const INTELLIGENCE_AS_OF = '2026-10-09T12:00:00.000Z';
/** 18 months of weekly transactional history. */
export const HISTORY_WEEKS = 78;
/** Digital and service events are generated for the last 120 days (windows + trends). */
const DIGITAL_DAYS = 120;
const DAY_MS = 86_400_000;

/** Latent personas: they shape coherent behavior and are never shown to users. */
export const PERSONAS = [
  'CREDIT_INTENT',
  'DIGITAL_GROWER',
  'TRADITIONAL_HIGH_VALUE',
  'EARLY_JOURNEY',
  'SERVICE_RISK',
  'LOW_ENGAGEMENT',
  'MATURE_MULTIPRODUCT',
] as const;
export type Persona = (typeof PERSONAS)[number] | 'ATLAS' | 'PROSPECT';

const MANAGER_NAMES = [
  'Mariana Souza',
  'Rafael Lima',
  'Camila Rocha',
  'Bruno Carvalho',
  'Juliana Martins',
  'Felipe Araújo',
  'Patrícia Gomes',
  'Rodrigo Nunes',
  'Aline Barbosa',
  'Gustavo Ribeiro',
  'Larissa Teixeira',
  'Thiago Moreira',
  'Fernanda Dias',
  'André Cardoso',
  'Beatriz Ramos',
  'Leonardo Pinto',
  'Renata Freitas',
  'Marcelo Duarte',
  'Isabela Castro',
  'Diego Monteiro',
  'Vanessa Rezende',
  'Eduardo Prado',
  'Carolina Vieira',
  'Paulo Azevedo',
];

const MAIN_PRODUCT_CODES: Record<string, ProductCode | undefined> = {
  'product-001': 'CONTA_PJ',
  'product-002': 'CARTAO_EMPRESARIAL',
  'product-003': 'PIX_COBRANCA',
  'product-004': 'ANTECIPACAO',
  'product-005': 'CAPITAL_DE_GIRO',
  'product-007': 'SEGURO',
  'product-008': 'MAQUININHA',
  'product-010': 'INVESTIMENTOS',
};

const WEEKLY_VOLUME_BY_SIZE: Record<Company['companySize'], number> = {
  MEI: 6_000,
  Micro: 18_000,
  Pequena: 55_000,
  Média: 160_000,
  Grande: 520_000,
};

const FEATURES = [
  'extrato',
  'pix',
  'pagamentos',
  'boletos',
  'cartao',
  'cobranca',
  'investimentos',
  'folha',
  'relatorios',
  'simulador',
];

type Rand = () => number;
const between = (rand: Rand, min: number, max: number) => min + rand() * (max - min);
const int = (rand: Rand, min: number, max: number) => Math.floor(between(rand, min, max + 1));
const iso = (date: Date) => date.toISOString();
const addDays = (date: Date | string, days: number) =>
  new Date(new Date(date).getTime() + days * DAY_MS);
const pick = <T>(rand: Rand, items: readonly T[]) => items[Math.floor(rand() * items.length)]!;

function weighted<T>(rand: Rand, entries: Array<[T, number]>) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)![0];
}

/** Monday 00:00 UTC of the week containing `date`. */
function weekStart(date: Date) {
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
}

/** Business-hours timestamp `daysAgo` days before as-of. */
function stamp(rand: Rand, daysAgo: number) {
  const base = addDays(INTELLIGENCE_AS_OF, -daysAgo);
  const day = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      11 + int(rand, 0, 9),
      int(rand, 0, 59),
    ),
  );
  return day.getTime() > new Date(INTELLIGENCE_AS_OF).getTime() ? iso(addDays(day, -1)) : iso(day);
}

function choosePersona(company: Company, productCodes: ProductCode[], rand: Rand): Persona {
  const accountAge = company.accountOpenedAt
    ? (new Date(INTELLIGENCE_AS_OF).getTime() - new Date(company.accountOpenedAt).getTime()) /
      DAY_MS
    : 999;
  if (accountAge <= 120 && (!company.onboardingCompletedAt || rand() < 0.35))
    return 'EARLY_JOURNEY';
  const manyProducts = productCodes.length >= 4;
  return weighted<Persona>(rand, [
    ['CREDIT_INTENT', 19],
    ['DIGITAL_GROWER', 19],
    ['TRADITIONAL_HIGH_VALUE', 15],
    ['SERVICE_RISK', 9],
    ['LOW_ENGAGEMENT', 16],
    ['MATURE_MULTIPRODUCT', manyProducts ? 40 : 14],
  ]);
}

/** Persona product sets for customers without main-bundle products (established customers). */
function personaProducts(persona: Persona, rand: Rand): ProductCode[] {
  const maybe = (code: ProductCode, probability: number) => (rand() < probability ? [code] : []);
  switch (persona) {
    case 'CREDIT_INTENT':
      return [
        ...maybe('CARTAO_EMPRESARIAL', 0.7),
        ...maybe('BOLETO', 0.5),
        ...maybe('PIX_COBRANCA', 0.3),
      ];
    case 'DIGITAL_GROWER':
      return [...maybe('CARTAO_EMPRESARIAL', 0.5), ...maybe('BOLETO', 0.3)];
    case 'TRADITIONAL_HIGH_VALUE':
      return [
        'BOLETO',
        'CARTAO_EMPRESARIAL',
        ...maybe('COBRANCA', 0.5),
        ...maybe('CAPITAL_DE_GIRO', 0.4),
      ];
    case 'SERVICE_RISK':
      return [...maybe('CARTAO_EMPRESARIAL', 0.6), ...maybe('BOLETO', 0.5)];
    case 'LOW_ENGAGEMENT':
      return maybe('CARTAO_EMPRESARIAL', 0.3);
    case 'MATURE_MULTIPRODUCT':
      return [
        'PIX_COBRANCA',
        'BOLETO',
        'CARTAO_EMPRESARIAL',
        'MAQUININHA',
        'CAPITAL_DE_GIRO',
        ...maybe('SEGURO', 0.6),
        ...maybe('INVESTIMENTOS', 0.6),
      ];
    default:
      return maybe('CARTAO_EMPRESARIAL', 0.4);
  }
}

interface PersonaBehavior {
  growth: number;
  pixShare: number;
  sessionsPerWeek: number;
  sessionTrend: number;
  appShare: number;
  lastLoginDaysAgo: number;
  crmPer90: number;
}

function behaviorOf(persona: Persona, rand: Rand): PersonaBehavior {
  switch (persona) {
    case 'CREDIT_INTENT':
      return {
        growth: between(rand, 0.14, 0.3),
        pixShare: between(rand, 0.3, 0.45),
        sessionsPerWeek: between(rand, 3, 6),
        sessionTrend: between(rand, 0.05, 0.3),
        appShare: 0.55,
        lastLoginDaysAgo: int(rand, 0, 3),
        crmPer90: between(rand, 2, 4),
      };
    case 'DIGITAL_GROWER':
      return {
        growth: between(rand, 0.1, 0.25),
        pixShare: between(rand, 0.5, 0.7),
        sessionsPerWeek: between(rand, 5, 9),
        sessionTrend: between(rand, 0.1, 0.4),
        appShare: 0.72,
        lastLoginDaysAgo: int(rand, 0, 2),
        crmPer90: between(rand, 0.5, 2),
      };
    case 'TRADITIONAL_HIGH_VALUE':
      return {
        growth: between(rand, -0.08, 0.06),
        pixShare: between(rand, 0.15, 0.3),
        sessionsPerWeek: between(rand, 0.4, 1.4),
        sessionTrend: between(rand, -0.2, 0.1),
        appShare: 0.3,
        lastLoginDaysAgo: int(rand, 3, 20),
        crmPer90: between(rand, 4, 6),
      };
    case 'EARLY_JOURNEY':
      return {
        growth: 0,
        pixShare: between(rand, 0.3, 0.5),
        sessionsPerWeek: between(rand, 2, 5),
        sessionTrend: 0,
        appShare: 0.6,
        lastLoginDaysAgo: int(rand, 0, 8),
        crmPer90: between(rand, 1, 2),
      };
    case 'SERVICE_RISK':
      return {
        growth: between(rand, -0.15, 0.02),
        pixShare: between(rand, 0.3, 0.45),
        sessionsPerWeek: between(rand, 2, 4),
        sessionTrend: between(rand, -0.2, 0.1),
        appShare: 0.5,
        lastLoginDaysAgo: int(rand, 0, 6),
        crmPer90: between(rand, 4, 7),
      };
    case 'LOW_ENGAGEMENT':
      return {
        growth: between(rand, -0.4, -0.18),
        pixShare: between(rand, 0.25, 0.4),
        sessionsPerWeek: between(rand, 0.3, 1.2),
        sessionTrend: between(rand, -0.7, -0.4),
        appShare: 0.45,
        lastLoginDaysAgo: int(rand, 22, 50),
        crmPer90: between(rand, 0, 1),
      };
    case 'MATURE_MULTIPRODUCT':
      return {
        growth: between(rand, -0.03, 0.07),
        pixShare: between(rand, 0.35, 0.5),
        sessionsPerWeek: between(rand, 3, 6),
        sessionTrend: between(rand, -0.05, 0.1),
        appShare: 0.55,
        lastLoginDaysAgo: int(rand, 0, 4),
        crmPer90: between(rand, 3, 5),
      };
    case 'ATLAS':
    case 'PROSPECT':
      // Scripted separately (atlasRaw / prospectRaw).
      return {
        growth: 0,
        pixShare: 0.45,
        sessionsPerWeek: 0,
        sessionTrend: 0,
        appShare: 0.6,
        lastLoginDaysAgo: 0,
        crmPer90: 0,
      };
  }
}

function buildProducts(
  company: Company,
  codes: ProductCode[],
  persona: Persona,
  rand: Rand,
): CustomerProduct[] {
  const opened = company.accountOpenedAt ?? company.createdAt;
  const all = [...new Set<ProductCode>(['CONTA_PJ', 'PIX', ...codes])];
  return all.map((code, index) => {
    const contractedAt =
      code === 'CONTA_PJ'
        ? opened
        : iso(
            new Date(
              Math.min(
                new Date(INTELLIGENCE_AS_OF).getTime() - DAY_MS,
                addDays(
                  opened,
                  code === 'PIX' ? int(rand, 1, 6) : int(rand, 10, 300) + index * 7,
                ).getTime(),
              ),
            ),
          );
    const rare = persona === 'LOW_ENGAGEMENT' || (persona === 'SERVICE_RISK' && rand() < 0.3);
    const usageFrequency: CustomerProduct['usageFrequency'] =
      code === 'CONTA_PJ' || code === 'PIX'
        ? rare
          ? 'WEEKLY'
          : 'DAILY'
        : rare || rand() < 0.15
          ? 'RARE'
          : code === 'SEGURO' || code === 'INVESTIMENTOS' || code === 'CAPITAL_DE_GIRO'
            ? 'MONTHLY'
            : 'WEEKLY';
    return {
      code,
      contractedAt,
      status:
        code === 'CONTA_PJ'
          ? 'ACTIVE'
          : code === 'PIX'
            ? 'IN_USE'
            : usageFrequency === 'RARE'
              ? 'CONTRACTED'
              : 'IN_USE',
      usageFrequency,
      usageVolumeBand:
        usageFrequency === 'DAILY' ? 'HIGH' : usageFrequency === 'RARE' ? 'LOW' : 'MEDIUM',
    };
  });
}

function buildTransactions(
  company: Company,
  persona: Persona,
  behavior: PersonaBehavior,
  products: CustomerProduct[],
  rand: Rand,
): TransactionAggregate[] {
  const asOf = new Date(INTELLIGENCE_AS_OF);
  const lastWeek = weekStart(asOf);
  const opened = new Date(company.accountOpenedAt ?? company.createdAt);
  const base =
    WEEKLY_VOLUME_BY_SIZE[company.companySize] *
    between(rand, 0.6, 1.5) *
    (persona === 'TRADITIONAL_HIGH_VALUE' ? 1.6 : 1);
  const hasCard = products.some((product) => product.code === 'CARTAO_EMPRESARIAL');
  const cardShare = hasCard ? between(rand, 0.06, 0.14) : 0;
  const cardTrend = between(rand, -0.15, 0.1);
  const weeks: TransactionAggregate[] = [];
  for (let back = HISTORY_WEEKS - 1; back >= 0; back -= 1) {
    const date = addDays(lastWeek, -7 * back);
    if (date.getTime() + 6 * DAY_MS < opened.getTime()) continue;
    const weeksSinceOpen = (date.getTime() - opened.getTime()) / (7 * DAY_MS);
    const ramp = Math.min(1, 0.4 + Math.max(0, weeksSinceOpen) * 0.15);
    const trajectory = 1 + behavior.growth * Math.min(1, Math.max(0, (14 - back) / 14));
    const monthEnd =
      new Date(addDays(date, 6)).getUTCDate() >= 25 || new Date(addDays(date, 6)).getUTCDate() <= 3
        ? 1.12
        : 1;
    const volume = base * ramp * trajectory * monthEnd * between(rand, 0.9, 1.1);
    const inflow = volume * between(rand, 0.52, 0.58);
    const outflow = volume - inflow;
    const pixVolume = volume * behavior.pixShare;
    const card = outflow * cardShare * (back < 4 ? 1 + cardTrend : 1);
    weeks.push({
      customerId: company.id,
      date: iso(date).slice(0, 10),
      inflowAmount: Math.round(inflow),
      outflowAmount: Math.round(outflow),
      pixInCount: Math.round((pixVolume * 0.55) / between(rand, 1200, 2600)),
      pixOutCount: Math.round((pixVolume * 0.45) / between(rand, 1200, 2600)),
      pixVolume: Math.round(pixVolume),
      boletoCount: int(rand, 0, 4),
      boletoVolume: Math.round(volume * between(rand, 0.03, 0.1)),
      cardSpend: Math.round(card),
      paymentsCount: Math.round((outflow * 0.55) / between(rand, 4000, 8000)),
      paymentsVolume: Math.round(outflow * 0.55),
      balanceBand:
        company.companySize === 'Grande' || company.companySize === 'Média'
          ? 'HIGH'
          : company.companySize === 'Pequena'
            ? 'MEDIUM'
            : 'LOW',
    });
  }
  return weeks;
}

/** Topic interest of each persona (views over the last 30 days). */
function interestPlan(
  persona: Persona,
  products: ProductCode[],
  rand: Rand,
): Partial<Record<ContentTopic, number>> {
  const lacks = (code: ProductCode) => !products.includes(code);
  switch (persona) {
    case 'CREDIT_INTENT':
      return {
        CAPITAL_DE_GIRO: int(rand, 2, 4),
        ANTECIPACAO: int(rand, 0, 1),
        CARTOES: int(rand, 0, 1),
      };
    case 'DIGITAL_GROWER':
      return rand() < 0.6 && lacks('PIX_COBRANCA')
        ? { PIX_COBRANCA: int(rand, 2, 5), BOLETO: int(rand, 0, 1) }
        : { MAQUININHA: int(rand, 2, 5), PIX_COBRANCA: int(rand, 0, 1) };
    case 'TRADITIONAL_HIGH_VALUE':
      return { INVESTIMENTOS: int(rand, 0, 2) };
    case 'MATURE_MULTIPRODUCT':
      return { SEGUROS: int(rand, 0, 2), INVESTIMENTOS: int(rand, 0, 2), FOLHA: int(rand, 0, 1) };
    case 'EARLY_JOURNEY':
      return { CARTOES: int(rand, 0, 1) };
    default:
      return rand() < 0.3 ? { [pick(rand, ['CARTOES', 'BOLETO', 'SEGUROS'] as const)]: 1 } : {};
  }
}

function buildDigital(
  customerId: string,
  persona: Persona,
  behavior: PersonaBehavior,
  products: ProductCode[],
  openedAt: string,
  rand: Rand,
) {
  const sessions: DigitalSession[] = [];
  const events: DigitalEvent[] = [];
  const openedDaysAgo =
    (new Date(INTELLIGENCE_AS_OF).getTime() - new Date(openedAt).getTime()) / DAY_MS;
  const ownedFeatures = FEATURES.filter(
    (feature, index) => index < 3 || products.length > index - 1,
  );
  for (let day = DIGITAL_DAYS; day >= 0; day -= 1) {
    if (day > openedDaysAgo) continue;
    if (day < behavior.lastLoginDaysAgo) continue;
    const trend = day < 30 ? 1 + behavior.sessionTrend : 1;
    const perDay = (behavior.sessionsPerWeek / 7) * trend;
    let count = Math.floor(perDay) + (rand() < perDay % 1 ? 1 : 0);
    if (day === behavior.lastLoginDaysAgo && count === 0) count = 1;
    for (let index = 0; index < count; index += 1) {
      const timestamp = stamp(rand, day);
      const channel = rand() < behavior.appShare ? 'APP' : 'WEB';
      const used = [
        ...new Set(Array.from({ length: int(rand, 1, 3) }, () => pick(rand, ownedFeatures))),
      ];
      sessions.push({
        customerId,
        timestamp,
        channel,
        device: channel === 'APP' ? (rand() < 0.55 ? 'ANDROID' : 'IOS') : 'DESKTOP',
        durationSeconds: int(rand, 60, 900),
        pages: int(rand, 2, 14),
        featuresUsed: used,
        source: channel === 'APP' ? 'App Itaú Empresas' : 'Internet Banking',
      });
      events.push({ customerId, timestamp, kind: 'LOGIN', channel });
      for (const feature of used)
        events.push({ customerId, timestamp, kind: 'FEATURE_USED', channel, feature });
    }
  }

  // Topic interest: views spread over the last 30 days (credit ones concentrated in 14 days).
  const plan = interestPlan(persona, products, rand);
  for (const [topic, views] of Object.entries(plan) as Array<[ContentTopic, number]>) {
    const credit = topic === 'CAPITAL_DE_GIRO' || topic === 'ANTECIPACAO';
    for (let view = 0; view < views; view += 1) {
      const day = credit ? int(rand, 1, 13) : int(rand, 1, 29);
      if (day > openedDaysAgo) continue;
      events.push({
        customerId,
        timestamp: stamp(rand, day),
        kind: rand() < 0.6 ? 'PAGE_VIEW' : 'PRODUCT_VIEW',
        channel: rand() < behavior.appShare ? 'APP' : 'WEB',
        topic,
      });
    }
  }
  if (persona === 'CREDIT_INTENT') {
    for (let search = 0; search < int(rand, 1, 3); search += 1) {
      events.push({
        customerId,
        timestamp: stamp(rand, int(rand, 1, 13)),
        kind: 'SEARCH',
        channel: 'WEB',
        topic: 'CAPITAL_DE_GIRO',
      });
    }
    const day = int(rand, 1, 20);
    events.push({
      customerId,
      timestamp: stamp(rand, day),
      kind: 'SIMULATION_STARTED',
      channel: 'WEB',
      topic: 'CAPITAL_DE_GIRO',
    });
    events.push({
      customerId,
      timestamp: stamp(rand, day),
      kind: rand() < 0.6 ? 'SIMULATION_COMPLETED' : 'SIMULATION_ABANDONED',
      channel: 'WEB',
      topic: 'CAPITAL_DE_GIRO',
    });
  }
  if (persona === 'DIGITAL_GROWER') {
    for (let click = 0; click < int(rand, 1, 3); click += 1) {
      events.push({
        customerId,
        timestamp: stamp(rand, int(rand, 1, 25)),
        kind: 'CTA_CLICK',
        channel: 'APP',
        topic: (Object.keys(plan)[0] as ContentTopic | undefined) ?? 'PIX_COBRANCA',
      });
    }
  }
  return { sessions, events };
}

const SUBJECTS: Record<string, Array<[string, string]>> = {
  relationship: [
    ['Acompanhamento do relacionamento', 'Registro atualizado pelo gerente'],
    ['Revisão de limites e tarifas', 'Orientação concluída'],
    ['Planejamento financeiro', 'Conversa consultiva realizada'],
  ],
  service: [
    ['Acesso aos canais digitais', 'Orientação de acesso concluída'],
    ['Funcionalidades de cobrança', 'Orientação concluída'],
    ['Dúvida sobre extrato', 'Esclarecido'],
  ],
  problem: [
    ['Pix não compensado', 'Em análise'],
    ['Cobrança indevida de tarifa', 'Retorno pendente'],
    ['Cartão bloqueado', 'Em acompanhamento'],
  ],
};

function buildInteractions(
  customerId: string,
  persona: Persona,
  behavior: PersonaBehavior,
  manager: string | null,
  openedAt: string,
  rand: Rand,
) {
  const interactions: CrmInteraction[] = [];
  const serviceCases: ServiceCase[] = [];
  const openedDaysAgo = Math.floor(
    (new Date(INTELLIGENCE_AS_OF).getTime() - new Date(openedAt).getTime()) / DAY_MS,
  );
  const total = Math.round((behavior.crmPer90 * Math.min(540, openedDaysAgo)) / 90);
  const recentOnlyOld = persona === 'LOW_ENGAGEMENT';
  for (let index = 0; index < total; index += 1) {
    const day = recentOnlyOld
      ? int(rand, 75, Math.max(76, Math.min(540, openedDaysAgo)))
      : int(rand, 0, Math.max(1, Math.min(540, openedDaysAgo)));
    const kind =
      persona === 'SERVICE_RISK' && day < 45 && rand() < 0.5
        ? 'problem'
        : rand() < 0.55
          ? 'relationship'
          : 'service';
    const [subject, result] = pick(rand, SUBJECTS[kind]!);
    const channel: InteractionChannel =
      kind === 'relationship'
        ? rand() < 0.6
          ? 'PHONE'
          : 'WHATSAPP'
        : pick(rand, ['CHAT', 'WHATSAPP', 'AI_ASSISTANT', 'PHONE'] as const);
    const resolved = kind !== 'problem' || rand() < 0.3;
    interactions.push({
      id: `${customerId}-crm-${index}`,
      customerId,
      timestamp: stamp(rand, day),
      channel,
      subject,
      result: resolved ? result : 'Sem resolução · retorno pendente',
      resolved,
      relationshipManager: kind === 'relationship' ? manager : null,
      direction: kind === 'relationship' ? 'OUTBOUND' : 'INBOUND',
      commercial: false,
      sentiment: kind === 'problem' ? 'NEGATIVE' : undefined,
    });
  }
  // Commercial fatigue: some customers were approached many times recently.
  if (rand() < 0.08 && persona !== 'EARLY_JOURNEY') {
    for (let index = 0; index < int(rand, 3, 4); index += 1) {
      interactions.push({
        id: `${customerId}-offer-${index}`,
        customerId,
        timestamp: stamp(rand, int(rand, 1, 28)),
        channel: pick(rand, ['PHONE', 'WHATSAPP', 'EMAIL'] as const),
        subject: 'Oferta comercial',
        result: 'Sem interesse no momento',
        resolved: true,
        relationshipManager: manager,
        direction: 'OUTBOUND',
        commercial: true,
      });
    }
  }
  if (persona === 'SERVICE_RISK') {
    const critical = rand() < 0.55;
    serviceCases.push({
      id: `${customerId}-case-0`,
      customerId,
      openedAt: stamp(rand, int(rand, 2, 20)),
      kind: 'COMPLAINT',
      severity: critical ? 'CRITICAL' : 'MEDIUM',
      subject: pick(rand, [
        'Cobrança indevida de tarifa',
        'Pix não compensado',
        'Falha no acesso ao app',
      ]),
      resolved: !critical && rand() < 0.4,
      resolvedAt: null,
    });
  } else if (rand() < 0.04) {
    serviceCases.push({
      id: `${customerId}-case-0`,
      customerId,
      openedAt: stamp(rand, int(rand, 10, 100)),
      kind: 'QUESTION',
      severity: 'LOW',
      subject: 'Dúvida sobre tarifas',
      resolved: true,
      resolvedAt: stamp(rand, 5),
    });
  }
  return { interactions, serviceCases };
}

function buildMilestones(
  company: Company,
  bundle: Pick<DatasetBundle, 'mediaTouchpoints'>,
): JourneyEvent[] {
  const milestones: JourneyEvent[] = [];
  const channelLabel: Record<string, string> = {
    GOOGLE_SEARCH: 'Google Ads',
    META: 'Meta Ads',
    LINKEDIN: 'LinkedIn Ads',
    ORGANIC: 'Busca orgânica',
    REFERRAL: 'Indicação',
    EMAIL: 'E-mail marketing',
    INSIDE_SALES: 'Inside Sales',
  };
  const touchpoint = bundle.mediaTouchpoints.find((item) => item.companyId === company.id);
  const label = channelLabel[company.acquisitionChannel] ?? company.acquisitionChannel;
  const exposure =
    touchpoint?.occurredAt && touchpoint.occurredAt <= company.leadCreatedAt
      ? touchpoint.occurredAt
      : iso(addDays(company.leadCreatedAt, -1));
  milestones.push({
    date: exposure,
    title: `Exposição ${label}`,
    source: `Mídia / ${label}`,
    kind: 'MEDIA',
  });
  milestones.push({
    date: iso(addDays(company.leadCreatedAt, -0.5)),
    title: 'Visita ao site',
    source: 'Digital / Site Itaú Empresas',
    kind: 'DIGITAL',
  });
  milestones.push({
    date: company.leadCreatedAt,
    title: 'Lead criado',
    source: 'CRM',
    kind: 'LEAD',
  });
  if (company.accountOpeningStartedAt)
    milestones.push({
      date: company.accountOpeningStartedAt,
      title: 'Início da abertura',
      source: 'Abertura',
      kind: 'OPENING',
    });
  if (company.accountOpenedAt)
    milestones.push({
      date: company.accountOpenedAt,
      title: 'Conta aberta',
      source: 'Cadastro PJ',
      kind: 'ACCOUNT',
    });
  if (company.onboardingCompletedAt)
    milestones.push({
      date: company.onboardingCompletedAt,
      title: 'Onboarding concluído',
      source: 'Onboarding',
      kind: 'ONBOARDING',
    });
  return milestones;
}

function buildOutcomes(customerId: string, persona: Persona, rand: Rand): RecommendationOutcome[] {
  if (rand() > 0.07) return [];
  const actionId =
    persona === 'CREDIT_INTENT'
      ? 'OFFER_WORKING_CAPITAL'
      : persona === 'DIGITAL_GROWER'
        ? 'PROMOTE_PIX_COLLECTION'
        : persona === 'LOW_ENGAGEMENT'
          ? 'REENGAGE_DIGITAL'
          : null;
  if (!actionId) return [];
  const timestamp = stamp(rand, int(rand, 4, 18));
  return [
    {
      recommendationId: `${customerId}:${actionId}:history`,
      customerId,
      actionId,
      status: rand() < 0.5 ? 'DISMISSED' : 'ACTIVATED',
      timestamp,
      channel: 'RELATIONSHIP_MANAGER',
      reason: 'Histórico sintético',
      actor: 'seed',
    },
  ];
}

/**
 * Atlas Tecnologia: fixed story of the demo. Only raw behavior is scripted (visits, simulation,
 * transactions, contacts); DNA, signals and the NBA are computed by the same algorithm as
 * every other customer.
 */
function atlasRaw(company: Company): CustomerRawData {
  const id = company.id;
  const weeksPlan: Array<[string, number]> = [
    ['2026-07-20', 125_000],
    ['2026-07-27', 135_000],
    ['2026-08-03', 140_000],
    ['2026-08-10', 148_000],
    ['2026-08-17', 145_000],
    ['2026-08-24', 160_000],
    ['2026-08-31', 150_000],
    ['2026-09-07', 138_000],
    ['2026-09-14', 128_000],
    ['2026-09-21', 160_000],
    ['2026-09-28', 238_000],
    ['2026-10-05', 174_000],
  ];
  const transactions: TransactionAggregate[] = weeksPlan.map(([date, volume], index) => {
    const inflow = volume * 0.54;
    const outflow = volume - inflow;
    return {
      customerId: id,
      date,
      inflowAmount: Math.round(inflow),
      outflowAmount: Math.round(outflow),
      pixInCount: Math.round((volume * 0.45 * 0.55) / 2500),
      pixOutCount: Math.round((volume * 0.45 * 0.45) / 2500),
      pixVolume: Math.round(volume * 0.45),
      boletoCount: index % 2 === 0 ? 3 : 2,
      boletoVolume: Math.round(volume * 0.05),
      cardSpend: index >= 8 ? 8_800 : index >= 4 ? 10_000 : 9_000,
      paymentsCount: Math.round((outflow * 0.55) / 6000),
      paymentsVolume: Math.round(outflow * 0.55),
      balanceBand: 'HIGH',
    };
  });

  const sessions: DigitalSession[] = [];
  const events: DigitalEvent[] = [];
  const session = (daysAgo: number, hour: number, channel: 'APP' | 'WEB', features: string[]) => {
    const base = addDays(INTELLIGENCE_AS_OF, -daysAgo);
    const timestamp = iso(
      new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hour, 10)),
    );
    sessions.push({
      customerId: id,
      timestamp,
      channel,
      device: channel === 'APP' ? 'IOS' : 'DESKTOP',
      durationSeconds: 420,
      pages: 8,
      featuresUsed: features,
      source: channel === 'APP' ? 'App Itaú Empresas' : 'Internet Banking',
    });
    events.push({ customerId: id, timestamp, kind: 'LOGIN', channel });
    return timestamp;
  };
  // Last 30 days: 19 sessions on 17 days, 7 features, App and Internet Banking (+27% vs. 15).
  const recentDays = [0, 1, 2, 2, 4, 5, 7, 8, 9, 11, 12, 14, 15, 16, 16, 19, 22, 24, 27];
  const featureCycle = [
    ['pix', 'extrato'],
    ['pagamentos'],
    ['simulador', 'extrato'],
    ['boletos'],
    ['cartao', 'pix'],
    ['relatorios'],
    ['cobranca', 'pix'],
  ];
  recentDays.forEach((day, index) =>
    session(
      day,
      8 + (index % 3),
      index % 3 === 0 ? 'WEB' : 'APP',
      featureCycle[index % featureCycle.length]!,
    ),
  );
  for (let index = 0; index < 15; index += 1)
    session(31 + index * 2, 13, index % 2 ? 'APP' : 'WEB', ['pix', 'extrato']);
  for (let index = 0; index < 12; index += 1) session(62 + index * 4, 14, 'APP', ['pix']);

  const event = (
    daysAgo: number,
    kind: DigitalEvent['kind'],
    topic?: ContentTopic,
    channel: 'APP' | 'WEB' = 'WEB',
  ) => {
    const base = addDays(INTELLIGENCE_AS_OF, -daysAgo);
    events.push({
      customerId: id,
      timestamp: iso(
        new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 15, 30)),
      ),
      kind,
      channel,
      topic,
    });
  };
  // Credit: 3 visits in 14 days (latest 05 Oct), 2 searches, 1 completed simulation (07 Oct).
  event(4, 'PAGE_VIEW', 'CAPITAL_DE_GIRO');
  event(9, 'PRODUCT_VIEW', 'CAPITAL_DE_GIRO');
  event(12, 'PAGE_VIEW', 'CAPITAL_DE_GIRO');
  event(6, 'SEARCH', 'CAPITAL_DE_GIRO');
  event(10, 'SEARCH', 'CAPITAL_DE_GIRO');
  event(2, 'SIMULATION_STARTED', 'CAPITAL_DE_GIRO');
  event(2, 'SIMULATION_COMPLETED', 'CAPITAL_DE_GIRO');
  event(7, 'SIMULATION_ABANDONED', 'ANTECIPACAO');
  // Other interests: Pix Cobrança (2) and Cartões (1); product interactions.
  event(8, 'PRODUCT_VIEW', 'PIX_COBRANCA', 'APP');
  event(17, 'PAGE_VIEW', 'PIX_COBRANCA', 'APP');
  event(20, 'PRODUCT_VIEW', 'CARTOES', 'APP');
  event(3, 'CTA_CLICK', 'CAPITAL_DE_GIRO');
  event(15, 'CTA_CLICK', 'PIX_COBRANCA', 'APP');
  event(25, 'PRODUCT_VIEW', 'CARTOES', 'APP');
  event(28, 'CTA_CLICK', 'CARTOES', 'APP');
  // Earlier interest (late August): the intent was already "Média" 30 days ago.
  event(37, 'PAGE_VIEW', 'CAPITAL_DE_GIRO');
  event(43, 'PAGE_VIEW', 'CAPITAL_DE_GIRO');
  event(40, 'PAGE_VIEW', 'ANTECIPACAO');
  event(41, 'SEARCH', 'ANTECIPACAO');
  event(36, 'SIMULATION_ABANDONED', 'ANTECIPACAO');
  // Late August: interest in Pix Cobrança and Maquininha ranked those offers above credit then.
  event(34, 'PRODUCT_VIEW', 'PIX_COBRANCA', 'APP');
  event(38, 'PAGE_VIEW', 'PIX_COBRANCA', 'APP');
  event(42, 'CTA_CLICK', 'PIX_COBRANCA', 'APP');
  event(35, 'PRODUCT_VIEW', 'MAQUININHA', 'APP');
  event(39, 'PAGE_VIEW', 'MAQUININHA', 'APP');
  event(44, 'PRODUCT_VIEW', 'MAQUININHA', 'APP');
  event(32, 'CTA_CLICK', 'MAQUININHA', 'APP');
  event(33, 'PRODUCT_VIEW', 'PIX_COBRANCA', 'APP');
  event(40, 'PRODUCT_VIEW', 'MAQUININHA', 'APP');

  const crm = (
    daysAgo: number,
    channel: InteractionChannel,
    subject: string,
    result: string,
    resolved: boolean,
    manager: boolean,
    sentiment?: CrmInteraction['sentiment'],
  ) => {
    const base = addDays(INTELLIGENCE_AS_OF, -daysAgo);
    return {
      id: `${id}-crm-${daysAgo}`,
      customerId: id,
      timestamp: iso(
        new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 9, 0)),
      ),
      channel,
      subject,
      result,
      resolved,
      relationshipManager: manager ? 'Mariana Souza' : null,
      direction: manager ? 'OUTBOUND' : 'INBOUND',
      commercial: false,
      sentiment,
    } satisfies CrmInteraction;
  };

  return {
    identity: {
      customerId: id,
      tradeName: company.tradeName,
      legalName: company.legalName,
      cnpjMasked: company.cnpjMasked,
      industry: company.industry,
      segment: company.segment,
      companySize: company.companySize,
      state: company.state,
      city: company.city,
      region: company.region,
      status: 'ACTIVE',
      // 14 months including the pre-account relationship (demonstrative hypothesis).
      relationshipStartDate: '2025-08-05T12:00:00.000Z',
      accountOpenedAt: company.accountOpenedAt,
      onboardingCompletedAt: company.onboardingCompletedAt,
      relationshipManager: 'Mariana Souza',
      acquisitionChannel: company.acquisitionChannel,
      acquisitionCampaign: company.acquisitionCampaignId,
    },
    consent: { commercialContact: true, digitalCommunication: true },
    products: [
      {
        code: 'CONTA_PJ',
        contractedAt: '2026-07-18T16:40:00.000Z',
        status: 'ACTIVE',
        usageFrequency: 'DAILY',
        usageVolumeBand: 'HIGH',
      },
      {
        code: 'PIX',
        contractedAt: '2026-07-23T09:15:00.000Z',
        status: 'IN_USE',
        usageFrequency: 'DAILY',
        usageVolumeBand: 'HIGH',
      },
      {
        code: 'CARTAO_EMPRESARIAL',
        contractedAt: '2026-07-27T15:00:00.000Z',
        status: 'CONTRACTED',
        usageFrequency: 'WEEKLY',
        usageVolumeBand: 'MEDIUM',
      },
      {
        code: 'BOLETO',
        contractedAt: '2026-08-14T15:00:00.000Z',
        status: 'CONTRACTED',
        usageFrequency: 'RARE',
        usageVolumeBand: 'LOW',
      },
    ],
    transactions,
    sessions,
    events,
    interactions: [
      crm(
        71,
        'PHONE',
        'Acompanhamento inicial',
        'Registro de relacionamento após a ativação',
        true,
        true,
      ),
      crm(
        4,
        'PHONE',
        'Acesso aos canais digitais',
        'Resolvido · orientação de acesso concluída',
        true,
        false,
      ),
      crm(3, 'CHAT', 'Funcionalidades de cobrança', 'Orientação concluída', true, false),
      crm(
        2,
        'AI_ASSISTANT',
        'Informação sobre crédito',
        'Orientação demonstrativa; sem aprovação de crédito',
        true,
        false,
      ),
      crm(
        1,
        'WHATSAPP',
        'Necessidade de capital',
        'Sem resolução · retorno em acompanhamento',
        false,
        false,
        'NEUTRAL',
      ),
      crm(
        0,
        'PHONE',
        'Acompanhamento do relacionamento',
        'Registro atualizado pelo gerente; conversa de 08 Out em acompanhamento',
        true,
        true,
      ),
    ],
    serviceCases: [],
    outcomes: [],
    milestones: [
      {
        date: '2026-07-12T10:00:00.000Z',
        title: 'Exposição Google Ads',
        source: 'Mídia / Google Ads',
        kind: 'MEDIA',
      },
      {
        date: '2026-07-12T10:20:00.000Z',
        title: 'Visita ao site',
        source: 'Digital / Site Itaú Empresas',
        kind: 'DIGITAL',
      },
      { date: company.leadCreatedAt, title: 'Lead criado', source: 'CRM', kind: 'LEAD' },
      {
        date: company.accountOpeningStartedAt ?? company.leadCreatedAt,
        title: 'Início da abertura',
        source: 'Abertura',
        kind: 'OPENING',
      },
      {
        date: company.accountOpenedAt ?? company.leadCreatedAt,
        title: 'Conta aberta',
        source: 'Cadastro PJ',
        kind: 'ACCOUNT',
      },
      {
        date: company.onboardingCompletedAt ?? company.leadCreatedAt,
        title: 'Onboarding concluído',
        source: 'Onboarding',
        kind: 'ONBOARDING',
      },
    ],
    sourceCoverage: 0.99,
  };
}

const CRM_CHANNELS: Record<CRMInteraction['interactionType'], InteractionChannel> = {
  CALL: 'PHONE',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  MEETING: 'BRANCH',
  TASK: 'PHONE',
};

const CRM_RESULTS: Record<CRMInteraction['outcome'], string> = {
  CONNECTED: 'Contato realizado',
  NO_ANSWER: 'Sem resposta',
  FOLLOW_UP: 'Retorno agendado',
  RESOLVED: 'Concluído',
  OPEN: 'Em aberto',
};

const PROSPECT_TOPICS: ContentTopic[] = ['PIX_COBRANCA', 'MAQUININHA', 'CARTOES', 'BOLETO'];

/**
 * Leads and accounts in opening (no account yet): site visits around the lead, the opening
 * journey when it started, recent interest when the lead is fresh and the CRM history of the
 * dataset. No products or transactions — the profile shows where the company is in the journey.
 */
function prospectRaw(
  company: Company,
  crm: CRMInteraction[],
  touchpoints: DatasetBundle['mediaTouchpoints'],
  manager: string | null,
  rand: Rand,
): CustomerRawData {
  const asOf = new Date(INTELLIGENCE_AS_OF).getTime();
  const daysAgo = (value: string) =>
    Math.max(0, Math.floor((asOf - new Date(value).getTime()) / DAY_MS));
  const sessions: DigitalSession[] = [];
  const events: DigitalEvent[] = [];
  const visit = (ago: number, source: string, topic?: ContentTopic) => {
    const timestamp = stamp(rand, ago);
    sessions.push({
      customerId: company.id,
      timestamp,
      channel: 'WEB',
      device: rand() < 0.6 ? 'DESKTOP' : 'ANDROID',
      durationSeconds: int(rand, 60, 600),
      pages: int(rand, 2, 9),
      featuresUsed: [],
      source,
    });
    events.push({ customerId: company.id, timestamp, kind: 'PAGE_VIEW', channel: 'WEB', topic });
  };
  const leadAgo = daysAgo(company.leadCreatedAt);
  for (let index = 0; index < int(rand, 1, 3); index += 1)
    visit(Math.min(DIGITAL_DAYS, leadAgo + int(rand, 0, 2)), 'Site Itaú Empresas');
  if (company.accountOpeningStartedAt) {
    const openingAgo = daysAgo(company.accountOpeningStartedAt);
    visit(openingAgo, 'Abertura de conta digital');
    if (openingAgo > 1 && rand() < 0.6)
      visit(int(rand, 0, Math.min(openingAgo, 20)), 'Abertura de conta digital');
  }
  // Fresh leads keep researching products while they decide.
  if (leadAgo <= 45) {
    for (let index = 0; index < int(rand, 0, 4); index += 1)
      visit(int(rand, 0, Math.min(leadAgo, 29)), 'Site Itaú Empresas', pick(rand, PROSPECT_TOPICS));
  }
  const interactions: CrmInteraction[] = crm
    .filter((item) => item.occurredAt <= INTELLIGENCE_AS_OF)
    .map((item) => ({
      id: item.id,
      customerId: company.id,
      timestamp: item.occurredAt,
      channel: CRM_CHANNELS[item.interactionType],
      subject: company.accountOpeningStartedAt ? 'Apoio à abertura de conta' : 'Contato com lead',
      result: CRM_RESULTS[item.outcome],
      resolved: item.outcome !== 'OPEN',
      relationshipManager: manager,
      direction: item.direction,
      commercial: item.direction === 'OUTBOUND',
    }));
  return {
    identity: {
      customerId: company.id,
      tradeName: company.tradeName,
      legalName: company.legalName,
      cnpjMasked: company.cnpjMasked,
      industry: company.industry,
      segment: company.segment,
      companySize: company.companySize,
      state: company.state,
      city: company.city,
      region: company.region,
      status: 'PROSPECT',
      relationshipStartDate: company.leadCreatedAt,
      accountOpenedAt: null,
      onboardingCompletedAt: null,
      relationshipManager: manager,
      acquisitionChannel: company.acquisitionChannel,
      acquisitionCampaign: company.acquisitionCampaignId,
    },
    consent: { commercialContact: company.lgpdConsent, digitalCommunication: company.lgpdConsent },
    products: [],
    transactions: [],
    sessions,
    events,
    interactions,
    serviceCases: [],
    outcomes: [],
    milestones: buildMilestones(
      { ...company, accountOpenedAt: null, onboardingCompletedAt: null },
      { mediaTouchpoints: touchpoints },
    ),
    sourceCoverage: between(rand, 0.86, 1),
  };
}

/**
 * Generates the raw behavioral data of every customer with an open account (~5,000): 18 months
 * of weekly transactions, 120 days of digital sessions/events, CRM, service and previous
 * recommendation outcomes, all driven by a latent persona so DNA, signals and NBA are coherent.
 */
export function generateIntelligenceRaw(bundle: DatasetBundle, seed = DATASET_SEED) {
  const productsByCompany = new Map<string, ProductCode[]>();
  for (const item of bundle.companyProducts) {
    const code = MAIN_PRODUCT_CODES[item.productId];
    if (!code || item.status === 'CANCELLED') continue;
    productsByCompany.set(item.companyId, [...(productsByCompany.get(item.companyId) ?? []), code]);
  }
  const touchpointsByCompany = new Map<string, DatasetBundle['mediaTouchpoints']>();
  for (const touchpoint of bundle.mediaTouchpoints) {
    if (touchpointsByCompany.has(touchpoint.companyId)) continue;
    touchpointsByCompany.set(touchpoint.companyId, [touchpoint]);
  }

  const crmByCompany = new Map<string, CRMInteraction[]>();
  for (const item of bundle.crmInteractions)
    crmByCompany.set(item.companyId, [...(crmByCompany.get(item.companyId) ?? []), item]);
  const managerOf = (company: Company) =>
    company.relationshipManagerId
      ? (MANAGER_NAMES[
          Number(company.relationshipManagerId.replace(/\D/g, '')) % MANAGER_NAMES.length
        ] ?? null)
      : null;

  // Every company of the dataset gets a profile: customers with an account and prospects.
  const customers = bundle.companies.filter(
    (company) => company.leadCreatedAt <= INTELLIGENCE_AS_OF,
  );
  const personas = new Map<string, Persona>();
  const raws = customers.map((company): CustomerRawData => {
    if (company.tradeName === 'Atlas Tecnologia Ltda.') {
      personas.set(company.id, 'ATLAS');
      return atlasRaw(company);
    }
    const rand = createKeyedRandom(seed, `intelligence:${company.id}`);
    if (!company.accountOpenedAt || company.accountOpenedAt > INTELLIGENCE_AS_OF) {
      personas.set(company.id, 'PROSPECT');
      return prospectRaw(
        company,
        crmByCompany.get(company.id) ?? [],
        touchpointsByCompany.get(company.id) ?? [],
        managerOf(company),
        rand,
      );
    }
    const mainProducts = productsByCompany.get(company.id);
    const persona = choosePersona(company, mainProducts ?? [], rand);
    personas.set(company.id, persona);
    const codes = mainProducts ?? personaProducts(persona, rand);
    const products = buildProducts(company, codes, persona, rand);
    const behavior = behaviorOf(persona, rand);
    const manager = managerOf(company);
    const openedAt = company.accountOpenedAt ?? company.createdAt;
    const digital = buildDigital(
      company.id,
      persona,
      behavior,
      products.map((product) => product.code),
      openedAt,
      rand,
    );
    const relationship = buildInteractions(company.id, persona, behavior, manager, openedAt, rand);
    const onboardingDone =
      persona === 'EARLY_JOURNEY'
        ? company.onboardingCompletedAt !== null && rand() < 0.25
        : company.onboardingCompletedAt !== null || rand() < 0.95;
    return {
      identity: {
        customerId: company.id,
        tradeName: company.tradeName,
        legalName: company.legalName,
        cnpjMasked: company.cnpjMasked,
        industry: company.industry,
        segment: company.segment,
        companySize: company.companySize,
        state: company.state,
        city: company.city,
        region: company.region,
        status:
          company.status === 'INACTIVE'
            ? 'INACTIVE'
            : company.status === 'ONBOARDING' || company.status === 'ACCOUNT_OPENING'
              ? 'ONBOARDING'
              : 'ACTIVE',
        relationshipStartDate: company.leadCreatedAt,
        accountOpenedAt: company.accountOpenedAt,
        onboardingCompletedAt: onboardingDone
          ? (company.onboardingCompletedAt ?? iso(addDays(openedAt, 3)))
          : null,
        relationshipManager: manager,
        acquisitionChannel: company.acquisitionChannel,
        acquisitionCampaign: company.acquisitionCampaignId,
      },
      consent: {
        commercialContact: company.lgpdConsent && rand() > 0.04,
        digitalCommunication: company.lgpdConsent,
      },
      products,
      transactions: buildTransactions(company, persona, behavior, products, rand),
      sessions: digital.sessions,
      events: digital.events,
      interactions: relationship.interactions,
      serviceCases: relationship.serviceCases,
      outcomes: buildOutcomes(company.id, persona, rand),
      milestones: buildMilestones(company, {
        mediaTouchpoints: touchpointsByCompany.get(company.id) ?? [],
      }),
      sourceCoverage: rand() < 0.025 ? between(rand, 0.25, 0.38) : between(rand, 0.86, 1),
    };
  });
  return { raws, personas };
}
