import { ACTION_BY_ID } from './actions';
import type { CustomerIntelligenceProfile, NextBestActionRecommendation } from './types';

/** Narrative of a recommendation; produced deterministically or by an AI provider. */
export interface RecommendationExplanation {
  recommendationId: string;
  actionId: string;
  summary: string;
  whyNow: string[];
  explanation: string;
  suggestedConversation: string[];
  questionsAndAnswers: Array<{ question: string; answer: string }>;
  /** 'deterministic' unless an AI model wrote the text (never changes score/rank/eligibility). */
  generatedBy: 'deterministic' | 'ai';
  model?: string;
}

const REASON_TEXT: Record<string, string> = {
  HIGH_CREDIT_INTENT: 'demonstra interesse recorrente por crédito nos canais digitais',
  PRODUCT_GAP_WORKING_CAPITAL: 'ainda não possui Capital de Giro',
  PRODUCT_GAP_PIX_COLLECTION: 'recebe muito por Pix sem solução de cobrança',
  PRODUCT_GAP_CARD: 'tem despesas recorrentes sem cartão empresarial',
  TRANSACTION_GROWTH: 'teve a movimentação crescendo na janela recente',
  TRANSACTION_DECLINE: 'teve queda de movimentação na janela recente',
  ABANDONED_CREDIT_SIMULATION: 'iniciou e não concluiu uma simulação de crédito',
  HIGH_PIX_USAGE: 'usa Pix de forma intensa',
  RECENT_PRODUCT_INTEREST: 'demonstrou interesse recente por um produto',
  INCREASED_PAYMENT_VOLUME: 'aumentou o volume de pagamentos',
  ONBOARDING_INCOMPLETE: 'não concluiu o onboarding da conta',
  LOW_DIGITAL_ENGAGEMENT: 'quase não acessa os canais digitais',
  CUSTOMER_INACTIVITY: 'está sem transacionar e sem acessar os canais',
  RELATIONSHIP_COOLDOWN: 'está há muito tempo sem contato com o gerente',
  RECENT_COMPLAINT: 'registrou reclamação recente',
  UNRESOLVED_SERVICE: 'tem atendimento sem resolução',
  HIGH_DIGITAL_ENGAGEMENT: 'é muito ativa nos canais digitais',
  PRODUCT_GAP: 'tem uma lacuna de produto relevante',
  RELATIONSHIP_ACTIVE: 'mantém relacionamento ativo',
  SERVICE_RISK_PENALTY: 'tem atendimento pendente, o que reduz a prioridade comercial',
  CONTACT_FATIGUE_PENALTY: 'recebeu várias abordagens comerciais recentes',
  INSUFFICIENT_DATA: 'não tem dados suficientes para uma recomendação confiável',
};

function listJoin(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items.at(-1)}` : (items[0] ?? '');
}

/** Deterministic explanation built only from the structured recommendation and evidence. */
export function explainDeterministically(
  profile: Pick<CustomerIntelligenceProfile, 'identity' | 'recommendations' | 'dna'>,
  recommendation: NextBestActionRecommendation,
): RecommendationExplanation {
  const action = ACTION_BY_ID.get(recommendation.actionId);
  const reasons = recommendation.reasonCodes.map((code) => REASON_TEXT[code]).filter(Boolean);
  const alternatives = profile.recommendations
    .filter((item) => item.id !== recommendation.id)
    .slice(0, 3)
    .map((item) => `${item.actionName} (${item.score})`);
  const name = profile.identity.tradeName;
  const whyNow = recommendation.evidence.map((item) => item.title);

  if (recommendation.actionId === 'NO_ACTION') {
    return {
      recommendationId: recommendation.id,
      actionId: recommendation.actionId,
      summary: `Para ${name}, nenhuma ação supera o custo do contato agora.`,
      whyNow,
      explanation:
        'As oportunidades identificadas são fracas ou há fatores de risco no relacionamento. Aguardar evita desgaste e mantém a empresa disponível para uma abordagem futura.',
      suggestedConversation: [],
      questionsAndAnswers: [
        {
          question: 'Quando reavaliar?',
          answer: 'No próximo recálculo diário ou quando surgir um novo sinal forte.',
        },
      ],
      generatedBy: 'deterministic',
    };
  }

  return {
    recommendationId: recommendation.id,
    actionId: recommendation.actionId,
    summary: `${recommendation.actionName} é a ação #${recommendation.rank} para ${name} (score ${recommendation.score}).`,
    whyNow,
    explanation: reasons.length
      ? `A recomendação considera que a empresa ${listJoin(reasons)}.`
      : 'A recomendação vem da combinação do DNA da empresa com o catálogo de ações elegíveis.',
    suggestedConversation: [
      `Abrir com o momento da empresa: ${profile.dna.overallSummary}`,
      `Explorar a necessidade antes de apresentar ${action?.name.toLowerCase() ?? 'a solução'}.`,
      'Deixar claro que é uma conversa consultiva, sem aprovação de crédito ou oferta automática.',
    ],
    questionsAndAnswers: [
      {
        question: 'Quais outras ações foram consideradas?',
        answer: alternatives.length ? alternatives.join('; ') : 'Nenhuma outra ação elegível.',
      },
      {
        question: 'Existe algum motivo para não abordar agora?',
        answer:
          recommendation.penalties.risk > 0 || recommendation.penalties.fatigue > 0
            ? 'Há penalidades aplicadas (atendimento pendente ou abordagens recentes); considerar no tom da conversa.'
            : 'Nenhuma restrição de elegibilidade ou penalidade aplicada.',
      },
    ],
    generatedBy: 'deterministic',
  };
}
