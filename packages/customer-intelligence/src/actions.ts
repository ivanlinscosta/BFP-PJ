import type { ActionDefinition, ContentTopic, DnaDimensionId, ProductCode } from './types';

const COMMERCIAL_RULES = [
  { id: 'customerStatus' },
  { id: 'consent' },
  { id: 'contactability' },
  { id: 'cooldown' },
  { id: 'recentComplaint' },
  { id: 'journeyState' },
  { id: 'actionEnabled' },
  { id: 'outstandingInteraction' },
] as const satisfies ActionDefinition['eligibilityRules'];

const offer = (product: ProductCode): ActionDefinition['eligibilityRules'] => [
  { id: 'productAlreadyOwned', product },
  ...COMMERCIAL_RULES,
];

/** Candidate action catalog (versioned with the NBA model). NO_ACTION is a valid action. */
export const ACTION_CATALOG: ActionDefinition[] = [
  {
    id: 'OFFER_WORKING_CAPITAL',
    name: 'Oferecer Capital de Giro',
    description: 'Conversa consultiva sobre necessidade de capital de giro.',
    category: 'CREDIT',
    objective: 'EXPANSION',
    supportedChannels: ['RELATIONSHIP_MANAGER', 'WHATSAPP'],
    eligibilityRules: [...offer('CAPITAL_DE_GIRO'), { id: 'commercialPolicy' }],
    relevantSignals: [
      'HIGH_CREDIT_INTENT',
      'PRODUCT_GAP_WORKING_CAPITAL',
      'TRANSACTION_GROWTH',
      'ABANDONED_CREDIT_SIMULATION',
    ],
    cooldownDays: 30,
    active: true,
    commercial: true,
  },
  {
    id: 'PROMOTE_PIX_COLLECTION',
    name: 'Apresentar Pix Cobrança',
    description: 'Mostrar como receber por Pix com cobrança e conciliação.',
    category: 'PAYMENTS',
    objective: 'EXPANSION',
    supportedChannels: ['APP', 'RELATIONSHIP_MANAGER', 'WHATSAPP'],
    eligibilityRules: offer('PIX_COBRANCA'),
    relevantSignals: ['PRODUCT_GAP_PIX_COLLECTION', 'HIGH_PIX_USAGE', 'RECENT_PRODUCT_INTEREST'],
    cooldownDays: 21,
    active: true,
    commercial: true,
  },
  {
    id: 'PROMOTE_BUSINESS_CARD',
    name: 'Oferecer Cartão PJ',
    description: 'Concentrar despesas recorrentes no cartão empresarial.',
    category: 'PAYMENTS',
    objective: 'EXPANSION',
    supportedChannels: ['APP', 'RELATIONSHIP_MANAGER'],
    eligibilityRules: offer('CARTAO_EMPRESARIAL'),
    relevantSignals: ['PRODUCT_GAP_CARD', 'INCREASED_PAYMENT_VOLUME', 'RECENT_PRODUCT_INTEREST'],
    cooldownDays: 30,
    active: true,
    commercial: true,
  },
  {
    id: 'PROMOTE_POS_MACHINE',
    name: 'Oferecer Maquininha',
    description: 'Ampliar recebimentos presenciais com maquininha.',
    category: 'PAYMENTS',
    objective: 'EXPANSION',
    supportedChannels: ['RELATIONSHIP_MANAGER', 'WHATSAPP', 'APP'],
    eligibilityRules: offer('MAQUININHA'),
    relevantSignals: ['RECENT_PRODUCT_INTEREST', 'TRANSACTION_GROWTH', 'HIGH_PIX_USAGE'],
    cooldownDays: 30,
    active: true,
    commercial: true,
  },
  {
    id: 'PROMOTE_BOLETO',
    name: 'Apresentar cobrança por boletos',
    description: 'Organizar recebimentos a prazo com boleto registrado.',
    category: 'PAYMENTS',
    objective: 'EXPANSION',
    supportedChannels: ['APP', 'EMAIL'],
    eligibilityRules: offer('BOLETO'),
    relevantSignals: ['INCREASED_PAYMENT_VOLUME', 'TRANSACTION_GROWTH', 'RECENT_PRODUCT_INTEREST'],
    cooldownDays: 30,
    active: true,
    commercial: true,
  },
  {
    id: 'PROMOTE_INSURANCE',
    name: 'Oferecer seguro empresarial',
    description: 'Proteção do negócio para clientes com operação consolidada.',
    category: 'PROTECTION',
    objective: 'EXPANSION',
    supportedChannels: ['RELATIONSHIP_MANAGER', 'EMAIL'],
    eligibilityRules: offer('SEGURO'),
    relevantSignals: ['RECENT_PRODUCT_INTEREST', 'TRANSACTION_GROWTH'],
    cooldownDays: 60,
    active: true,
    commercial: true,
  },
  {
    id: 'PROMOTE_INVESTMENTS',
    name: 'Apresentar investimentos PJ',
    description: 'Rentabilizar o caixa parado da empresa.',
    category: 'PROTECTION',
    objective: 'EXPANSION',
    supportedChannels: ['RELATIONSHIP_MANAGER', 'APP'],
    eligibilityRules: offer('INVESTIMENTOS'),
    relevantSignals: ['RECENT_PRODUCT_INTEREST', 'TRANSACTION_GROWTH', 'INCREASED_PAYMENT_VOLUME'],
    cooldownDays: 60,
    active: true,
    commercial: true,
  },
  {
    id: 'COMPLETE_ONBOARDING',
    name: 'Concluir onboarding',
    description: 'Ajudar a empresa a terminar a configuração da conta.',
    category: 'ENGAGEMENT',
    objective: 'ACTIVATION',
    supportedChannels: ['APP', 'WHATSAPP', 'PHONE'],
    eligibilityRules: [
      { id: 'customerStatus' },
      { id: 'journeyState' },
      { id: 'cooldown' },
      { id: 'actionEnabled' },
    ],
    relevantSignals: ['ONBOARDING_INCOMPLETE'],
    cooldownDays: 7,
    active: true,
    commercial: false,
  },
  {
    id: 'REENGAGE_DIGITAL',
    name: 'Reengajar nos canais digitais',
    description: 'Retomar o uso do app e do Internet Banking.',
    category: 'ENGAGEMENT',
    objective: 'RETENTION',
    supportedChannels: ['APP', 'EMAIL', 'WHATSAPP'],
    eligibilityRules: [
      { id: 'customerStatus' },
      { id: 'journeyState' },
      { id: 'cooldown' },
      { id: 'actionEnabled' },
    ],
    relevantSignals: ['LOW_DIGITAL_ENGAGEMENT', 'CUSTOMER_INACTIVITY', 'TRANSACTION_DECLINE'],
    cooldownDays: 21,
    active: true,
    commercial: false,
  },
  {
    id: 'CONTACT_RELATIONSHIP_MANAGER',
    name: 'Contato consultivo do gerente',
    description: 'Conversa de relacionamento para entender o momento da empresa.',
    category: 'ENGAGEMENT',
    objective: 'RETENTION',
    supportedChannels: ['RELATIONSHIP_MANAGER', 'PHONE'],
    eligibilityRules: [
      { id: 'customerStatus' },
      { id: 'contactability' },
      { id: 'cooldown' },
      { id: 'actionEnabled' },
    ],
    relevantSignals: [
      'HIGH_VALUE_RELATIONSHIP',
      'RELATIONSHIP_COOLDOWN',
      'TRANSACTION_DECLINE',
      'CUSTOMER_INACTIVITY',
    ],
    cooldownDays: 30,
    active: true,
    commercial: false,
  },
  {
    id: 'RESOLVE_SERVICE_ISSUE',
    name: 'Resolver atendimento pendente',
    description: 'Priorizar a solução da reclamação ou atendimento em aberto.',
    category: 'SERVICE',
    objective: 'SERVICE_RECOVERY',
    supportedChannels: ['RELATIONSHIP_MANAGER', 'PHONE', 'WHATSAPP'],
    eligibilityRules: [{ id: 'actionEnabled' }],
    relevantSignals: ['RECENT_COMPLAINT', 'UNRESOLVED_SERVICE'],
    active: true,
    commercial: false,
  },
  {
    id: 'EDUCATE_PRODUCT_FEATURE',
    name: 'Educar sobre produtos contratados',
    description: 'Mostrar funcionalidades pouco usadas dos produtos que a empresa já tem.',
    category: 'ENGAGEMENT',
    objective: 'EDUCATION',
    supportedChannels: ['APP', 'EMAIL'],
    eligibilityRules: [
      { id: 'customerStatus' },
      { id: 'journeyState' },
      { id: 'cooldown' },
      { id: 'actionEnabled' },
    ],
    relevantSignals: [],
    cooldownDays: 30,
    active: true,
    commercial: false,
  },
  {
    id: 'NO_ACTION',
    name: 'Não abordar agora',
    description: 'Nenhuma ação supera o custo do contato neste momento.',
    category: 'NONE',
    objective: 'RESTRAINT',
    supportedChannels: [],
    eligibilityRules: [],
    relevantSignals: [],
    active: true,
    commercial: false,
  },
];

/** Content topic an offer answers: a "recent product interest" only counts for its own topic. */
export const ACTION_TOPIC: Record<string, ContentTopic | undefined> = {
  PROMOTE_PIX_COLLECTION: 'PIX_COBRANCA',
  PROMOTE_POS_MACHINE: 'MAQUININHA',
  PROMOTE_BUSINESS_CARD: 'CARTOES',
  PROMOTE_BOLETO: 'BOLETO',
  PROMOTE_INSURANCE: 'SEGUROS',
  PROMOTE_INVESTMENTS: 'INVESTIMENTOS',
};

export const ACTION_BY_ID = new Map(ACTION_CATALOG.map((action) => [action.id, action]));

/**
 * Scoring heuristics per action (versioned with the model): affinity with DNA dimensions
 * (`invert` = the lower the dimension, the more relevant), base impact and product.
 */
export const ACTION_SCORING: Record<
  string,
  {
    affinity: Array<{ dimension: DnaDimensionId; weight: number; invert?: boolean }>;
    impact: number;
    product?: ProductCode;
  }
> = {
  OFFER_WORKING_CAPITAL: {
    affinity: [
      { dimension: 'commercialIntent', weight: 0.45 },
      { dimension: 'businessMomentum', weight: 0.25 },
      { dimension: 'transactionActivity', weight: 0.15 },
      { dimension: 'relationshipStrength', weight: 0.15 },
    ],
    impact: 0.92,
    product: 'CAPITAL_DE_GIRO',
  },
  PROMOTE_PIX_COLLECTION: {
    affinity: [
      { dimension: 'transactionActivity', weight: 0.4 },
      { dimension: 'digitalEngagement', weight: 0.3 },
      { dimension: 'businessMomentum', weight: 0.3 },
    ],
    impact: 0.72,
    product: 'PIX_COBRANCA',
  },
  PROMOTE_BUSINESS_CARD: {
    affinity: [
      { dimension: 'transactionActivity', weight: 0.5 },
      { dimension: 'businessMomentum', weight: 0.3 },
      { dimension: 'relationshipStrength', weight: 0.2 },
    ],
    impact: 0.62,
    product: 'CARTAO_EMPRESARIAL',
  },
  PROMOTE_POS_MACHINE: {
    affinity: [
      { dimension: 'businessMomentum', weight: 0.4 },
      { dimension: 'transactionActivity', weight: 0.4 },
      { dimension: 'digitalEngagement', weight: 0.2 },
    ],
    impact: 0.66,
    product: 'MAQUININHA',
  },
  PROMOTE_BOLETO: {
    affinity: [
      { dimension: 'transactionActivity', weight: 0.6 },
      { dimension: 'productDepth', weight: 0.4, invert: true },
    ],
    impact: 0.45,
    product: 'BOLETO',
  },
  PROMOTE_INSURANCE: {
    affinity: [
      { dimension: 'relationshipStrength', weight: 0.4 },
      { dimension: 'productDepth', weight: 0.4 },
      { dimension: 'transactionActivity', weight: 0.2 },
    ],
    impact: 0.5,
    product: 'SEGURO',
  },
  PROMOTE_INVESTMENTS: {
    affinity: [
      { dimension: 'transactionActivity', weight: 0.5 },
      { dimension: 'relationshipStrength', weight: 0.3 },
      { dimension: 'productDepth', weight: 0.2 },
    ],
    impact: 0.55,
    product: 'INVESTIMENTOS',
  },
  COMPLETE_ONBOARDING: {
    affinity: [{ dimension: 'productDepth', weight: 1, invert: true }],
    impact: 0.88,
  },
  REENGAGE_DIGITAL: {
    affinity: [
      { dimension: 'digitalEngagement', weight: 0.6, invert: true },
      { dimension: 'businessMomentum', weight: 0.4, invert: true },
    ],
    impact: 0.6,
  },
  CONTACT_RELATIONSHIP_MANAGER: {
    affinity: [
      { dimension: 'transactionActivity', weight: 0.45 },
      { dimension: 'digitalEngagement', weight: 0.3, invert: true },
      { dimension: 'businessMomentum', weight: 0.25, invert: true },
    ],
    impact: 0.6,
  },
  RESOLVE_SERVICE_ISSUE: {
    affinity: [{ dimension: 'relationshipStrength', weight: 1 }],
    impact: 0.95,
  },
  EDUCATE_PRODUCT_FEATURE: {
    affinity: [
      { dimension: 'productDepth', weight: 0.5 },
      { dimension: 'digitalEngagement', weight: 0.5 },
    ],
    impact: 0.4,
  },
  NO_ACTION: { affinity: [], impact: 0 },
};
