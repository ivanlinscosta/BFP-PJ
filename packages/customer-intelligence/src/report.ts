import {
  DNA_DIMENSIONS,
  type CustomerIntelligenceProfile,
  type CustomerRawData,
  type DnaDimensionId,
  type DnaLevel,
} from './types';

/** Synthetic data / rebuild report: volumes, DNA and NBA distributions, concentration check. */
export interface IntelligenceReport {
  asOf: string;
  customers: number;
  volumes: {
    transactionWeeks: number;
    sessions: number;
    digitalEvents: number;
    interactions: number;
    serviceCases: number;
    products: number;
    signals: number;
    recommendations: number;
  };
  dnaDistribution: Record<DnaDimensionId, { mean: number; levels: Record<DnaLevel, number> }>;
  nbaDistribution: Array<{
    actionId: string;
    actionName: string;
    customers: number;
    share: number;
  }>;
  signalDistribution: Array<{ type: string; customers: number; share: number }>;
  noActionRate: number;
  /** Largest share of a single #1 action; flagged when above the limit. */
  maxActionShare: number;
  concentrationOk: boolean;
  durationsMs: { features_dna_signals_nba: number };
}

export function buildIntelligenceReport(
  raws: CustomerRawData[],
  profiles: CustomerIntelligenceProfile[],
  asOf: string,
  durationMs: number,
  maxShare = 0.35,
): IntelligenceReport {
  const customers = profiles.length;
  const share = (value: number) => (customers ? Math.round((value / customers) * 1000) / 1000 : 0);
  const dnaDistribution = Object.fromEntries(
    DNA_DIMENSIONS.map((id) => {
      const levels: Record<DnaLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, VERY_HIGH: 0 };
      let sum = 0;
      for (const profile of profiles) {
        levels[profile.dna[id].level] += 1;
        sum += profile.dna[id].score;
      }
      return [id, { mean: customers ? Math.round(sum / customers) : 0, levels }];
    }),
  ) as IntelligenceReport['dnaDistribution'];

  const actions = new Map<string, { name: string; customers: number }>();
  const signals = new Map<string, number>();
  for (const profile of profiles) {
    const top = profile.recommendations[0];
    if (top) {
      const current = actions.get(top.actionId) ?? { name: top.actionName, customers: 0 };
      current.customers += 1;
      actions.set(top.actionId, current);
    }
    for (const type of new Set(profile.signals.map((signal) => signal.type))) {
      signals.set(type, (signals.get(type) ?? 0) + 1);
    }
  }
  const nbaDistribution = [...actions.entries()]
    .map(([actionId, value]) => ({
      actionId,
      actionName: value.name,
      customers: value.customers,
      share: share(value.customers),
    }))
    .sort((left, right) => right.customers - left.customers);
  const maxActionShare = nbaDistribution[0]?.share ?? 0;

  return {
    asOf,
    customers,
    volumes: {
      transactionWeeks: raws.reduce((sum, raw) => sum + raw.transactions.length, 0),
      sessions: raws.reduce((sum, raw) => sum + raw.sessions.length, 0),
      digitalEvents: raws.reduce((sum, raw) => sum + raw.events.length, 0),
      interactions: raws.reduce((sum, raw) => sum + raw.interactions.length, 0),
      serviceCases: raws.reduce((sum, raw) => sum + raw.serviceCases.length, 0),
      products: raws.reduce((sum, raw) => sum + raw.products.length, 0),
      signals: profiles.reduce((sum, profile) => sum + profile.signals.length, 0),
      recommendations: profiles.reduce((sum, profile) => sum + profile.recommendations.length, 0),
    },
    dnaDistribution,
    nbaDistribution,
    signalDistribution: [...signals.entries()]
      .map(([type, count]) => ({ type, customers: count, share: share(count) }))
      .sort((left, right) => right.customers - left.customers),
    noActionRate: share(actions.get('NO_ACTION')?.customers ?? 0),
    maxActionShare,
    concentrationOk: maxActionShare <= maxShare,
    durationsMs: { features_dna_signals_nba: Math.round(durationMs) },
  };
}
