import type { ContentTopic, DnaDimensionId, DnaLevel, ProductCategory, ProductCode } from './types';

export const DNA_VERSION = 'dna-1.0.0';
export const NBA_MODEL_VERSION = 'nba-1.0.0';

/** How a feature becomes a 0–1 contribution before weighting. */
export type Normalizer =
  | { kind: 'linear'; min: number; max: number }
  /** Lower is better (e.g. days since last login). */
  | { kind: 'inverse'; min: number; max: number }
  /** For amounts that span orders of magnitude (BRL volumes). */
  | { kind: 'log10'; min: number; max: number }
  | { kind: 'boolean' };

export interface DnaComponentConfig {
  feature: string;
  label: string;
  weight: number;
  normalize: Normalizer;
  source: string;
  period?: string;
}

/** Weights and normalizations of every DNA dimension (weights of a dimension sum to 1). */
export type DnaScoringConfig = Record<DnaDimensionId, DnaComponentConfig[]>;

export const DEFAULT_DNA_CONFIG: DnaScoringConfig = {
  relationshipStrength: [
    {
      feature: 'relationship_tenure_days',
      label: 'Tempo de relacionamento',
      weight: 0.2,
      normalize: { kind: 'linear', min: 0, max: 600 },
      source: 'Cadastro PJ',
    },
    {
      feature: 'crm_interactions_90d',
      label: 'Interações com gerente/CRM',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 7 },
      source: 'CRM',
      period: '90 dias',
    },
    {
      feature: 'products_count',
      label: 'Produtos contratados',
      weight: 0.2,
      normalize: { kind: 'linear', min: 0, max: 6 },
      source: 'Produtos',
    },
    {
      feature: 'active_products_ratio',
      label: 'Uso dos produtos',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 1 },
      source: 'Produtos',
    },
    {
      feature: 'days_since_last_contact',
      label: 'Recência do contato',
      weight: 0.15,
      normalize: { kind: 'inverse', min: 0, max: 60 },
      source: 'CRM',
    },
    {
      feature: 'has_relationship_manager',
      label: 'Gerente de relacionamento',
      weight: 0.15,
      normalize: { kind: 'boolean' },
      source: 'CRM',
    },
  ],
  digitalEngagement: [
    {
      feature: 'logins_30d',
      label: 'Frequência de login',
      weight: 0.3,
      normalize: { kind: 'linear', min: 0, max: 24 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'digital_active_days_30d',
      label: 'Dias ativos',
      weight: 0.2,
      normalize: { kind: 'linear', min: 0, max: 20 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'features_used_30d',
      label: 'Funcionalidades usadas',
      weight: 0.2,
      normalize: { kind: 'linear', min: 0, max: 7 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'days_since_last_login',
      label: 'Recência de acesso',
      weight: 0.15,
      normalize: { kind: 'inverse', min: 0, max: 30 },
      source: 'Digital',
    },
    {
      feature: 'channel_mix',
      label: 'App e Internet Banking',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 1 },
      source: 'Digital',
      period: '30 dias',
    },
  ],
  productDepth: [
    {
      feature: 'products_count',
      label: 'Quantidade de produtos',
      weight: 0.4,
      normalize: { kind: 'linear', min: 0, max: 8 },
      source: 'Produtos',
    },
    {
      feature: 'active_products_ratio',
      label: 'Uso efetivo',
      weight: 0.25,
      normalize: { kind: 'linear', min: 0, max: 1 },
      source: 'Produtos',
    },
    {
      feature: 'product_categories_count',
      label: 'Categorias',
      weight: 0.2,
      normalize: { kind: 'linear', min: 0, max: 5 },
      source: 'Produtos',
    },
    {
      feature: 'relevant_gaps',
      label: 'Lacunas relevantes',
      weight: 0.15,
      normalize: { kind: 'inverse', min: 0, max: 3 },
      source: 'Produtos',
    },
  ],
  transactionActivity: [
    {
      feature: 'transaction_volume_30d',
      label: 'Volume transacionado',
      weight: 0.35,
      normalize: { kind: 'log10', min: 4, max: 6.7 },
      source: 'Transações',
      period: '30 dias',
    },
    {
      feature: 'transactions_count_30d',
      label: 'Frequência de transações',
      weight: 0.25,
      normalize: { kind: 'linear', min: 0, max: 260 },
      source: 'Transações',
      period: '30 dias',
    },
    {
      feature: 'payment_means_used',
      label: 'Meios usados (Pix, boleto, cartão)',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 3 },
      source: 'Transações',
      period: '30 dias',
    },
    {
      feature: 'transaction_volume_change_60d',
      label: 'Tendência do volume',
      weight: 0.25,
      normalize: { kind: 'linear', min: -0.3, max: 0.3 },
      source: 'Transações',
      period: '60 dias',
    },
  ],
  businessMomentum: [
    {
      feature: 'transaction_volume_change_60d',
      label: 'Crescimento transacional',
      weight: 0.3,
      normalize: { kind: 'linear', min: -0.3, max: 0.3 },
      source: 'Transações',
      period: '60 dias',
    },
    {
      feature: 'inflow_change_60d',
      label: 'Crescimento de recebimentos',
      weight: 0.2,
      normalize: { kind: 'linear', min: -0.3, max: 0.3 },
      source: 'Transações',
      period: '60 dias',
    },
    {
      feature: 'digital_sessions_change_30d',
      label: 'Aumento de acessos',
      weight: 0.2,
      normalize: { kind: 'linear', min: -0.5, max: 1 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'new_products_90d',
      label: 'Maior utilização de produtos',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 4 },
      source: 'Produtos',
      period: '90 dias',
    },
    {
      feature: 'payments_volume_change_60d',
      label: 'Evolução dos pagamentos',
      weight: 0.15,
      normalize: { kind: 'linear', min: -0.3, max: 0.3 },
      source: 'Transações',
      period: '60 dias',
    },
  ],
  commercialIntent: [
    {
      feature: 'credit_page_views_14d',
      label: 'Visitas a conteúdo de crédito',
      weight: 0.25,
      normalize: { kind: 'linear', min: 0, max: 3 },
      source: 'Digital',
      period: '14 dias',
    },
    {
      feature: 'credit_searches_14d',
      label: 'Buscas por crédito',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 3 },
      source: 'Digital',
      period: '14 dias',
    },
    {
      feature: 'credit_simulations_30d',
      label: 'Simulações',
      weight: 0.25,
      normalize: { kind: 'linear', min: 0, max: 2 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'product_views_30d',
      label: 'Interações com produtos',
      weight: 0.1,
      normalize: { kind: 'linear', min: 0, max: 8 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'abandoned_credit_journeys_30d',
      label: 'Jornadas de crédito abandonadas',
      weight: 0.1,
      normalize: { kind: 'linear', min: 0, max: 2 },
      source: 'Digital',
      period: '30 dias',
    },
    {
      feature: 'transaction_volume_change_60d',
      label: 'Crescimento transacional',
      weight: 0.15,
      normalize: { kind: 'linear', min: 0, max: 0.25 },
      source: 'Transações',
      period: '60 dias',
    },
  ],
};

/** Score thresholds of the DNA levels (score ≥ value). */
export const DNA_LEVEL_THRESHOLDS: Array<[DnaLevel, number]> = [
  ['VERY_HIGH', 90],
  ['HIGH', 70],
  ['MEDIUM', 40],
  ['LOW', 0],
];

/** Change of score (points) vs. 30 days ago that counts as a trend. */
export const DNA_TREND_THRESHOLD = 3;

export interface NbaScoringConfig {
  weights: {
    relevance: number;
    intent: number;
    expectedImpact: number;
    timing: number;
    confidence: number;
  };
  penalties: {
    /** Penalty per commercial contact in the last 30 days, capped. */
    fatiguePerContact: number;
    fatigueCap: number;
    /** Commercial actions while there is an unresolved interaction or complaint. */
    unresolvedServiceRisk: number;
    complaintRisk: number;
  };
  /** Below this score no actionable recommendation is worth the contact: NO_ACTION wins. */
  actionThreshold: number;
  /** Data quality below this reduces confidence; below the critical value only NO_ACTION. */
  minDataQuality: number;
  criticalDataQuality: number;
  topN: number;
}

export const DEFAULT_NBA_CONFIG: NbaScoringConfig = {
  weights: { relevance: 0.3, intent: 0.25, expectedImpact: 0.2, timing: 0.15, confidence: 0.1 },
  penalties: {
    fatiguePerContact: 0.05,
    fatigueCap: 0.2,
    unresolvedServiceRisk: 0.15,
    complaintRisk: 0.3,
  },
  actionThreshold: 45,
  minDataQuality: 0.7,
  criticalDataQuality: 0.4,
  topN: 5,
};

/** Half-life (days) of a signal's strength. */
export const SIGNAL_HALF_LIFE_DAYS = 21;

export const PRODUCT_CATALOG: Record<ProductCode, { name: string; category: ProductCategory }> = {
  CONTA_PJ: { name: 'Conta PJ', category: 'CONTA' },
  PIX: { name: 'Pix', category: 'PAGAMENTOS' },
  PIX_COBRANCA: { name: 'Pix Cobrança', category: 'PAGAMENTOS' },
  BOLETO: { name: 'Cobrança por boletos', category: 'PAGAMENTOS' },
  CARTAO_EMPRESARIAL: { name: 'Cartão PJ', category: 'PAGAMENTOS' },
  MAQUININHA: { name: 'Maquininha', category: 'PAGAMENTOS' },
  CAPITAL_DE_GIRO: { name: 'Capital de Giro', category: 'CREDITO' },
  SEGURO: { name: 'Seguro empresarial', category: 'PROTECAO' },
  INVESTIMENTOS: { name: 'Investimentos PJ', category: 'INVESTIMENTO' },
  COBRANCA: { name: 'Cobrança registrada', category: 'PAGAMENTOS' },
  ANTECIPACAO: { name: 'Antecipação de recebíveis', category: 'CREDITO' },
};

export const TOPIC_LABELS: Record<ContentTopic, string> = {
  CAPITAL_DE_GIRO: 'Capital de Giro',
  PIX_COBRANCA: 'Pix Cobrança',
  CARTOES: 'Cartões',
  MAQUININHA: 'Maquininha',
  BOLETO: 'Boleto',
  INVESTIMENTOS: 'Investimentos',
  SEGUROS: 'Seguros',
  FOLHA: 'Folha de pagamento',
  ANTECIPACAO: 'Antecipação',
};

/** Content topics that count as credit interest. */
export const CREDIT_TOPICS: ContentTopic[] = ['CAPITAL_DE_GIRO', 'ANTECIPACAO'];
