import { DNA_DIMENSIONS, type CustomerIntelligenceProfile, type DnaDimensionId } from './types';

const SIZE_ORDER = ['MEI', 'Micro', 'Pequena', 'Média', 'Grande'];

/** Maximum normalized distance for two customers to count as similar. */
export const SIMILARITY_THRESHOLD = 0.2;

/** Compact vector used for similarity (business attributes + DNA dimensions). */
export interface SimilarityVector {
  customerId: string;
  size: number;
  segment: string;
  region: string;
  dna: number[];
}

/** Vector from compact attributes (read-model summaries or full profiles). */
export function similarityVectorFrom(input: {
  customerId: string;
  companySize: string;
  segment: string;
  region: string;
  dna: Record<DnaDimensionId, number>;
}): SimilarityVector {
  return {
    customerId: input.customerId,
    size: Math.max(0, SIZE_ORDER.indexOf(input.companySize)) / (SIZE_ORDER.length - 1),
    segment: input.segment,
    region: input.region,
    dna: DNA_DIMENSIONS.map((id) => input.dna[id] / 100),
  };
}

export function similarityVector(
  profile: Pick<CustomerIntelligenceProfile, 'customerId' | 'identity' | 'dna'>,
): SimilarityVector {
  return similarityVectorFrom({
    customerId: profile.customerId,
    companySize: profile.identity.companySize,
    segment: profile.identity.segment,
    region: profile.identity.region,
    dna: Object.fromEntries(DNA_DIMENSIONS.map((id) => [id, profile.dna[id].score])) as Record<
      DnaDimensionId,
      number
    >,
  });
}

/**
 * Normalized distance (0–1): DNA dimensions weigh 70%, size 15%, segment 10%, region 5%.
 * Product depth and transaction activity count double within the DNA part.
 */
export function distance(left: SimilarityVector, right: SimilarityVector) {
  const dnaWeights = [1, 1, 2, 2, 1, 1];
  const totalWeight = dnaWeights.reduce((sum, weight) => sum + weight, 0);
  const dna = Math.sqrt(
    left.dna.reduce(
      (sum, value, index) => sum + dnaWeights[index]! * (value - right.dna[index]!) ** 2,
      0,
    ) / totalWeight,
  );
  return (
    0.7 * dna +
    0.15 * Math.abs(left.size - right.size) +
    0.1 * (left.segment === right.segment ? 0 : 1) +
    0.05 * (left.region === right.region ? 0 : 1)
  );
}

/** Customers closer than the threshold, nearest first (no vector database needed in the MVP). */
export function findSimilar(
  target: SimilarityVector,
  population: SimilarityVector[],
  threshold = SIMILARITY_THRESHOLD,
  limit = 50,
) {
  // Plain loop: the batch rebuild compares every customer with every other one.
  const matches: Array<{ customerId: string; distance: number }> = [];
  for (const candidate of population) {
    if (candidate.customerId === target.customerId) continue;
    const value = distance(target, candidate);
    if (value <= threshold)
      matches.push({ customerId: candidate.customerId, distance: Math.round(value * 1000) / 1000 });
  }
  matches.sort((left, right) => left.distance - right.distance);
  return { count: matches.length, nearest: matches.slice(0, limit) };
}
