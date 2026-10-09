import {
  aggregateClusterRows,
  distance,
  DNA_DIMENSIONS,
  similarityVectorFrom,
  SIMILARITY_THRESHOLD,
  type ClusterDNA,
  type CustomerIntelligenceProfile,
  type DnaDimensionId,
  type NextBestActionRecommendation,
  type OutcomeStatus,
  type RecommendationExplanation,
  type RecommendationOutcome,
} from '@bfp/customer-intelligence';
import type { AuthenticatedUser } from '@api/auth/types';
import { NotFoundError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';
import {
  BedrockExplanationProvider,
  DeterministicExplanationProvider,
  type AIExplanationProvider,
} from '@api/services/customerIntelligence/explanation';
import type { CustomerIntelligenceSummary } from '@api/services/customerIntelligence/repository';
import {
  createBedrockClient,
  type BedrockConverseClient,
} from '@api/services/intelligence/bedrockProvider';

export async function getProfileOrThrow(context: ApiContext, customerId: string) {
  const profile = await context.getCustomerIntelligenceRepository().getProfile(customerId);
  if (!profile) {
    throw new NotFoundError(
      'Inteligência ainda não calculada para este cliente. Rode o rebuild de inteligência.',
    );
  }
  return profile;
}

/** Profile + operational feedback: everything the Cliente PJ page needs in one call. */
export async function getCustomerIntelligence(context: ApiContext, customerId: string) {
  const profile = await getProfileOrThrow(context, customerId);
  const outcomes = await context.getRecommendationOutcomeRepository().listByCustomer(customerId);
  return { profile, outcomes };
}

/** Recommendation ids are `<customerId>:<actionId>:<date>`, so the profile is reachable from them. */
export async function findRecommendation(context: ApiContext, recommendationId: string) {
  const customerId = recommendationId.split(':')[0] ?? '';
  const profile = await getProfileOrThrow(context, customerId);
  const recommendation = profile.recommendations.find((item) => item.id === recommendationId);
  if (!recommendation) throw new NotFoundError('Recomendação não encontrada.');
  return { profile, recommendation };
}

export async function recordOutcome(
  context: ApiContext,
  auth: AuthenticatedUser,
  recommendation: NextBestActionRecommendation,
  input: { status: OutcomeStatus; channel?: string; reason?: string; value?: number },
) {
  const outcome: RecommendationOutcome = {
    recommendationId: recommendation.id,
    customerId: recommendation.customerId,
    actionId: recommendation.actionId,
    status: input.status,
    timestamp: context.clock().toISOString(),
    channel: input.channel,
    reason: input.reason,
    value: input.value,
    actor: auth.userId,
  };
  await context.getRecommendationOutcomeRepository().put(outcome);
  const event =
    input.status === 'ACTIVATED'
      ? 'NBA_ACTIVATED'
      : input.status === 'DISMISSED'
        ? 'NBA_DISMISSED'
        : input.status === 'VIEWED'
          ? 'NBA_VIEWED'
          : 'NBA_OUTCOME';
  context.logger.info(event, {
    operation: event,
    userId: auth.userId,
    customerId: outcome.customerId,
    actionId: outcome.actionId,
    status: outcome.status,
    modelVersion: recommendation.modelVersion,
  });
  return outcome;
}

function explanationProvider(
  context: ApiContext,
  client?: BedrockConverseClient,
): AIExplanationProvider {
  return context.config.aiProvider === 'bedrock' && context.config.bedrockModelId
    ? new BedrockExplanationProvider(
        client ?? createBedrockClient(context.config.bedrockRegion),
        context.config.bedrockModelId,
      )
    : new DeterministicExplanationProvider();
}

/**
 * Explains a recommendation in natural language. Claude only writes the text; when it is not
 * available the structured (deterministic) explanation is returned and labeled as such.
 */
export async function explainRecommendation(
  context: ApiContext,
  profile: CustomerIntelligenceProfile,
  recommendation: NextBestActionRecommendation,
  client?: BedrockConverseClient,
): Promise<RecommendationExplanation & { notice?: string }> {
  const provider = explanationProvider(context, client);
  try {
    return await provider.explain(profile, recommendation);
  } catch (error) {
    context.logger.warn('nba_explanation_fallback', {
      recommendationId: recommendation.id,
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return {
      ...(await new DeterministicExplanationProvider().explain(profile, recommendation)),
      notice: 'Explicação estruturada: a IA generativa não respondeu agora.',
    };
  }
}

export interface ClusterFilters {
  segment?: string;
  industry?: string;
  companySize?: string;
  state?: string;
  region?: string;
  topActionId?: string;
  signalType?: string;
  minDna?: Partial<Record<DnaDimensionId, number>>;
}

function matches(summary: CustomerIntelligenceSummary, filters: ClusterFilters) {
  return (
    (!filters.segment || summary.segment === filters.segment) &&
    (!filters.industry || summary.industry === filters.industry) &&
    (!filters.companySize || summary.companySize === filters.companySize) &&
    (!filters.state || summary.state === filters.state) &&
    (!filters.region || summary.region === filters.region) &&
    (!filters.topActionId || summary.topActionId === filters.topActionId) &&
    (!filters.signalType || summary.signalTypes.includes(filters.signalType)) &&
    DNA_DIMENSIONS.every((id) => summary.dna[id] >= (filters.minDna?.[id] ?? 0))
  );
}

/** Cluster intelligence over a list of customers or attribute filters (individual NBAs aggregated). */
export async function clusterIntelligence(
  context: ApiContext,
  input: { customerIds?: string[]; filters?: ClusterFilters },
): Promise<ClusterDNA & { customerIds: string[] }> {
  const summaries = await context.getCustomerIntelligenceRepository().listSummaries();
  const ids = input.customerIds ? new Set(input.customerIds) : null;
  const selected = summaries.filter(
    (summary) => (!ids || ids.has(summary.customerId)) && matches(summary, input.filters ?? {}),
  );
  const startedAt = performance.now();
  const cluster = aggregateClusterRows(selected);
  context.logger.info('cluster_intelligence_computed', {
    operation: 'CLUSTER_INTELLIGENCE',
    populationSize: cluster.populationSize,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return { ...cluster, customerIds: selected.slice(0, 200).map((summary) => summary.customerId) };
}

/** Similar customers by normalized distance (business attributes + DNA), nearest first. */
export async function findSimilarCustomers(context: ApiContext, customerId: string, limit = 20) {
  const summaries = await context.getCustomerIntelligenceRepository().listSummaries();
  const target = summaries.find((summary) => summary.customerId === customerId);
  if (!target) throw new NotFoundError('Cliente sem inteligência calculada.');
  const targetVector = similarityVectorFrom(target);
  const matchesList = summaries
    .filter((summary) => summary.customerId !== customerId)
    .map((summary) => ({
      summary,
      distance: distance(targetVector, similarityVectorFrom(summary)),
    }))
    .filter((item) => item.distance <= SIMILARITY_THRESHOLD)
    .sort((left, right) => left.distance - right.distance);
  return {
    count: matchesList.length,
    threshold: SIMILARITY_THRESHOLD,
    items: matchesList.slice(0, limit).map((item) => ({
      customerId: item.summary.customerId,
      tradeName: item.summary.tradeName,
      segment: item.summary.segment,
      companySize: item.summary.companySize,
      state: item.summary.state,
      dna: item.summary.dna,
      topActionId: item.summary.topActionId,
      topActionName: item.summary.topActionName,
      topScore: item.summary.topScore,
      similarity: Math.round((1 - item.distance) * 100),
    })),
    cluster: aggregateClusterRows(matchesList.map((item) => item.summary)),
  };
}
