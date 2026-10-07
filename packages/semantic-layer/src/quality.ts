import type { QualityHealthState } from '@bfp/domain';

/** Summary statistics injected into semantic quality scoring. */
export interface DatasetQualitySummary {
  freshnessMinutes: number;
  completenessRatio: number;
  validityRatio: number;
  uniquenessRatio?: number;
  incidentCount?: number;
}

/** Thresholds used to score semantic quality without touching the dataset directly. */
export interface QualityThresholds {
  freshnessSLOMinutes: number;
  completenessThreshold: number;
  validityThreshold: number;
  uniquenessThreshold: number;
}

/** Detailed semantic quality assessment. */
export interface QualityAssessment {
  score: number;
  status: QualityHealthState;
  components: {
    freshness: number;
    completeness: number;
    validity: number;
    uniqueness: number;
    incidents: number;
  };
  reasons: string[];
}

/** Default thresholds shared across the starter data products and semantic metrics. */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  freshnessSLOMinutes: 1440,
  completenessThreshold: 0.98,
  validityThreshold: 0.97,
  uniquenessThreshold: 0.99,
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function scoreFreshness(freshnessMinutes: number, freshnessSLOMinutes: number) {
  if (freshnessMinutes <= freshnessSLOMinutes) {
    return 100;
  }

  if (freshnessMinutes >= freshnessSLOMinutes * 3) {
    return 0;
  }

  const decayWindow = freshnessSLOMinutes * 2;
  const excessMinutes = freshnessMinutes - freshnessSLOMinutes;
  return clampScore(100 - (excessMinutes / decayWindow) * 100);
}

function scoreRatio(actual: number, threshold: number) {
  if (actual >= threshold) {
    return 100;
  }

  if (actual <= 0) {
    return 0;
  }

  return clampScore((actual / threshold) * 100);
}

function scoreIncidents(incidentCount: number) {
  return clampScore(100 - incidentCount * 20);
}

/** Computes quality score and status from injected dataset summary statistics. */
export function assessQuality(
  summary: DatasetQualitySummary,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): QualityAssessment {
  const components = {
    freshness: scoreFreshness(summary.freshnessMinutes, thresholds.freshnessSLOMinutes),
    completeness: scoreRatio(summary.completenessRatio, thresholds.completenessThreshold),
    validity: scoreRatio(summary.validityRatio, thresholds.validityThreshold),
    uniqueness: scoreRatio(summary.uniquenessRatio ?? 1, thresholds.uniquenessThreshold),
    incidents: scoreIncidents(summary.incidentCount ?? 0),
  };

  const score = clampScore(
    components.freshness * 0.3 +
      components.completeness * 0.25 +
      components.validity * 0.25 +
      components.uniqueness * 0.1 +
      components.incidents * 0.1,
  );

  const reasons: string[] = [];
  if (components.freshness < 100) {
    reasons.push('Atualização fora do SLO de freshness.');
  }
  if (components.completeness < 100) {
    reasons.push('Completude abaixo do limiar governado.');
  }
  if (components.validity < 100) {
    reasons.push('Validade abaixo do limiar governado.');
  }
  if (components.uniqueness < 100) {
    reasons.push('Unicidade abaixo do limiar governado.');
  }
  if ((summary.incidentCount ?? 0) > 0) {
    reasons.push('Existem incidentes de qualidade em aberto para o escopo avaliado.');
  }

  let status: QualityHealthState = 'HEALTHY';
  if (score < 70 || components.freshness === 0 || components.validity < 70) {
    status = 'CRITICAL';
  } else if (score < 90 || reasons.length > 0) {
    status = 'WARNING';
  }

  return {
    score,
    status,
    components,
    reasons,
  };
}

/** Lightweight helper for code paths that only need the health status. */
export function getQualityStatus(
  summary: DatasetQualitySummary,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): QualityHealthState {
  return assessQuality(summary, thresholds).status;
}
