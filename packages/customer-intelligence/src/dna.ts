import {
  DEFAULT_DNA_CONFIG,
  DNA_LEVEL_THRESHOLDS,
  DNA_TREND_THRESHOLD,
  DNA_VERSION,
  type DnaComponentConfig,
  type DnaScoringConfig,
  type Normalizer,
} from './config';
import {
  DNA_DIMENSIONS,
  type CustomerDNA,
  type CustomerFeatureSet,
  type DnaDimension,
  type DnaDimensionId,
  type DnaDriver,
  type DnaLevel,
  type DnaTrend,
} from './types';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function normalize(value: number | boolean, normalizer: Normalizer) {
  if (normalizer.kind === 'boolean') return value ? 1 : 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  switch (normalizer.kind) {
    case 'linear':
      return clamp01((numeric - normalizer.min) / (normalizer.max - normalizer.min));
    case 'inverse':
      return 1 - clamp01((numeric - normalizer.min) / (normalizer.max - normalizer.min));
    case 'log10':
      return numeric <= 0
        ? 0
        : clamp01((Math.log10(numeric) - normalizer.min) / (normalizer.max - normalizer.min));
  }
}

export function featureValue(features: CustomerFeatureSet, feature: string): number | boolean {
  const value = (features as unknown as Record<string, unknown>)[feature];
  return typeof value === 'number' || typeof value === 'boolean' ? value : 0;
}

export function levelOf(score: number): DnaLevel {
  return DNA_LEVEL_THRESHOLDS.find(([, threshold]) => score >= threshold)?.[0] ?? 'LOW';
}

function trendOf(current: number, previous: number | undefined): DnaTrend {
  if (previous === undefined) return 'STABLE';
  if (current - previous >= DNA_TREND_THRESHOLD) return 'UP';
  if (previous - current >= DNA_TREND_THRESHOLD) return 'DOWN';
  return 'STABLE';
}

/** Weighted score (0–100) of one dimension plus the drivers that explain it. */
export function scoreDimension(features: CustomerFeatureSet, components: DnaComponentConfig[]) {
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0) || 1;
  const drivers: DnaDriver[] = components.map((component) => {
    const value = featureValue(features, component.feature);
    const normalized = normalize(value, component.normalize);
    const contribution = (component.weight / totalWeight) * normalized * 100;
    return {
      id: component.feature,
      name: component.label,
      value: typeof value === 'number' ? Math.round(value * 1000) / 1000 : value,
      contribution: Math.round(contribution * 10) / 10,
      direction: normalized >= 0.6 ? 'POSITIVE' : normalized <= 0.3 ? 'NEGATIVE' : 'NEUTRAL',
      source: component.source,
      period: component.period,
    };
  });
  const score = Math.round(drivers.reduce((sum, driver) => sum + (driver.contribution ?? 0), 0));
  return {
    score,
    drivers: drivers.sort((left, right) => (right.contribution ?? 0) - (left.contribution ?? 0)),
  };
}

const DIMENSION_LABELS: Record<DnaDimensionId, string> = {
  relationshipStrength: 'relacionamento',
  digitalEngagement: 'engajamento digital',
  productDepth: 'profundidade de produtos',
  transactionActivity: 'atividade transacional',
  businessMomentum: 'momentum do negócio',
  commercialIntent: 'intenção comercial',
};

const LEVEL_WORDS: Record<DnaLevel, string> = {
  LOW: 'baixo',
  MEDIUM: 'médio',
  HIGH: 'alto',
  VERY_HIGH: 'muito alto',
};

function summarize(dimensions: Record<DnaDimensionId, DnaDimension>) {
  const ranked = [...DNA_DIMENSIONS].sort(
    (left, right) => dimensions[right].score - dimensions[left].score,
  );
  const strongest = ranked.slice(0, 2);
  const weakest = ranked.at(-1)!;
  const rising = DNA_DIMENSIONS.filter((id) => dimensions[id].trend === 'UP');
  return [
    `Destaques: ${strongest.map((id) => `${DIMENSION_LABELS[id]} ${LEVEL_WORDS[dimensions[id].level]} (${dimensions[id].score})`).join(' e ')}.`,
    `Menor dimensão: ${DIMENSION_LABELS[weakest]} (${dimensions[weakest].score}).`,
    rising.length ? `Em alta: ${rising.map((id) => DIMENSION_LABELS[id]).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Customer DNA: six behavioral dimensions scored from features with configurable weights.
 * `previous` (features 30 days ago) drives the trend of each dimension.
 */
export function computeDna(
  features: CustomerFeatureSet,
  previous?: CustomerFeatureSet,
  config: DnaScoringConfig = DEFAULT_DNA_CONFIG,
): CustomerDNA {
  const dimensions = Object.fromEntries(
    DNA_DIMENSIONS.map((id) => {
      const current = scoreDimension(features, config[id]);
      const before = previous ? scoreDimension(previous, config[id]).score : undefined;
      const dimension: DnaDimension = {
        score: current.score,
        level: levelOf(current.score),
        trend: trendOf(current.score, before),
        drivers: current.drivers,
      };
      return [id, dimension];
    }),
  ) as Record<DnaDimensionId, DnaDimension>;

  return {
    customerId: features.customer_id,
    calculatedAt: features.as_of,
    version: DNA_VERSION,
    ...dimensions,
    overallSummary: summarize(dimensions),
  };
}
