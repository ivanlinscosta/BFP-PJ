import { ACTION_BY_ID, ACTION_CATALOG, ACTION_SCORING, ACTION_TOPIC } from './actions';
import { DEFAULT_NBA_CONFIG, NBA_MODEL_VERSION, type NbaScoringConfig } from './config';
import { checkEligibility } from './eligibility';
import { daysBetween } from './features';
import type {
  ActionDefinition,
  CustomerDNA,
  CustomerFeatureSet,
  CustomerRawData,
  CustomerSignal,
  EligibilityResult,
  NbaComponents,
  NextBestActionRecommendation,
} from './types';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

const SIZE_FACTOR: Record<string, number> = {
  MEI: 0.7,
  Micro: 0.8,
  Pequena: 0.9,
  Média: 1,
  Grande: 1,
};

const OBJECTIVE_LABELS: Record<ActionDefinition['objective'], string> = {
  EXPANSION: 'Expansão de relacionamento',
  ACTIVATION: 'Ativação da conta',
  RETENTION: 'Retenção e engajamento',
  SERVICE_RECOVERY: 'Recuperação do atendimento',
  EDUCATION: 'Educação e uso de produtos',
  RESTRAINT: 'Preservar o relacionamento',
};

export interface NbaInput {
  features: CustomerFeatureSet;
  dna: CustomerDNA;
  signals: CustomerSignal[];
  raw: CustomerRawData;
  config?: NbaScoringConfig;
}

/** Action considered by the engine (eligible or not) with its score breakdown. */
export interface ScoredCandidate {
  action: ActionDefinition;
  eligibility: EligibilityResult;
  score: number;
  components: NbaComponents;
  penalties: { fatigue: number; risk: number };
  relevantSignals: CustomerSignal[];
}

/** Candidate generation: actions that make sense to evaluate for this customer. */
export function generateCandidates(input: NbaInput): ActionDefinition[] {
  const { features: f } = input;
  return ACTION_CATALOG.filter((action) => {
    if (!action.active) return false;
    switch (action.id) {
      case 'RESOLVE_SERVICE_ISSUE':
        return f.complaints_30d > 0 || input.raw.serviceCases.some((item) => !item.resolved);
      case 'EDUCATE_PRODUCT_FEATURE':
        return f.products_count >= 2;
      case 'CONTACT_RELATIONSHIP_MANAGER':
        return f.has_relationship_manager;
      default:
        return true;
    }
  });
}

/** Noisy-OR of the strengths of the action's signals present for the customer. */
function intentOf(signals: CustomerSignal[]) {
  return clamp01(1 - signals.reduce((product, signal) => product * (1 - signal.strength), 1));
}

function relevanceOf(action: ActionDefinition, input: NbaInput, signals: CustomerSignal[]) {
  const scoring = ACTION_SCORING[action.id];
  if (!scoring) return 0;
  let relevance = scoring.affinity.reduce((sum, item) => {
    const score = input.dna[item.dimension].score / 100;
    return sum + item.weight * (item.invert ? 1 - score : score);
  }, 0);
  const f = input.features;
  switch (action.id) {
    case 'COMPLETE_ACCOUNT_OPENING':
      // Relevant while the journey is fresh (the pending-opening signal carries the recency).
      relevance = input.raw.identity.accountOpenedAt
        ? 0
        : Math.max(0.2, ...signals.map((signal) => signal.strength));
      break;
    case 'COMPLETE_ONBOARDING':
      relevance = f.onboarding_completed ? 0 : 0.95;
      break;
    case 'RESOLVE_SERVICE_ISSUE':
      relevance = Math.max(relevance, f.critical_complaints_30d > 0 ? 1 : 0.85);
      break;
    case 'EDUCATE_PRODUCT_FEATURE':
      // Many products, little effective use: teach what the company already has.
      relevance =
        0.5 * (1 - f.active_products_ratio) +
        0.3 * Math.min(1, f.products_count / 8) +
        0.2 * (input.dna.digitalEngagement.score / 100);
      break;
    case 'PROMOTE_POS_MACHINE':
      relevance += Math.min(0.15, (f.product_interest_30d.MAQUININHA ?? 0) * 0.05);
      break;
    case 'PROMOTE_PIX_COLLECTION':
      relevance += Math.min(0.15, (f.product_interest_30d.PIX_COBRANCA ?? 0) * 0.05);
      break;
    default:
      break;
  }
  // A product gap backed by its own gap signal makes the offer more pertinent.
  if (signals.some((signal) => signal.category === 'PRODUCT_GAP')) relevance += 0.08;
  return clamp01(relevance);
}

function timingOf(input: NbaInput, signals: CustomerSignal[]) {
  if (signals.length === 0) return clamp01(0.3 + 0.4 * (input.dna.businessMomentum.score / 100));
  const freshest = Math.min(
    ...signals.map((signal) => daysBetween(signal.detectedAt, input.features.as_of)),
  );
  return clamp01(0.5 + 0.5 * Math.pow(0.5, freshest / 14));
}

function confidenceOf(input: NbaInput, signals: CustomerSignal[], config: NbaScoringConfig) {
  const evidence = Math.min(1, signals.length / 3);
  let confidence = 0.6 * evidence + 0.4 * input.features.data_quality;
  if (input.features.data_quality < config.minDataQuality) confidence *= 0.7;
  return clamp01(confidence);
}

function penaltiesOf(action: ActionDefinition, f: CustomerFeatureSet, config: NbaScoringConfig) {
  if (!action.commercial) return { fatigue: 0, risk: 0 };
  const fatigue = Math.min(
    config.penalties.fatigueCap,
    f.commercial_contacts_30d * config.penalties.fatiguePerContact,
  );
  const risk =
    (f.complaints_30d > 0 ? config.penalties.complaintRisk : 0) +
    (f.unresolved_interactions_30d > 0
      ? config.penalties.unresolvedServiceRisk * Math.min(1, f.unresolved_interactions_30d / 2)
      : 0);
  return { fatigue: round(fatigue), risk: round(risk) };
}

/** Scores every candidate (eligible or not) with the configured weights. */
export function scoreCandidates(input: NbaInput): ScoredCandidate[] {
  const config = input.config ?? DEFAULT_NBA_CONFIG;
  const f = input.features;
  const scored = generateCandidates(input)
    .filter((action) => action.id !== 'NO_ACTION')
    .map((action): ScoredCandidate => {
      const eligibility = checkEligibility(action, f, input.raw);
      const topic = ACTION_TOPIC[action.id];
      const relevantSignals = input.signals.filter(
        (signal) =>
          action.relevantSignals.includes(signal.type) &&
          (signal.type !== 'RECENT_PRODUCT_INTEREST' || signal.value === topic),
      );
      const scoring = ACTION_SCORING[action.id];
      const components: NbaComponents = {
        relevance: round(relevanceOf(action, input, relevantSignals)),
        intent: round(intentOf(relevantSignals)),
        expectedImpact: round(
          clamp01((scoring?.impact ?? 0) * (SIZE_FACTOR[input.raw.identity.companySize] ?? 1)),
        ),
        timing: round(timingOf(input, relevantSignals)),
        confidence: round(confidenceOf(input, relevantSignals, config)),
      };
      const penalties = penaltiesOf(action, f, config);
      const weighted =
        config.weights.relevance * components.relevance +
        config.weights.intent * components.intent +
        config.weights.expectedImpact * components.expectedImpact +
        config.weights.timing * components.timing +
        config.weights.confidence * components.confidence;
      const score = Math.round(
        Math.max(0, Math.min(1, weighted - penalties.fatigue - penalties.risk)) * 100,
      );
      return { action, eligibility, score, components, penalties, relevantSignals };
    });

  // NO_ACTION competes on the cost of contact: weak opportunities, risk and poor data.
  const bestEligible = Math.max(
    0,
    ...scored.filter((item) => item.eligibility.eligible).map((item) => item.score),
  );
  const strongestSignal = Math.max(
    0,
    ...input.signals.filter((signal) => signal.kind !== 'RISK').map((signal) => signal.strength),
  );
  const criticalRisk = f.critical_complaints_30d > 0 ? 1 : 0;
  const noActionScore = Math.round(
    Math.min(
      100,
      30 +
        20 * (1 - strongestSignal) +
        15 * criticalRisk +
        25 * (1 - f.data_quality) +
        (bestEligible < config.actionThreshold ? config.actionThreshold - bestEligible + 10 : 0),
    ),
  );
  const noAction = ACTION_BY_ID.get('NO_ACTION')!;
  scored.push({
    action: noAction,
    eligibility: { eligible: true, checks: [] },
    score: noActionScore,
    components: {
      relevance: round(1 - strongestSignal),
      intent: 0,
      expectedImpact: 0,
      timing: 0.5,
      confidence: round(clamp01(0.5 + 0.5 * (1 - strongestSignal))),
    },
    penalties: { fatigue: 0, risk: 0 },
    relevantSignals: input.signals.filter((signal) => signal.kind === 'RISK'),
  });

  // Insufficient data: only NO_ACTION is eligible (the engine does not invent certainty).
  if (f.data_quality < config.criticalDataQuality) {
    for (const item of scored) {
      if (item.action.id !== 'NO_ACTION') {
        item.eligibility = {
          eligible: false,
          checks: [
            ...item.eligibility.checks,
            {
              rule: 'actionEnabled',
              passed: false,
              reason: 'INSUFFICIENT_DATA: dados insuficientes para recomendar.',
            },
          ],
        };
      }
    }
  }

  return scored.sort(
    (left, right) => right.score - left.score || left.action.id.localeCompare(right.action.id),
  );
}

function channelFor(action: ActionDefinition, f: CustomerFeatureSet) {
  const channels = action.supportedChannels;
  if (channels.includes('RELATIONSHIP_MANAGER') && f.has_relationship_manager) {
    return channels.includes('WHATSAPP') ? 'RELATIONSHIP_MANAGER+WHATSAPP' : 'RELATIONSHIP_MANAGER';
  }
  return channels.find((channel) => channel !== 'RELATIONSHIP_MANAGER') ?? 'NONE';
}

function windowFor(candidate: ScoredCandidate): NextBestActionRecommendation['recommendedWindow'] {
  if (candidate.action.objective === 'SERVICE_RECOVERY') return { type: 'NOW' };
  if (candidate.action.id === 'NO_ACTION') return { type: 'NEXT_WEEK', days: 30 };
  if (candidate.components.timing >= 0.75) return { type: 'NEXT_DAYS', days: 3 };
  return { type: 'NEXT_WEEK', days: 7 };
}

/** Structured reason codes (the deterministic explanation, before any LLM). */
export function reasonCodesFor(candidate: ScoredCandidate, input: NbaInput) {
  const codes = candidate.relevantSignals.map((signal) => signal.type);
  const scoring = ACTION_SCORING[candidate.action.id];
  if (scoring?.product && !input.features.owned_products.includes(scoring.product))
    codes.push('PRODUCT_GAP');
  if (
    input.dna.relationshipStrength.level === 'HIGH' ||
    input.dna.relationshipStrength.level === 'VERY_HIGH'
  ) {
    codes.push('RELATIONSHIP_ACTIVE');
  }
  if (candidate.penalties.risk > 0) codes.push('SERVICE_RISK_PENALTY');
  if (candidate.penalties.fatigue > 0) codes.push('CONTACT_FATIGUE_PENALTY');
  if (input.features.data_quality < (input.config ?? DEFAULT_NBA_CONFIG).criticalDataQuality)
    codes.push('INSUFFICIENT_DATA');
  return [...new Set(codes)];
}

/**
 * Next Best Action engine: candidates → eligibility → scoring → ranking. Returns the top N
 * eligible recommendations (NO_ACTION included when it ranks) plus every considered candidate.
 */
export function rankNextBestActions(input: NbaInput) {
  const config = input.config ?? DEFAULT_NBA_CONFIG;
  const candidates = scoreCandidates(input);
  const eligible = candidates.filter((candidate) => candidate.eligibility.eligible);
  const top = eligible.slice(0, config.topN);
  // NO_ACTION is always shown in the ranking as the explicit alternative.
  if (!top.some((candidate) => candidate.action.id === 'NO_ACTION')) {
    const noAction = eligible.find((candidate) => candidate.action.id === 'NO_ACTION');
    if (noAction) top.push(noAction);
  }
  const recommendations: NextBestActionRecommendation[] = top.map((candidate, index) => ({
    id: `${input.features.customer_id}:${candidate.action.id}:${input.features.as_of.slice(0, 10)}`,
    customerId: input.features.customer_id,
    actionId: candidate.action.id,
    actionName: candidate.action.name,
    rank: index + 1,
    score: candidate.score,
    objective: OBJECTIVE_LABELS[candidate.action.objective],
    confidence: Math.round(
      (candidate.action.id === 'NO_ACTION'
        ? candidate.components.confidence
        : 0.5 * candidate.components.confidence + 0.5 * (candidate.score / 100)) * 100,
    ),
    recommendedChannel: channelFor(candidate.action, input.features),
    recommendedWindow: windowFor(candidate),
    components: candidate.components,
    penalties: candidate.penalties,
    evidence: candidate.relevantSignals.map((signal) => ({
      signalType: signal.type,
      title: signal.title,
      value: signal.value,
      strength: signal.strength,
      source: signal.source,
      detectedAt: signal.detectedAt,
    })),
    reasonCodes: reasonCodesFor(candidate, input),
    eligibility: candidate.eligibility,
    calculatedAt: input.features.as_of,
    modelVersion: NBA_MODEL_VERSION,
  }));
  return { recommendations, candidates };
}
