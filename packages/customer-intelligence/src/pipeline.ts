import {
  DEFAULT_DNA_CONFIG,
  DEFAULT_NBA_CONFIG,
  DNA_VERSION,
  NBA_MODEL_VERSION,
  type DnaScoringConfig,
  type NbaScoringConfig,
} from './config';
import { detectChanges } from './changes';
import { computeDna } from './dna';
import { computeFeatures, daysBetween } from './features';
import { rankNextBestActions } from './nba';
import { detectSignals } from './signals';
import { findSimilar, SIMILARITY_THRESHOLD, similarityVector } from './similarity';
import { buildProfileTabs } from './tabs';
import type {
  CustomerIntelligenceProfile,
  CustomerRawData,
  CustomerSignal,
  NextBestActionRecommendation,
} from './types';

const DAY_MS = 86_400_000;

export interface PipelineOptions {
  dnaConfig?: DnaScoringConfig;
  nbaConfig?: NbaScoringConfig;
}

function impactOf(signal: CustomerSignal, recommendations: NextBestActionRecommendation[]) {
  const supported = recommendations.find((item) =>
    item.evidence.some((evidence) => evidence.signalType === signal.type),
  );
  if (supported) return `Sustenta a ação #${supported.rank} (${supported.actionName}).`;
  if (signal.kind === 'RISK') return 'Reduz a prioridade de ofertas comerciais.';
  return 'Contexto para a conversa; não altera o ranking.';
}

/** Runs the whole chain for one customer at `asOf` (and 30 days earlier, for trends/shift). */
export function buildCustomerProfile(
  raw: CustomerRawData,
  asOf: string,
  options: PipelineOptions = {},
): CustomerIntelligenceProfile {
  const dnaConfig = options.dnaConfig ?? DEFAULT_DNA_CONFIG;
  const nbaConfig = options.nbaConfig ?? DEFAULT_NBA_CONFIG;
  const previousAsOf = new Date(new Date(asOf).getTime() - 30 * DAY_MS).toISOString();

  const features = computeFeatures(raw, asOf);
  const previousFeatures = computeFeatures(raw, previousAsOf);
  const dna = computeDna(features, previousFeatures, dnaConfig);
  const previousDna = computeDna(previousFeatures, undefined, dnaConfig);
  const signals = detectSignals({ features, raw, dna, asOf });
  const previousSignals = detectSignals({
    features: previousFeatures,
    raw,
    dna: previousDna,
    asOf: previousAsOf,
  });
  const { recommendations } = rankNextBestActions({
    features,
    dna,
    signals,
    raw,
    config: nbaConfig,
  });
  const previous = rankNextBestActions({
    features: previousFeatures,
    dna: previousDna,
    signals: previousSignals,
    raw,
    config: { ...nbaConfig, topN: 13 },
  }).recommendations;
  const top = recommendations[0]!;

  for (const signal of signals) signal.nbaImpact = impactOf(signal, recommendations);

  return {
    customerId: raw.identity.customerId,
    identity: raw.identity,
    tenureMonths: Math.floor(daysBetween(raw.identity.relationshipStartDate, asOf) / 30.4),
    dna,
    changes: detectChanges(raw, features),
    signals,
    recommendations,
    readingShift: {
      intentLevel: {
        previous: previousDna.commercialIntent.level,
        current: dna.commercialIntent.level,
      },
      topAction: {
        actionId: top.actionId,
        actionName: top.actionName,
        previousRank: previous.find((item) => item.actionId === top.actionId)?.rank ?? null,
        currentRank: top.rank,
      },
    },
    tabs: buildProfileTabs(raw, features),
    similar: { count: 0, customerIds: [] },
    dataQuality: { score: features.data_quality, freshness: asOf },
    updatedAt: asOf,
    dnaVersion: DNA_VERSION,
    modelVersion: NBA_MODEL_VERSION,
  };
}

/** Builds every profile and links similar customers (normalized distance, nearest first). */
export function buildCustomerProfiles(
  raws: CustomerRawData[],
  asOf: string,
  options: PipelineOptions = {},
) {
  const profiles = raws.map((raw) => buildCustomerProfile(raw, asOf, options));
  const vectors = profiles.map(similarityVector);
  for (const [index, profile] of profiles.entries()) {
    const similar = findSimilar(vectors[index]!, vectors, SIMILARITY_THRESHOLD, 20);
    profile.similar = {
      count: similar.count,
      customerIds: similar.nearest.map((item) => item.customerId),
    };
  }
  return profiles;
}
