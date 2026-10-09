import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';
import {
  DNA_DIMENSIONS,
  explainDeterministically,
  type CustomerIntelligenceProfile,
  type NextBestActionRecommendation,
  type RecommendationExplanation,
} from '@bfp/customer-intelligence';
import { isGrounded } from '@api/services/intelligence/aiStudy';
import type { BedrockConverseClient } from '@api/services/intelligence/bedrockProvider';

/** Writes the narrative of a recommendation. It never changes action, score, rank or eligibility. */
export interface AIExplanationProvider {
  readonly name: 'deterministic' | 'bedrock';
  explain(
    profile: CustomerIntelligenceProfile,
    recommendation: NextBestActionRecommendation,
  ): Promise<RecommendationExplanation>;
}

/** Local development and fallback: explanation built only from reason codes and evidence. */
export class DeterministicExplanationProvider implements AIExplanationProvider {
  readonly name = 'deterministic' as const;

  async explain(
    profile: CustomerIntelligenceProfile,
    recommendation: NextBestActionRecommendation,
  ) {
    return explainDeterministically(profile, recommendation);
  }
}

const outputSchema = z.object({
  summary: z.string().trim().min(10).max(600),
  whyNow: z.array(z.string().trim().min(3).max(300)).max(6).default([]),
  explanation: z.string().trim().min(10).max(1500),
  suggestedConversation: z.array(z.string().trim().min(3).max(300)).max(5).default([]),
  questionsAndAnswers: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(200),
        answer: z.string().trim().min(3).max(600),
      }),
    )
    .max(5)
    .default([]),
});

/** Structured input the model receives (no raw data, no personal attributes). */
export function explanationInput(
  profile: CustomerIntelligenceProfile,
  recommendation: NextBestActionRecommendation,
) {
  return {
    customer: {
      tradeName: profile.identity.tradeName,
      segment: profile.identity.segment,
      companySize: profile.identity.companySize,
      tenureMonths: profile.tenureMonths,
    },
    action: recommendation.actionId,
    actionName: recommendation.actionName,
    rank: recommendation.rank,
    score: recommendation.score,
    confidence: recommendation.confidence,
    channel: recommendation.recommendedChannel,
    reasonCodes: recommendation.reasonCodes,
    signals: recommendation.evidence.map((evidence) => ({
      type: evidence.signalType,
      title: evidence.title,
      value: evidence.value,
    })),
    penalties: recommendation.penalties,
    dna: Object.fromEntries(DNA_DIMENSIONS.map((id) => [id, profile.dna[id].score])),
    changes: profile.changes.slice(0, 4).map((change) => ({
      metric: change.label,
      percentageChange:
        change.percentageChange === null ? null : Math.round(change.percentageChange * 100),
      absoluteChange: change.absoluteChange,
    })),
    alternatives: profile.recommendations
      .filter((item) => item.id !== recommendation.id)
      .map((item) => ({ action: item.actionName, rank: item.rank, score: item.score })),
  };
}

/** Numbers the text may quote: everything present in the structured input. */
function numberPool(input: ReturnType<typeof explanationInput>) {
  const pool: number[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) pool.push(value, Math.abs(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(input);
  return pool;
}

/**
 * Bedrock (Claude) turns the structured recommendation into language. The result is validated;
 * sentences with numbers absent from the input are removed, so no fact is invented.
 */
export class BedrockExplanationProvider implements AIExplanationProvider {
  readonly name = 'bedrock' as const;

  constructor(
    private readonly client: BedrockConverseClient,
    private readonly modelId: string,
  ) {}

  async explain(
    profile: CustomerIntelligenceProfile,
    recommendation: NextBestActionRecommendation,
  ) {
    const input = explanationInput(profile, recommendation);
    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [
          {
            text: [
              'Você explica recomendações de Próxima Melhor Ação para gerentes PJ do Itaú Empresas.',
              'Use SOMENTE os fatos do JSON recebido. Não invente números, produtos, condições, taxas ou aprovações.',
              'Não altere a ação, o score, o ranking nem a elegibilidade: apenas explique.',
              'Tom consultivo, português do Brasil. Deixe claro que não há aprovação de crédito.',
              'Responda SOMENTE um JSON: {"summary":"...","whyNow":["..."],"explanation":"...","suggestedConversation":["..."],"questionsAndAnswers":[{"question":"...","answer":"..."}]}',
            ].join('\n'),
          },
        ],
        messages: [{ role: 'user', content: [{ text: JSON.stringify(input) }] }],
        inferenceConfig: { maxTokens: 1_200, temperature: 0.2 },
      }),
    );
    const text = (response.output?.message?.content ?? [])
      .map((block) => ('text' in block ? block.text : ''))
      .join('\n');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const parsed =
      start >= 0 && end > start
        ? outputSchema.safeParse(JSON.parse(text.slice(start, end + 1)))
        : null;
    if (!parsed?.success) throw new Error('Explicação do modelo fora do formato esperado.');

    const pool = numberPool(input);
    const grounded = (value: string) => isGrounded(value, pool);
    return {
      recommendationId: recommendation.id,
      actionId: recommendation.actionId,
      summary: grounded(parsed.data.summary)
        ? parsed.data.summary
        : explainDeterministically(profile, recommendation).summary,
      whyNow: parsed.data.whyNow.filter(grounded),
      explanation: parsed.data.explanation
        .split(/(?<=[.!?])\s+/)
        .filter(grounded)
        .join(' '),
      suggestedConversation: parsed.data.suggestedConversation.filter(grounded),
      questionsAndAnswers: parsed.data.questionsAndAnswers.filter(
        (item) => grounded(item.question) && grounded(item.answer),
      ),
      generatedBy: 'ai',
      model: this.modelId,
    } satisfies RecommendationExplanation;
  }
}
