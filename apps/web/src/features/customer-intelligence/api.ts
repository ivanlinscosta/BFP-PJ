import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClusterDNA,
  CustomerChange,
  CustomerDNA,
  CustomerIdentity,
  CustomerIntelligenceProfile,
  CustomerSignal,
  NextBestActionRecommendation,
  OutcomeStatus,
  RecommendationExplanation,
  RecommendationOutcome,
} from '@bfp/customer-intelligence';
import { apiRequest } from '@/services/apiClient';

/** Response of GET /customers/:id/intelligence (served by the materialized read model). */
export interface CustomerIntelligenceResponse {
  customer: CustomerIdentity;
  tenureMonths: number;
  dna: CustomerDNA;
  changes: CustomerChange[];
  signals: CustomerSignal[];
  recommendations: NextBestActionRecommendation[];
  readingShift: CustomerIntelligenceProfile['readingShift'];
  tabs: CustomerIntelligenceProfile['tabs'];
  similar: CustomerIntelligenceProfile['similar'];
  outcomes: RecommendationOutcome[];
  updatedAt: string;
  dataQuality: { score: number; freshness: string };
  dnaVersion: string;
  modelVersion: string;
}

export interface SimilarCustomersResponse {
  count: number;
  threshold: number;
  items: Array<{
    customerId: string;
    tradeName: string;
    segment: string;
    companySize: string;
    state: string;
    topActionId: string;
    topActionName: string;
    topScore: number;
    similarity: number;
  }>;
  cluster: ClusterDNA;
}

export function useCustomerIntelligence(customerId: string) {
  return useQuery({
    queryKey: ['customer-intelligence', customerId],
    queryFn: () =>
      apiRequest<CustomerIntelligenceResponse>(
        `/customers/${encodeURIComponent(customerId)}/intelligence`,
      ),
    enabled: Boolean(customerId),
    retry: false,
  });
}

export function useSimilarCustomers(customerId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['customer-similar', customerId],
    queryFn: () =>
      apiRequest<SimilarCustomersResponse, { customerId: string; limit: number }>(
        '/customers/similar',
        {
          method: 'POST',
          body: { customerId, limit: 10 },
        },
      ),
    enabled,
  });
}

export function useRecommendationExplanation(recommendationId: string | null) {
  return useQuery({
    queryKey: ['recommendation-explanation', recommendationId],
    queryFn: async () =>
      (
        await apiRequest<{ explanation: RecommendationExplanation & { notice?: string } }>(
          `/recommendations/${encodeURIComponent(recommendationId ?? '')}/explain`,
          { method: 'POST' },
        )
      ).explanation,
    enabled: Boolean(recommendationId),
    staleTime: 5 * 60_000,
  });
}

export function useRecordOutcome(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      recommendationId: string;
      status: OutcomeStatus;
      channel?: string;
      reason?: string;
    }) =>
      apiRequest<{ outcome: RecommendationOutcome }, Omit<typeof input, 'recommendationId'>>(
        `/recommendations/${encodeURIComponent(input.recommendationId)}/outcomes`,
        {
          method: 'POST',
          body: { status: input.status, channel: input.channel, reason: input.reason },
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer-intelligence', customerId] });
    },
  });
}

export async function analyzeAudienceIntelligence(filterGroups: unknown) {
  return (
    await apiRequest<
      { cluster: ClusterDNA & { customerIds: string[] } },
      { filterGroups: unknown }
    >('/audiences/intelligence', { method: 'POST', body: { filterGroups } })
  ).cluster;
}
