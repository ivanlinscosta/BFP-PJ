import type {
  ContentTopic,
  CustomerRawData,
  DigitalEvent,
  DigitalEventKind,
  TransactionAggregate,
} from '../types';

export const AS_OF = '2026-10-09T12:00:00.000Z';
const DAY_MS = 86_400_000;

export function daysAgo(days: number, hour = 10) {
  const date = new Date(new Date(AS_OF).getTime() - days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

/** Monday-aligned weekly aggregates; `growth` multiplies the last 8 weeks. */
export function weeks(
  customerId: string,
  count: number,
  base: number,
  options: { growth?: number; cardSpend?: number; pixInCount?: number } = {},
): TransactionAggregate[] {
  return Array.from({ length: count }, (_, index) => {
    const ago = (count - index) * 7;
    const factor = index >= count - 8 ? (options.growth ?? 1) : 1;
    const volume = base * factor;
    return {
      customerId,
      date: daysAgo(ago).slice(0, 10),
      inflowAmount: volume * 0.55,
      outflowAmount: volume * 0.45,
      pixInCount: options.pixInCount ?? 6,
      pixOutCount: 4,
      pixVolume: volume * 0.3,
      boletoCount: 2,
      boletoVolume: volume * 0.1,
      cardSpend: options.cardSpend ?? 0,
      paymentsCount: 5,
      paymentsVolume: volume * 0.2,
      balanceBand: 'MEDIUM',
    };
  });
}

export function event(
  customerId: string,
  ago: number,
  kind: DigitalEventKind,
  topic?: ContentTopic,
): DigitalEvent {
  return { customerId, timestamp: daysAgo(ago), kind, channel: 'APP', topic };
}

/**
 * Established, healthy customer with no strong signal: steady transactions, regular digital use,
 * core products contracted. Tests add the behavior they need on top of it.
 */
export function baseRaw(
  customerId = 'company-test',
  overrides: Partial<CustomerRawData> = {},
): CustomerRawData {
  const sessions = Array.from({ length: 26 }, (_, index) => ({
    customerId,
    timestamp: daysAgo(index * 3 + 1),
    channel: 'APP' as const,
    device: 'IOS' as const,
    durationSeconds: 240,
    pages: 5,
    featuresUsed: ['extrato', 'pix'],
    source: 'App Itaú Empresas',
  }));
  return {
    identity: {
      customerId,
      tradeName: 'Empresa Teste Ltda.',
      legalName: 'Empresa Teste Comércio Ltda.',
      cnpjMasked: '10.000.000/0001-**',
      industry: 'Varejo',
      segment: 'Comércio',
      companySize: 'Pequena',
      state: 'SP',
      city: 'São Paulo',
      region: 'Sudeste',
      status: 'ACTIVE',
      relationshipStartDate: daysAgo(500),
      accountOpenedAt: daysAgo(480),
      onboardingCompletedAt: daysAgo(475),
      relationshipManager: 'Gerente Teste',
      acquisitionChannel: 'GOOGLE_SEARCH',
      acquisitionCampaign: null,
    },
    consent: { commercialContact: true, digitalCommunication: true },
    products: [
      {
        code: 'CONTA_PJ',
        contractedAt: daysAgo(480),
        status: 'ACTIVE',
        usageFrequency: 'DAILY',
        usageVolumeBand: 'MEDIUM',
      },
      {
        code: 'PIX',
        contractedAt: daysAgo(479),
        status: 'IN_USE',
        usageFrequency: 'DAILY',
        usageVolumeBand: 'MEDIUM',
      },
    ],
    transactions: weeks(customerId, 60, 40_000),
    sessions,
    events: sessions.map((session) => ({
      customerId,
      timestamp: session.timestamp,
      kind: 'LOGIN' as const,
      channel: 'APP' as const,
    })),
    interactions: [],
    serviceCases: [],
    outcomes: [],
    milestones: [],
    sourceCoverage: 1,
    ...overrides,
  };
}

/** Atlas-like credit intent: credit content, searches and a simulation plus growing volume. */
export function creditIntentRaw(customerId = 'company-credit') {
  const raw = baseRaw(customerId);
  return {
    ...raw,
    transactions: weeks(customerId, 60, 40_000, { growth: 1.3 }),
    events: [
      ...raw.events,
      event(customerId, 2, 'PAGE_VIEW', 'CAPITAL_DE_GIRO'),
      event(customerId, 4, 'PAGE_VIEW', 'CAPITAL_DE_GIRO'),
      event(customerId, 6, 'PRODUCT_VIEW', 'CAPITAL_DE_GIRO'),
      event(customerId, 3, 'SEARCH', 'CAPITAL_DE_GIRO'),
      event(customerId, 5, 'SEARCH', 'CAPITAL_DE_GIRO'),
      event(customerId, 2, 'SIMULATION_STARTED', 'CAPITAL_DE_GIRO'),
      event(customerId, 2, 'SIMULATION_COMPLETED', 'CAPITAL_DE_GIRO'),
    ],
  } satisfies CustomerRawData;
}
