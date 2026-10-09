import type {
  CustomerChange,
  CustomerSignal,
  DnaDimensionId,
  DnaLevel,
  NextBestActionRecommendation,
  SignalCategory,
} from '@bfp/customer-intelligence';

/** Labels of the DNA dimensions, with the tree metaphor of each one. */
export const DNA_LABELS: Record<
  DnaDimensionId,
  { title: string; metaphor: string; levels: Record<DnaLevel, string> }
> = {
  digitalEngagement: {
    title: 'Engajamento digital',
    metaphor: 'Rede de conexões',
    levels: { LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto', VERY_HIGH: 'Muito alto' },
  },
  productDepth: {
    title: 'Profundidade de produtos',
    metaphor: 'Ramificações e cobertura',
    levels: { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', VERY_HIGH: 'Muito alta' },
  },
  relationshipStrength: {
    title: 'Relacionamento',
    metaphor: 'Raízes e vínculos',
    levels: { LOW: 'Frágil', MEDIUM: 'Moderado', HIGH: 'Forte', VERY_HIGH: 'Muito forte' },
  },
  commercialIntent: {
    title: 'Intenção comercial',
    metaphor: 'Brotos de oportunidade',
    levels: { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', VERY_HIGH: 'Muito alta' },
  },
  businessMomentum: {
    title: 'Momentum do negócio',
    metaphor: 'Crescimento do organismo',
    levels: { LOW: 'Desaceleração', MEDIUM: 'Estável', HIGH: 'Crescimento', VERY_HIGH: 'Expansão' },
  },
  transactionActivity: {
    title: 'Atividade transacional',
    metaphor: 'Circulação e fluxos',
    levels: { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', VERY_HIGH: 'Muito alta' },
  },
};

export const LEVEL_LABELS: Record<DnaLevel, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  VERY_HIGH: 'Muito alta',
};

export const TREND_LABELS = { UP: 'em alta', DOWN: 'em queda', STABLE: 'estável' } as const;

export const CHANNEL_LABELS: Record<string, string> = {
  'RELATIONSHIP_MANAGER+WHATSAPP': 'Gerente + WhatsApp',
  RELATIONSHIP_MANAGER: 'Gerente de relacionamento',
  WHATSAPP: 'WhatsApp',
  APP: 'App Itaú Empresas',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  NONE: 'Sem contato',
};

export function windowLabel(window: NextBestActionRecommendation['recommendedWindow']) {
  if (!window) return '—';
  if (window.type === 'NOW') return 'Agora';
  if (window.type === 'NEXT_DAYS') return `Próximos ${window.days ?? 3} dias`;
  return window.days && window.days > 7 ? `Reavaliar em ${window.days} dias` : 'Próxima semana';
}

export function priorityOf(score: number) {
  if (score >= 80)
    return {
      label: 'Alta prioridade',
      tone: 'cream' as const,
      fit: 'Alta aderência ao momento atual da empresa.',
    };
  if (score >= 60)
    return {
      label: 'Média prioridade',
      tone: 'tint' as const,
      fit: 'Boa aderência ao momento atual da empresa.',
    };
  return {
    label: 'Baixa prioridade',
    tone: 'neutral' as const,
    fit: 'Aderência limitada ao momento atual da empresa.',
  };
}

export const SIGNAL_CATEGORY_LABELS: Record<SignalCategory, string> = {
  INTENT: 'Oportunidade',
  GROWTH: 'Crescimento',
  ENGAGEMENT: 'Engajamento',
  PRODUCT_GAP: 'Produto',
  RELATIONSHIP: 'Relacionamento',
  RISK: 'Risco',
  JOURNEY: 'Jornada',
  TRANSACTION: 'Transações',
  DIGITAL: 'Digital',
};

export const SIGNAL_KIND_LABELS: Record<CustomerSignal['kind'], string> = {
  OPPORTUNITY: 'Oportunidade identificada',
  OBSERVATION: 'Sinal observado',
  RISK: 'Ponto de atenção',
};

/** Filters of the Signals tab (spec: Todos, Oportunidade, Digital, Transações, Produtos, Relacionamento). */
export const SIGNAL_FILTERS: Array<{
  value: string;
  label: string;
  categories: SignalCategory[] | null;
}> = [
  { value: 'all', label: 'Todos', categories: null },
  { value: 'opportunity', label: 'Oportunidade', categories: ['INTENT', 'GROWTH', 'JOURNEY'] },
  { value: 'digital', label: 'Digital', categories: ['DIGITAL', 'ENGAGEMENT'] },
  { value: 'transactions', label: 'Transações', categories: ['TRANSACTION'] },
  { value: 'products', label: 'Produtos', categories: ['PRODUCT_GAP'] },
  { value: 'relationship', label: 'Relacionamento', categories: ['RELATIONSHIP', 'RISK'] },
];

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "↑ 18%" / "+3" style value of a change tile. */
export function changeValue(change: CustomerChange) {
  if (change.display === 'ABSOLUTE') {
    const value = Math.round(change.absoluteChange);
    return `${value > 0 ? '+' : ''}${value}`;
  }
  return `${percent.format(Math.abs((change.percentageChange ?? 0) * 100))}%`;
}

/** Canonical order of the change tiles (Figma: volume, digital, credit, card). */
export const CHANGE_ORDER = [
  'transaction_volume_30d',
  'digital_sessions_30d',
  'credit_content_views_14d',
  'card_volume_30d',
  'payments_volume_60d',
  'crm_interactions_30d',
];

/**
 * "Por que agora?" bullets built from the structured evidence of the recommendation (no LLM).
 * Numbers come from the signal evidence of the profile.
 */
export function whyNowBullets(
  recommendation: NextBestActionRecommendation,
  signals: CustomerSignal[],
  tenureMonths: number,
) {
  const bullets: string[] = [];
  const evidenceOf = (type: string, feature: string) =>
    signals
      .find((signal) => signal.type === type)
      ?.evidence.find((item) => item.feature === feature)?.value;
  for (const evidence of recommendation.evidence) {
    switch (evidence.signalType) {
      case 'TRANSACTION_GROWTH':
        bullets.push(`↑ ${evidence.value ?? ''}% no volume transacional em 60 dias`);
        break;
      case 'HIGH_CREDIT_INTENT': {
        const views = evidenceOf('HIGH_CREDIT_INTENT', 'credit_page_views_14d');
        const simulations = Number(evidenceOf('HIGH_CREDIT_INTENT', 'credit_simulations_30d') ?? 0);
        if (views) bullets.push(`${views} visitas a conteúdos de crédito em 14 dias`);
        if (simulations > 0)
          bullets.push(
            simulations === 1 ? '1 simulação recente' : `${simulations} simulações recentes`,
          );
        break;
      }
      case 'PRODUCT_GAP_WORKING_CAPITAL':
        bullets.push('Ainda não possui Capital de Giro');
        break;
      case 'PRODUCT_GAP_PIX_COLLECTION':
        bullets.push('Ainda não possui Pix Cobrança');
        break;
      case 'PRODUCT_GAP_CARD':
        bullets.push('Ainda não possui Cartão PJ');
        break;
      default:
        bullets.push(evidence.title);
    }
  }
  if (recommendation.reasonCodes.includes('RELATIONSHIP_ACTIVE')) {
    bullets.push(`Relacionamento ativo há ${tenureMonths} meses (comercial)`);
  }
  if (recommendation.penalties.risk > 0)
    bullets.push('Atendimento pendente reduz a prioridade comercial');
  return [...new Set(bullets)].slice(0, 6);
}

export const INTERACTION_CHANNEL_LABELS: Record<string, string> = {
  PHONE: 'CRM / Gerente',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  BRANCH: 'Agência',
  CHAT: 'Chat',
  AI_ASSISTANT: 'IA Conversacional',
};

export const FEATURE_LABELS: Record<string, string> = {
  extrato: 'Extrato',
  pix: 'Pix',
  pagamentos: 'Pagamentos',
  boletos: 'Boletos',
  cartao: 'Cartão',
  cobranca: 'Cobrança',
  investimentos: 'Investimentos',
  folha: 'Folha de pagamento',
  relatorios: 'Relatórios',
  simulador: 'Simulação de crédito',
};

export const PRODUCT_STATUS_LABELS: Record<
  string,
  { label: string; tone: 'success' | 'tint' | 'neutral' }
> = {
  ACTIVE: { label: 'Ativa', tone: 'success' },
  IN_USE: { label: 'Em uso', tone: 'success' },
  CONTRACTED: { label: 'Contratado', tone: 'tint' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

export const USAGE_LABELS: Record<string, string> = {
  DAILY: 'Uso diário',
  WEEKLY: 'Uso semanal',
  MONTHLY: 'Uso mensal',
  RARE: 'Uso pontual',
};
