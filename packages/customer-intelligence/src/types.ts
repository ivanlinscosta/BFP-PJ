/**
 * Customer Intelligence domain: DATA → FEATURES → SIGNALS → DNA → CANDIDATE ACTIONS →
 * ELIGIBILITY → RANKING → NEXT BEST ACTION → ACTIVATION → OUTCOME → FEEDBACK.
 *
 * Everything here is deterministic and auditable. The LLM only explains structured results.
 */

// ---------------------------------------------------------------------------------------------
// Raw customer data (synthetic in the MVP; business data only, no personal attributes)
// ---------------------------------------------------------------------------------------------

export type CompanySizeBand = 'MEI' | 'Micro' | 'Pequena' | 'Média' | 'Grande';

/** Business identity of a PJ customer (no personal or protected attributes). */
export interface CustomerIdentity {
  customerId: string;
  tradeName: string;
  legalName: string;
  cnpjMasked: string;
  industry: string;
  segment: string;
  companySize: CompanySizeBand;
  state: string;
  city: string;
  region: string;
  status: 'ACTIVE' | 'ONBOARDING' | 'INACTIVE' | 'CHURNED';
  relationshipStartDate: string;
  accountOpenedAt: string | null;
  onboardingCompletedAt: string | null;
  relationshipManager: string | null;
  acquisitionChannel: string;
  acquisitionCampaign: string | null;
}

export const PRODUCT_CODES = [
  'CONTA_PJ',
  'PIX',
  'PIX_COBRANCA',
  'BOLETO',
  'CARTAO_EMPRESARIAL',
  'MAQUININHA',
  'CAPITAL_DE_GIRO',
  'SEGURO',
  'INVESTIMENTOS',
  'COBRANCA',
  'ANTECIPACAO',
] as const;
export type ProductCode = (typeof PRODUCT_CODES)[number];

export type ProductCategory = 'CONTA' | 'PAGAMENTOS' | 'CREDITO' | 'PROTECAO' | 'INVESTIMENTO';

export interface CustomerProduct {
  code: ProductCode;
  contractedAt: string;
  status: 'ACTIVE' | 'IN_USE' | 'CONTRACTED' | 'CANCELLED';
  usageFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'RARE';
  usageVolumeBand: 'LOW' | 'MEDIUM' | 'HIGH';
}

/** Weekly transactional aggregate (amounts in BRL, synthetic). */
export interface TransactionAggregate {
  customerId: string;
  /** Monday of the week (ISO date). */
  date: string;
  inflowAmount: number;
  outflowAmount: number;
  pixInCount: number;
  pixOutCount: number;
  pixVolume: number;
  boletoCount: number;
  boletoVolume: number;
  cardSpend: number;
  paymentsCount: number;
  paymentsVolume: number;
  balanceBand: 'LOW' | 'MEDIUM' | 'HIGH';
}

export type DigitalChannelKind = 'APP' | 'WEB';

export interface DigitalSession {
  customerId: string;
  timestamp: string;
  channel: DigitalChannelKind;
  device: 'IOS' | 'ANDROID' | 'DESKTOP';
  durationSeconds: number;
  pages: number;
  featuresUsed: string[];
  source: string;
}

export const CONTENT_TOPICS = [
  'CAPITAL_DE_GIRO',
  'PIX_COBRANCA',
  'CARTOES',
  'MAQUININHA',
  'BOLETO',
  'INVESTIMENTOS',
  'SEGUROS',
  'FOLHA',
  'ANTECIPACAO',
] as const;
export type ContentTopic = (typeof CONTENT_TOPICS)[number];

export type DigitalEventKind =
  | 'LOGIN'
  | 'PAGE_VIEW'
  | 'SEARCH'
  | 'PRODUCT_VIEW'
  | 'SIMULATION_STARTED'
  | 'SIMULATION_COMPLETED'
  | 'SIMULATION_ABANDONED'
  | 'FEATURE_USED'
  | 'DOWNLOAD'
  | 'CTA_CLICK';

export interface DigitalEvent {
  customerId: string;
  timestamp: string;
  kind: DigitalEventKind;
  channel: DigitalChannelKind;
  topic?: ContentTopic;
  feature?: string;
}

export type InteractionChannel =
  'PHONE' | 'WHATSAPP' | 'EMAIL' | 'BRANCH' | 'CHAT' | 'AI_ASSISTANT';

export interface CrmInteraction {
  id: string;
  customerId: string;
  timestamp: string;
  channel: InteractionChannel;
  subject: string;
  result: string;
  resolved: boolean;
  relationshipManager: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  /** Commercial approach made by the bank (counts for fatigue). */
  commercial: boolean;
  sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}

export interface ServiceCase {
  id: string;
  customerId: string;
  openedAt: string;
  kind: 'COMPLAINT' | 'QUESTION' | 'PROBLEM';
  severity: 'LOW' | 'MEDIUM' | 'CRITICAL';
  subject: string;
  resolved: boolean;
  resolvedAt: string | null;
}

/** Everything the intelligence pipeline reads about one customer. */
export interface CustomerRawData {
  identity: CustomerIdentity;
  consent: { commercialContact: boolean; digitalCommunication: boolean };
  products: CustomerProduct[];
  transactions: TransactionAggregate[];
  sessions: DigitalSession[];
  events: DigitalEvent[];
  interactions: CrmInteraction[];
  serviceCases: ServiceCase[];
  outcomes: RecommendationOutcome[];
  /** Acquisition and lifecycle milestones (media, site, lead, opening, account, onboarding). */
  milestones: JourneyEvent[];
  /** Fraction of expected sources that delivered data (0–1). */
  sourceCoverage: number;
}

// ---------------------------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------------------------

export interface CustomerFeatureSet {
  customer_id: string;
  as_of: string;
  relationship_tenure_days: number;
  account_age_days: number;
  onboarding_completed: boolean;
  has_relationship_manager: boolean;
  products_count: number;
  active_products_count: number;
  active_products_ratio: number;
  product_categories_count: number;
  new_products_90d: number;
  owned_products: ProductCode[];
  relevant_gaps: number;
  avg_monthly_transaction_volume: number;
  transaction_volume_30d: number;
  transaction_volume_prev_30d: number;
  transaction_volume_60d: number;
  transaction_volume_prev_60d: number;
  transaction_volume_change_30d: number;
  transaction_volume_change_60d: number;
  inflow_30d: number;
  inflow_change_60d: number;
  outflow_30d: number;
  pix_tx_count_30d: number;
  pix_volume_30d: number;
  pix_share_30d: number;
  boleto_count_30d: number;
  card_volume_30d: number;
  card_volume_prev_30d: number;
  card_volume_change_30d: number;
  payments_volume_60d: number;
  payments_volume_prev_60d: number;
  payments_volume_change_60d: number;
  transactions_count_30d: number;
  payment_means_used: number;
  digital_sessions_30d: number;
  digital_sessions_prev_30d: number;
  digital_sessions_change_30d: number;
  digital_active_days_30d: number;
  mobile_sessions_30d: number;
  web_sessions_30d: number;
  channel_mix: number;
  logins_30d: number;
  features_used_30d: number;
  credit_page_views_14d: number;
  credit_page_views_prev_14d: number;
  credit_searches_14d: number;
  credit_simulations_30d: number;
  working_capital_simulations_30d: number;
  abandoned_credit_journeys_30d: number;
  product_views_30d: number;
  product_interest_30d: Partial<Record<ContentTopic, number>>;
  crm_interactions_30d: number;
  crm_interactions_90d: number;
  commercial_contacts_30d: number;
  complaints_30d: number;
  critical_complaints_30d: number;
  unresolved_interactions_30d: number;
  days_since_last_contact: number;
  days_since_last_login: number;
  days_since_last_transaction: number;
  commercial_contact_allowed: boolean;
  data_quality: number;
}

// ---------------------------------------------------------------------------------------------
// DNA
// ---------------------------------------------------------------------------------------------

export const DNA_DIMENSIONS = [
  'relationshipStrength',
  'digitalEngagement',
  'productDepth',
  'transactionActivity',
  'businessMomentum',
  'commercialIntent',
] as const;
export type DnaDimensionId = (typeof DNA_DIMENSIONS)[number];

export type DnaLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type DnaTrend = 'DOWN' | 'STABLE' | 'UP';

export interface DnaDriver {
  id: string;
  name: string;
  value: number | string | boolean;
  contribution?: number;
  direction?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  source: string;
  period?: string;
}

export interface DnaDimension {
  score: number;
  level: DnaLevel;
  trend: DnaTrend;
  drivers: DnaDriver[];
}

export interface CustomerDNA {
  customerId: string;
  calculatedAt: string;
  version: string;
  relationshipStrength: DnaDimension;
  digitalEngagement: DnaDimension;
  productDepth: DnaDimension;
  transactionActivity: DnaDimension;
  businessMomentum: DnaDimension;
  commercialIntent: DnaDimension;
  overallSummary: string;
}

// ---------------------------------------------------------------------------------------------
// Signals and changes
// ---------------------------------------------------------------------------------------------

export const SIGNAL_CATEGORIES = [
  'INTENT',
  'GROWTH',
  'ENGAGEMENT',
  'PRODUCT_GAP',
  'RELATIONSHIP',
  'RISK',
  'JOURNEY',
  'TRANSACTION',
  'DIGITAL',
] as const;
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export interface SignalEvidence {
  feature: string;
  value: number | string | boolean;
  source: string;
  period?: string;
}

export interface CustomerSignal {
  id: string;
  customerId: string;
  type: string;
  category: SignalCategory;
  title: string;
  description: string;
  value?: number | string;
  /** 0–1 after temporal decay. */
  strength: number;
  detectedAt: string;
  expiresAt?: string;
  source: string;
  evidence: SignalEvidence[];
  /** "Oportunidade identificada" (opportunity) or "Sinal observado" (observation). */
  kind: 'OPPORTUNITY' | 'OBSERVATION' | 'RISK';
  /** DNA dimension the signal feeds. */
  dnaDimension?: DnaDimensionId;
  /** How the signal affects the next best action (filled after ranking). */
  nbaImpact?: string;
}

export interface CustomerChange {
  metric: string;
  label: string;
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  percentageChange: number | null;
  direction: 'UP' | 'DOWN' | 'FLAT';
  relevance: number;
  window: string;
  unit: 'BRL' | 'COUNT' | 'PERCENT';
  display: 'PERCENT' | 'ABSOLUTE';
}

// ---------------------------------------------------------------------------------------------
// Actions, eligibility, recommendations, outcomes
// ---------------------------------------------------------------------------------------------

export type ActionCategory =
  'CREDIT' | 'PAYMENTS' | 'PROTECTION' | 'SERVICE' | 'ENGAGEMENT' | 'NONE';
export type ActionObjective =
  'EXPANSION' | 'ACTIVATION' | 'RETENTION' | 'SERVICE_RECOVERY' | 'EDUCATION' | 'RESTRAINT';
export type ActionChannel = 'RELATIONSHIP_MANAGER' | 'WHATSAPP' | 'APP' | 'EMAIL' | 'PHONE';

export type EligibilityRuleId =
  | 'productAlreadyOwned'
  | 'customerStatus'
  | 'contactability'
  | 'consent'
  | 'cooldown'
  | 'recentComplaint'
  | 'journeyState'
  | 'actionEnabled'
  | 'commercialPolicy'
  | 'outstandingInteraction';

export interface EligibilityRule {
  id: EligibilityRuleId;
  /** Product whose ownership blocks the action (productAlreadyOwned). */
  product?: ProductCode;
}

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  category: ActionCategory;
  objective: ActionObjective;
  supportedChannels: ActionChannel[];
  eligibilityRules: EligibilityRule[];
  relevantSignals: string[];
  cooldownDays?: number;
  active: boolean;
  /** True for commercial offers (subject to fatigue/complaint penalties). */
  commercial: boolean;
}

export interface EligibilityCheck {
  rule: EligibilityRuleId;
  passed: boolean;
  reason: string;
}

export interface EligibilityResult {
  eligible: boolean;
  checks: EligibilityCheck[];
}

export interface RecommendationEvidence {
  signalType: string;
  title: string;
  value?: number | string;
  strength: number;
  source: string;
  detectedAt: string;
}

export interface NbaComponents {
  relevance: number;
  intent: number;
  expectedImpact: number;
  timing: number;
  confidence: number;
}

export interface NextBestActionRecommendation {
  id: string;
  customerId: string;
  actionId: string;
  actionName: string;
  rank: number;
  score: number;
  objective: string;
  confidence: number;
  recommendedChannel: string;
  recommendedWindow?: { type: 'NOW' | 'NEXT_DAYS' | 'NEXT_WEEK'; days?: number };
  components: NbaComponents;
  penalties: { fatigue: number; risk: number };
  evidence: RecommendationEvidence[];
  reasonCodes: string[];
  eligibility: EligibilityResult;
  calculatedAt: string;
  modelVersion: string;
}

export const OUTCOME_STATUSES = [
  'RECOMMENDED',
  'VIEWED',
  'ACCEPTED',
  'DISMISSED',
  'ACTIVATED',
  'CONVERTED',
  'FAILED',
  'NO_RESPONSE',
] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export interface RecommendationOutcome {
  recommendationId: string;
  customerId: string;
  actionId: string;
  status: OutcomeStatus;
  timestamp: string;
  channel?: string;
  value?: number;
  reason?: string;
  actor?: string;
}

// ---------------------------------------------------------------------------------------------
// Profile read model and clusters
// ---------------------------------------------------------------------------------------------

export interface JourneyEvent {
  date: string;
  title: string;
  source: string;
  kind:
    | 'MEDIA'
    | 'DIGITAL'
    | 'LEAD'
    | 'OPENING'
    | 'ACCOUNT'
    | 'ONBOARDING'
    | 'TRANSACTION'
    | 'PRODUCT'
    | 'CRM'
    | 'SERVICE';
}

/** Data behind the profile tabs, pre-aggregated by the rebuild (no per-request heavy queries). */
export interface CustomerProfileTabs {
  journey: JourneyEvent[];
  products: Array<{
    code: ProductCode;
    name: string;
    status: CustomerProduct['status'];
    contractedAt: string;
    usageFrequency: CustomerProduct['usageFrequency'];
    usageVolumeBand: CustomerProduct['usageVolumeBand'];
    trend?: { label: string; change: number };
  }>;
  transactions: {
    weekly: Array<{ weekStart: string; volume: number; index: number }>;
    monthly: Array<{
      month: string;
      inflow: number;
      outflow: number;
      pixVolume: number;
      boletoVolume: number;
      cardSpend: number;
    }>;
    flows: Array<{ label: string; band: string; trend: string }>;
    means: Array<{ label: string; band: string; trend: string }>;
  };
  digital: {
    sessions30d: number;
    sessionsPrev30d: number;
    activeDays30d: number;
    appShare: number;
    preferredChannel: string;
    topics: Array<{
      topic: ContentTopic;
      label: string;
      visits: number;
      window: string;
      lastVisit: string;
    }>;
    features: Array<{ feature: string; count: number }>;
    abandonedJourneys: Array<{ topic: ContentTopic; label: string; at: string }>;
    simulations: Array<{ topic: ContentTopic; label: string; at: string; completed: boolean }>;
  };
  interactions: Array<{
    id: string;
    timestamp: string;
    channel: InteractionChannel;
    subject: string;
    result: string;
    resolved: boolean;
    sentiment?: CrmInteraction['sentiment'];
    responsible: string | null;
  }>;
  serviceCases: ServiceCase[];
}

export interface CustomerIntelligenceProfile {
  customerId: string;
  identity: CustomerIdentity;
  tenureMonths: number;
  dna: CustomerDNA;
  changes: CustomerChange[];
  signals: CustomerSignal[];
  recommendations: NextBestActionRecommendation[];
  /** How the reading moved vs. 30 days ago (DNA intent level and #1 action rank). */
  readingShift: {
    intentLevel: { previous: DnaLevel; current: DnaLevel };
    topAction: {
      actionId: string;
      actionName: string;
      previousRank: number | null;
      currentRank: number;
    };
  };
  tabs: CustomerProfileTabs;
  similar: { count: number; customerIds: string[] };
  dataQuality: { score: number; freshness: string };
  updatedAt: string;
  dnaVersion: string;
  modelVersion: string;
}

export interface AggregateDNA {
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  levels: Record<DnaLevel, number>;
}

export interface ClusterSignal {
  type: string;
  title: string;
  customers: number;
  share: number;
}

export interface ClusterActionDistribution {
  actionId: string;
  actionName: string;
  customers: number;
  share: number;
  avgScore: number;
}

export interface ClusterDNA {
  populationSize: number;
  dimensions: Record<DnaDimensionId, AggregateDNA>;
  dominantSignals: ClusterSignal[];
  nextBestActions: ClusterActionDistribution[];
  opportunitySummary: string;
}
