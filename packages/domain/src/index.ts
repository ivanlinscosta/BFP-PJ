/**
 * Shared domain contracts used by both frontend and backend.
 */

/** Available application roles. */
export const USER_ROLES = ['admin', 'analyst', 'business'] as const;

/** Available application roles. */
export type UserRole = (typeof USER_ROLES)[number];

/** Business domains used for RBAC and semantic access control. */
export const BUSINESS_DOMAINS = ['media', 'acquisition', 'customer360', 'products'] as const;

/** Business domains used for RBAC and semantic access control. */
export type BusinessDomain = (typeof BUSINESS_DOMAINS)[number];

/** Company size buckets used by the synthetic PJ dataset. */
export const COMPANY_SIZES = ['MEI', 'Micro', 'Pequena', 'Média', 'Grande'] as const;

/** Company size buckets used by the synthetic PJ dataset. */
export type CompanySize = (typeof COMPANY_SIZES)[number];

/** Lifecycle states for a company inside the acquisition funnel. */
export const COMPANY_STATUSES = [
  'LEAD',
  'ACCOUNT_OPENING',
  'ONBOARDING',
  'ACTIVE',
  'INACTIVE',
] as const;

/** Lifecycle states for a company inside the acquisition funnel. */
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** Coarse employee-count ranges for categorical analysis. */
export const EMPLOYEE_COUNT_RANGES = ['1-5', '6-10', '11-50', '51-200', '201-500', '500+'] as const;

/** Coarse employee-count ranges for categorical analysis. */
export type EmployeeCountRange = (typeof EMPLOYEE_COUNT_RANGES)[number];

/** Revenue ranges used to simulate PJ annual revenue. */
export const ANNUAL_REVENUE_RANGES = [
  'ATE_360K',
  '360K_A_4_8M',
  '4_8M_A_50M',
  '50M_A_300M',
  'ACIMA_300M',
] as const;

/** Revenue ranges used to simulate PJ annual revenue. */
export type AnnualRevenueRange = (typeof ANNUAL_REVENUE_RANGES)[number];

/** Lead-source buckets used to attribute acquisition. */
export const ACQUISITION_SOURCES = ['PAID', 'ORGANIC', 'REFERRAL', 'PARTNER', 'OUTBOUND'] as const;

/** Lead-source buckets used to attribute acquisition. */
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

/** Acquisition channels used by the MVP metrics and stories. */
export const ACQUISITION_CHANNELS = [
  'GOOGLE_SEARCH',
  'LINKEDIN',
  'META',
  'ORGANIC',
  'REFERRAL',
  'EMAIL',
  'INSIDE_SALES',
] as const;

/** Acquisition channels used by the MVP metrics and stories. */
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

/** Coarse risk segmentation for synthetic companies. */
export const RISK_PROFILES = ['LOW', 'MEDIUM', 'HIGH'] as const;

/** Coarse risk segmentation for synthetic companies. */
export type RiskProfile = (typeof RISK_PROFILES)[number];

/** Partner roles associated with a PJ account. */
export const PARTNER_ROLES = [
  'OWNER',
  'LEGAL_REPRESENTATIVE',
  'ADMINISTRATOR',
  'FINANCE',
  'OPERATIONS',
] as const;

/** Partner roles associated with a PJ account. */
export type PartnerRole = (typeof PARTNER_ROLES)[number];

/** Synthetic partner age ranges for segmentation. */
export const AGE_RANGES = ['18-25', '26-35', '36-45', '46-60', '60+'] as const;

/** Synthetic partner age ranges for segmentation. */
export type AgeRange = (typeof AGE_RANGES)[number];

/** Account types available in the synthetic banking product set. */
export const ACCOUNT_TYPES = ['CHECKING', 'PAYMENT', 'DIGITAL_WALLET'] as const;

/** Account types available in the synthetic banking product set. */
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Account lifecycle states. */
export const ACCOUNT_STATUSES = ['PENDING', 'OPEN', 'BLOCKED', 'CLOSED'] as const;

/** Account lifecycle states. */
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Product groupings used by the semantic catalog. */
export const PRODUCT_CATEGORIES = [
  'BANKING',
  'CREDIT',
  'PAYMENTS',
  'INSURANCE',
  'BENEFITS',
] as const;

/** Product groupings used by the semantic catalog. */
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Product availability state. */
export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/** Product availability state. */
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Contract states for a product held by a company. */
export const COMPANY_PRODUCT_STATUSES = ['CONTRACTED', 'ACTIVE', 'CANCELLED'] as const;

/** Contract states for a product held by a company. */
export type CompanyProductStatus = (typeof COMPANY_PRODUCT_STATUSES)[number];

/** Marketing channels for campaigns. */
export const CAMPAIGN_CHANNELS = ['GOOGLE_SEARCH', 'LINKEDIN', 'META', 'ORGANIC', 'EMAIL'] as const;

/** Marketing channels for campaigns. */
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/** Campaign source buckets. */
export const CAMPAIGN_SOURCES = ['PAID', 'ORGANIC', 'OWNED'] as const;

/** Campaign source buckets. */
export type CampaignSource = (typeof CAMPAIGN_SOURCES)[number];

/** Campaign objectives supported by the MVP. */
export const CAMPAIGN_OBJECTIVES = ['LEAD_GENERATION', 'AWARENESS', 'RETARGETING'] as const;

/** Campaign objectives supported by the MVP. */
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

/** Campaign lifecycle states. */
export const CAMPAIGN_STATUSES = ['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED'] as const;

/** Campaign lifecycle states. */
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Media touchpoint events used to narrate acquisition. */
export const TOUCHPOINT_TYPES = [
  'IMPRESSION',
  'CLICK',
  'LANDING_PAGE_VISIT',
  'FORM_SUBMIT',
] as const;

/** Media touchpoint events used to narrate acquisition. */
export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number];

/** Funnel steps recorded by the acquisition and activation journey. */
export const FUNNEL_EVENT_TYPES = [
  'LEAD_CREATED',
  'QUALIFIED',
  'ACCOUNT_OPENING_STARTED',
  'ACCOUNT_OPENED',
  'ONBOARDING_STARTED',
  'ONBOARDING_COMPLETED',
  'ACTIVATED',
  'CHURNED',
] as const;

/** Funnel steps recorded by the acquisition and activation journey. */
export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

/** CRM interaction channels. */
export const CRM_INTERACTION_TYPES = ['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'TASK'] as const;

/** CRM interaction channels. */
export type CRMInteractionType = (typeof CRM_INTERACTION_TYPES)[number];

/** Direction of a CRM interaction. */
export const CRM_INTERACTION_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;

/** Direction of a CRM interaction. */
export type CRMInteractionDirection = (typeof CRM_INTERACTION_DIRECTIONS)[number];

/** Outcome of a CRM interaction. */
export const CRM_INTERACTION_OUTCOMES = [
  'CONNECTED',
  'NO_ANSWER',
  'FOLLOW_UP',
  'RESOLVED',
  'OPEN',
] as const;

/** Outcome of a CRM interaction. */
export type CRMInteractionOutcome = (typeof CRM_INTERACTION_OUTCOMES)[number];

/** Supported conversation channels. */
export const CONVERSATION_CHANNELS = ['WHATSAPP', 'CHAT', 'EMAIL', 'PHONE'] as const;

/** Supported conversation channels. */
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

/** Conversation lifecycle states. */
export const CONVERSATION_STATUSES = ['OPEN', 'RESOLVED', 'ESCALATED'] as const;

/** Conversation lifecycle states. */
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Product-usage events captured in the digital journey. */
export const DIGITAL_EVENT_TYPES = [
  'LOGIN',
  'FEATURE_USE',
  'TRANSACTION',
  'ERROR',
  'DOCUMENT_UPLOAD',
] as const;

/** Product-usage events captured in the digital journey. */
export type DigitalEventType = (typeof DIGITAL_EVENT_TYPES)[number];

/**
 * Access channels of the customer (how the company reaches the bank): App Itaú Empresas, Bankline
 * (internet banking), Agência/gerente or API. One vocabulary for navigation, product contracting
 * and transactions. Media channels (Google, Meta…) are a different concept: AcquisitionChannel.
 */
export const ACCESS_CHANNELS = ['APP', 'BANKLINE', 'AGENCIA', 'API'] as const;

/** Access channel of the customer (see ACCESS_CHANNELS). */
export type AccessChannel = (typeof ACCESS_CHANNELS)[number];

/** Digital access channels where navigation happens (App and Bankline). */
export const DIGITAL_ACCESS_CHANNELS = ['APP', 'BANKLINE'] as const;

/** Digital access channel where navigation happens. */
export type DigitalAccessChannel = (typeof DIGITAL_ACCESS_CHANNELS)[number];

/** Channels used by digital product events (FullStory): Bankline/site, App or API. */
export const DIGITAL_CHANNELS = ['BANKLINE', 'APP', 'API'] as const;

/** Channels used by digital product events. */
export type DigitalChannel = (typeof DIGITAL_CHANNELS)[number];

/** Screens of the Itaú Empresas app tracked in the navigation telemetry. */
export const APP_SCREENS = [
  'HOME',
  'EXTRATO',
  'PIX',
  'BOLETOS',
  'CARTOES',
  'INVESTIMENTOS',
  'CREDITO',
  'FOLHA_PAGAMENTO',
  'MAQUININHA',
  'PERFIL',
] as const;

/** Screens of the Itaú Empresas app tracked in the navigation telemetry. */
export type AppScreen = (typeof APP_SCREENS)[number];

/** Interaction recorded on an app screen. */
export const APP_ACTIONS = ['VIEW', 'CLICK', 'COMPLETE', 'ABANDON', 'ERROR'] as const;

/** Interaction recorded on an app screen. */
export type AppAction = (typeof APP_ACTIONS)[number];

/** Device platform of a navigation event: the app on iOS/Android or Bankline on the web. */
export const APP_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;

/** Device platform of a navigation event. */
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** Business transaction types moved by PJ customers. */
export const TRANSACTION_TYPES = [
  'PIX_IN',
  'PIX_OUT',
  'BOLETO_ISSUED',
  'BOLETO_PAID',
  'TED',
  'CARD_PURCHASE',
] as const;

/** Business transaction types moved by PJ customers. */
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Access channel where a transaction was initiated (same vocabulary as ACCESS_CHANNELS). */
export const TRANSACTION_CHANNELS = ACCESS_CHANNELS;

/** Channel where a transaction was initiated. */
export type TransactionChannel = (typeof TRANSACTION_CHANNELS)[number];

/** Moment of the relationship where an NPS survey is sent. */
export const NPS_TOUCHPOINTS = ['ONBOARDING', 'APP', 'SERVICE', 'RELATIONSHIP_MANAGER'] as const;

/** Moment of the relationship where an NPS survey is sent. */
export type NpsTouchpoint = (typeof NPS_TOUCHPOINTS)[number];

/** Dataset entity kinds stored in the dataset table. */
export const DATASET_ENTITY_TYPES = [
  'company',
  'partner',
  'account',
  'product',
  'companyProduct',
  'campaign',
  'touchpoint',
  'funnelEvent',
  'crmInteraction',
  'conversation',
  'digitalEvent',
  'appNavigation',
  'transaction',
  'npsResponse',
  'customerIntelligence',
  'qualityStatus',
  'auditLog',
] as const;

/** Dataset entity kinds stored in the dataset table. */
export type DatasetEntityType = (typeof DATASET_ENTITY_TYPES)[number];

/** Persisted user object kinds stored in the objects table. */
export const OBJECT_TYPES = [
  'analysis',
  'dashboard',
  'audience',
  'activationJob',
  'favorite',
  'aiConversation',
  'aiStudy',
  'savedStudy',
  'preference',
] as const;

/** Persisted user object kinds stored in the objects table. */
export type ObjectType = (typeof OBJECT_TYPES)[number];

/** Supported date granularities for grouped dimensions. */
export const DATE_GRANULARITIES = ['date', 'week', 'month'] as const;

/** Supported date granularities for grouped dimensions. */
export type DateGranularity = (typeof DATE_GRANULARITIES)[number];

/** Filter operators supported by the AnalysisSpec contract. */
export const FILTER_OPERATORS = [
  'EQ',
  'NEQ',
  'IN',
  'NOT_IN',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'BETWEEN',
  'CONTAINS',
  'IS_NULL',
  'IS_NOT_NULL',
] as const;

/** Filter operators supported by the AnalysisSpec contract. */
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Preset and custom date-range modes. */
export const DATE_RANGE_TYPES = [
  'TODAY',
  'YESTERDAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'LAST_90_DAYS',
  'LAST_120_DAYS',
  'LAST_N_DAYS',
  'THIS_MONTH',
  'LAST_MONTH',
  'THIS_QUARTER',
  'LAST_QUARTER',
  'THIS_YEAR',
  'LAST_YEAR',
  'CUSTOM',
  'ALL_TIME',
] as const;

/** Preset and custom date-range modes. */
export type DateRangeType = (typeof DATE_RANGE_TYPES)[number];

/** Comparison modes applied after the base aggregation. */
export const COMPARISON_TYPES = ['NONE', 'PREVIOUS_PERIOD'] as const;

/** Comparison modes applied after the base aggregation. */
export type ComparisonType = (typeof COMPARISON_TYPES)[number];

/** Sort directions supported by the query engine. */
export const SORT_DIRECTIONS = ['ASC', 'DESC'] as const;

/** Sort directions supported by the query engine. */
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Visualization modes available in the playground and dashboards. */
export const VISUALIZATION_TYPES = [
  'AUTO',
  'TABLE',
  'KPI',
  'BAR_HORIZONTAL',
  'COLUMN',
  'BAR_GROUPED',
  'COLUMN_GROUPED',
  'BAR_STACKED',
  'COLUMN_STACKED',
  'BAR_100_STACKED',
  'COLUMN_100_STACKED',
  'LINE',
  'MULTI_LINE',
  'AREA',
  'AREA_STACKED',
  'DONUT',
  'TREEMAP',
  'HEATMAP',
  'CALENDAR_HEATMAP',
  'FUNNEL',
  'SANKEY',
  'WATERFALL',
  'SCATTER',
  'BUBBLE',
  'HISTOGRAM',
  'BOX_PLOT',
  'COHORT',
  'RETENTION_CURVE',
  'MAP',
  'RADAR',
  'QUADRANT',
  'TIMELINE',
  'RANKING',
  // Legacy values kept so saved analyses keep opening (normalized by @bfp/shared).
  'BAR',
  'GROUPED_BAR',
  'STACKED_BAR',
] as const;

/** Supported visualization types for the playground. */
export type VisualizationType = (typeof VISUALIZATION_TYPES)[number];

/** Metric aggregations supported by the semantic layer. */
export const AGGREGATION_TYPES = ['SUM', 'COUNT', 'COUNT_DISTINCT', 'AVG', 'RATIO'] as const;

/** Metric aggregations supported by the semantic layer. */
export type AggregationType = (typeof AGGREGATION_TYPES)[number];

/** Formatting hints used by metrics and result columns. */
export const METRIC_FORMATS = ['number', 'currency', 'percent'] as const;

/** Formatting hints used by metrics and result columns. */
export type MetricFormat = (typeof METRIC_FORMATS)[number];

/** Semantic certification status. */
export const CERTIFICATION_STATUSES = ['CERTIFIED', 'EXPERIMENTAL', 'DEPRECATED'] as const;

/** Semantic certification status. */
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

/** Additivity modes for metrics. */
export const METRIC_ADDITIVITY = ['ADDITIVE', 'NON_ADDITIVE'] as const;

/** Additivity modes for metrics. */
export type MetricAdditivity = (typeof METRIC_ADDITIVITY)[number];

/** Dimension value types. */
export const DIMENSION_VALUE_TYPES = ['string', 'number', 'date', 'boolean', 'enum'] as const;

/** Dimension value types. */
export type DimensionValueType = (typeof DIMENSION_VALUE_TYPES)[number];

/** Sensitivity labels applied to dimensions and glossary terms. */
export const DATA_SENSITIVITY_LEVELS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PII'] as const;

/** Sensitivity labels applied to dimensions and glossary terms. */
export type DataSensitivityLevel = (typeof DATA_SENSITIVITY_LEVELS)[number];

/** Quality health states. */
export const QUALITY_HEALTH_STATES = ['HEALTHY', 'WARNING', 'CRITICAL'] as const;

/** Quality health states. */
export type QualityHealthState = (typeof QUALITY_HEALTH_STATES)[number];

/** Incident severities used by quality monitoring. */
export const INCIDENT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Incident severities used by quality monitoring. */
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

/** Incident lifecycle states. */
export const INCIDENT_STATUSES = ['OPEN', 'MITIGATED', 'RESOLVED'] as const;

/** Incident lifecycle states. */
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Audit execution status. */
export const AUDIT_LOG_STATUSES = ['SUCCESS', 'ERROR'] as const;

/** Audit execution status. */
export type AuditLogStatus = (typeof AUDIT_LOG_STATUSES)[number];

/** Dashboard card layout formats. */
export const DASHBOARD_LAYOUT_MODES = ['GRID'] as const;

/** Dashboard card layout formats. */
export type DashboardLayoutMode = (typeof DASHBOARD_LAYOUT_MODES)[number];

/** Audience lifecycle states. */
export const AUDIENCE_STATUSES = ['DRAFT', 'READY', 'ACTIVATED'] as const;

/** Audience lifecycle states. */
export type AudienceStatus = (typeof AUDIENCE_STATUSES)[number];

/** Column kinds returned by analytics queries. */
export const COLUMN_TYPES = ['metric', 'dimension'] as const;

/** Column kinds returned by analytics queries. */
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Semantic roles for analytics result columns. */
export const COLUMN_ROLES = [
  'value',
  'comparison',
  'category',
  'series',
  'time',
  'detail',
] as const;

/** Semantic roles for analytics result columns. */
export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** Formatting hints for analytics result columns. */
export const COLUMN_FORMATS = [
  'number',
  'currency',
  'percent',
  'text',
  'date',
  'datetime',
  'boolean',
] as const;

/** Formatting hints for analytics result columns. */
export type ColumnFormat = (typeof COLUMN_FORMATS)[number];

/** Primitive scalar values accepted by filter expressions. */
export type ScalarFilterValue = string | number | boolean;

/** List values accepted by set-based filter expressions. */
export type FilterListValue = ReadonlyArray<ScalarFilterValue>;

/** Range values accepted by between filter expressions. */
export type FilterRangeValue = readonly [ScalarFilterValue, ScalarFilterValue];

/** Minimal user record used by dev-mode authentication. */
export interface DemoUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  team: string;
}

/** The fixed local-development password documented by FASE 1. */
export const DEMO_PASSWORD = 'demo-password-123';

/** The fixed local-development users documented by FASE 1. */
export const DEMO_USERS: DemoUser[] = [
  {
    id: 'usr-admin',
    email: 'admin@example.local',
    role: 'admin',
    name: 'Camila Rocha',
    team: 'Clientes PJ',
  },
  {
    id: 'usr-analyst',
    email: 'analyst@example.local',
    role: 'analyst',
    name: 'Mariana Souza',
    team: 'Growth PJ',
  },
  {
    id: 'usr-business',
    email: 'business@example.local',
    role: 'business',
    name: 'Rafael Lima',
    team: 'Onboarding PJ',
  },
];

/** Sharing levels applied to saved analyses and dashboards. */
export const SHARING_LEVELS = ['PRIVATE', 'TEAM', 'READ_ONLY'] as const;

/** Sharing levels applied to saved analyses and dashboards. */
export type SharingLevel = (typeof SHARING_LEVELS)[number];

/** Ownership and sharing metadata persisted with user-created objects. */
export interface SharingMetadata {
  visibility: SharingLevel;
  ownerName?: string;
  team?: string;
}

/** Core company entity and main grain for most business metrics. */
export interface Company {
  id: string;
  cnpjMasked: string;
  legalName: string;
  tradeName: string;
  segment: string;
  industry: string;
  companySize: CompanySize;
  state: string;
  city: string;
  region: string;
  employeeCountRange: EmployeeCountRange;
  annualRevenueRange: AnnualRevenueRange;
  acquisitionSource: AcquisitionSource;
  acquisitionChannel: AcquisitionChannel;
  /**
   * Access channel the company uses most to navigate (App or Bankline), derived from the
   * navigation telemetry; null when the company has no digital navigation.
   */
  primaryAccessChannel?: DigitalAccessChannel | null;
  acquisitionCampaignId: string | null;
  leadCreatedAt: string;
  accountOpeningStartedAt: string | null;
  accountOpenedAt: string | null;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  activationDate: string | null;
  status: CompanyStatus;
  relationshipManagerId: string | null;
  lgpdConsent: boolean;
  riskProfile: RiskProfile;
  createdAt: string;
}

/** Partner or stakeholder associated with a PJ company. */
export interface Partner {
  id: string;
  companyId: string;
  name: string;
  role: PartnerRole;
  ownershipPercentage: number;
  ageRange: AgeRange;
  state: string;
  joinedAt: string;
}

/** Financial account owned by a company. */
export interface Account {
  id: string;
  companyId: string;
  provider: string;
  type: AccountType;
  status: AccountStatus;
  accountNumberMasked: string;
  openedAt: string;
  createdAt: string;
  closedAt: string | null;
}

/** Product definition available in the platform catalog. */
export interface Product {
  id: string;
  name: string;
  shortName: string;
  category: ProductCategory;
  status: ProductStatus;
  monthlyBasePrice: number;
  isCoreProduct: boolean;
  createdAt: string;
}

/** Product contracted by a specific company. */
export interface CompanyProduct {
  id: string;
  companyId: string;
  productId: string;
  status: CompanyProductStatus;
  /** Access channel where the product was contracted (App, Bankline, Agência or API). */
  contractChannel: AccessChannel;
  contractedAt: string;
  activatedAt: string | null;
  cancelledAt: string | null;
  monthlyRevenueProxy: number;
}

/** Marketing campaign metadata. */
export interface MediaCampaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  source: CampaignSource;
  objective: CampaignObjective;
  budget: number;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
}

/** Company-level media touchpoint used to narrate the acquisition timeline. */
export interface MediaTouchpoint {
  id: string;
  companyId: string;
  campaignId: string | null;
  channel: CampaignChannel;
  touchpointType: TouchpointType;
  occurredAt: string;
  cost: number;
  impressions: number;
  clicks: number;
}

/** Funnel event emitted as a company advances through the commercial journey. */
export interface FunnelEvent {
  id: string;
  companyId: string;
  eventType: FunnelEventType;
  occurredAt: string;
  sourceChannel: AcquisitionChannel;
  campaignId: string | null;
}

/** Logged CRM interaction performed by a human or assisted workflow. */
export interface CRMInteraction {
  id: string;
  companyId: string;
  interactionType: CRMInteractionType;
  direction: CRMInteractionDirection;
  outcome: CRMInteractionOutcome;
  occurredAt: string;
  ownerId: string;
  relatedConversationId: string | null;
}

/** Customer-service or commercial conversation attached to a company journey. */
export interface Conversation {
  id: string;
  companyId: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  subject: string;
  startedAt: string;
  resolvedAt: string | null;
  ownerId: string;
  messageCount: number;
}

/** Product-usage event emitted by a company in digital channels. */
export interface DigitalEvent {
  id: string;
  companyId: string;
  eventType: DigitalEventType;
  channel: DigitalChannel;
  productId: string | null;
  occurredAt: string;
  sessionId: string;
  value: number | null;
}

/** Navigation event of a company user in the digital channels (App Itaú Empresas or Bankline). */
export interface AppNavigationEvent {
  id: string;
  companyId: string;
  sessionId: string;
  /** Digital access channel of the session: App Itaú Empresas or Bankline. */
  accessChannel: DigitalAccessChannel;
  screen: AppScreen;
  action: AppAction;
  platform: AppPlatform;
  appVersion: string;
  durationSeconds: number;
  occurredAt: string;
}

/** Financial transaction moved by a company (aggregated amounts, no counterpart data). */
export interface Transaction {
  id: string;
  companyId: string;
  transactionType: TransactionType;
  channel: TransactionChannel;
  amount: number;
  occurredAt: string;
}

/** NPS survey answer of a company (score only; no free text). */
export interface NpsResponse {
  id: string;
  companyId: string;
  touchpoint: NpsTouchpoint;
  score: number;
  respondedAt: string;
}

/**
 * Materialized Customer Intelligence of a company (Customer DNA + next best action #1).
 * Scores are computed by the deterministic pipeline (packages/customer-intelligence).
 */
export interface CustomerIntelligenceSnapshot {
  id: string;
  companyId: string;
  calculatedAt: string;
  nbaActionId: string;
  nbaScore: number;
  nbaConfidence: number;
  primarySignal: string | null;
  signalCount: number;
  dnaDigitalEngagement: number;
  dnaProductDepth: number;
  dnaRelationshipStrength: number;
  dnaCommercialIntent: number;
  dnaBusinessMomentum: number;
  dnaTransactionActivity: number;
  commercialIntentLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  digitalEngagementLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  dnaVersion: string;
  modelVersion: string;
}

/** Single quality incident attached to a monitored scope. */
export interface Incident {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  detectedAt: string;
  resolvedAt: string | null;
}

/** Aggregated quality health for a dataset scope or data product. */
export interface QualityStatus {
  id: string;
  companyId: string | null;
  scopeType: DatasetEntityType | 'dataProduct' | 'semanticCatalog';
  scopeId: string;
  status: QualityHealthState;
  score: number;
  checkedAt: string;
  summary: string;
  incidents: Incident[];
}

/** Audit record emitted for an analytics execution. */
export interface AuditLogEntry {
  id: string;
  queryId: string;
  userId: string;
  companyId: string | null;
  timestamp: string;
  metrics: string[];
  dimensions: string[];
  filters: FilterCondition[];
  executionMs: number;
  status: AuditLogStatus;
  errorMessage?: string;
}

/** Any entity stored in the dataset table. */
export type DatasetEntity =
  | Company
  | Partner
  | Account
  | Product
  | CompanyProduct
  | MediaCampaign
  | MediaTouchpoint
  | FunnelEvent
  | CRMInteraction
  | Conversation
  | DigitalEvent
  | AppNavigationEvent
  | Transaction
  | NpsResponse
  | CustomerIntelligenceSnapshot
  | QualityStatus
  | AuditLogEntry;

/** Metric requested by an analysis. */
export interface MetricSelection {
  id: string;
  alias?: string;
}

/** Dimension requested by an analysis. */
export interface DimensionSelection {
  id: string;
  granularity?: DateGranularity;
}

/** Filter that compares a field to a single scalar value. */
export interface UnaryFilterCondition {
  field: string;
  operator: Extract<FilterOperator, 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'CONTAINS'>;
  value: ScalarFilterValue;
}

/** Filter that compares a field to a list of scalar values. */
export interface SetFilterCondition {
  field: string;
  operator: Extract<FilterOperator, 'IN' | 'NOT_IN'>;
  value: FilterListValue;
}

/** Filter that compares a field to a bounded scalar range. */
export interface BetweenFilterCondition {
  field: string;
  operator: Extract<FilterOperator, 'BETWEEN'>;
  value: FilterRangeValue;
}

/** Filter that checks whether a field is null or not null. */
export interface NullaryFilterCondition {
  field: string;
  operator: Extract<FilterOperator, 'IS_NULL' | 'IS_NOT_NULL'>;
}

/** Filter condition supported by the analytics engine. */
export type FilterCondition =
  UnaryFilterCondition | SetFilterCondition | BetweenFilterCondition | NullaryFilterCondition;

/** Relative date range based on an arbitrary number of trailing days. */
export interface LastNDaysDateRangeSpec {
  type: 'LAST_N_DAYS';
  value: number;
}

/** Absolute custom date range. */
export interface CustomDateRangeSpec {
  type: 'CUSTOM';
  from: string;
  to: string;
}

/** Fixed preset date range without extra payload. */
export interface PresetDateRangeSpec {
  type: Exclude<DateRangeType, 'LAST_N_DAYS' | 'CUSTOM'>;
}

/** Date range selector used by the query engine. */
export type DateRangeSpec = LastNDaysDateRangeSpec | CustomDateRangeSpec | PresetDateRangeSpec;

/** Optional period comparison applied after the base query. */
export interface ComparisonSpec {
  type: ComparisonType;
}

/** Sort instruction applied to the result set. */
export interface SortSpec {
  field: string;
  direction: SortDirection;
}

/** Visualization preference stored with an analysis or dashboard card. */
export interface VisualizationSpec {
  type: VisualizationType;
  /**
   * AUTO: the platform picks the best chart for the analysis (it may change when the analysis
   * changes). MANUAL: the user's choice is kept. Missing = AUTO when type is AUTO, else MANUAL.
   */
  mode?: VisualizationMode;
  settings?: VisualizationSettings;
}

/** Whether the chart is picked by the platform or by the user. */
export type VisualizationMode = 'AUTO' | 'MANUAL';

/** Per-chart options persisted with the analysis (only the ones the chart uses are read). */
export interface VisualizationSettings {
  orientation?: 'HORIZONTAL' | 'VERTICAL';
  stacking?: 'NONE' | 'STACKED' | 'PERCENT';
  showValues?: boolean;
  showLegend?: boolean;
  showTable?: boolean;
  showGrid?: boolean;
  showPoints?: boolean;
  smooth?: boolean;
  showPercent?: boolean;
  trendLine?: boolean;
  sort?: 'ASC' | 'DESC' | 'NONE' | 'LABEL';
  topN?: number;
  normalize?: boolean;
  xAxis?: string;
  yAxis?: string;
  series?: string;
  size?: string;
  colorBy?: string;
  mapLevel?: 'UF' | 'REGION';
  bins?: number;
  innerRadius?: number;
  /** Table: bar behind metric values proportional to the column maximum. */
  conditional?: boolean;
}

/** Metadata persisted alongside a serializable analysis specification. */
export interface AnalysisMetadata {
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  visibility?: SharingLevel;
  ownerName?: string;
  team?: string;
}

/** Serializable query contract shared across UI, AI, API, and persistence. */
export interface AnalysisSpec {
  id?: string;
  name?: string;
  /** Data mesh data products selected by the user; the engine only joins these. */
  datasets?: string[];
  metrics: MetricSelection[];
  dimensions: DimensionSelection[];
  filters: FilterCondition[];
  dateRange?: DateRangeSpec;
  comparison?: ComparisonSpec;
  sorting?: SortSpec[];
  limit?: number;
  visualization: VisualizationSpec;
  metadata?: AnalysisMetadata;
}

/** Logical operators supported by the audience rule builder. */
export const LOGICAL_OPERATORS = ['AND', 'OR'] as const;

/** Logical operators supported by the audience rule builder. */
export type LogicalOperator = (typeof LOGICAL_OPERATORS)[number];

/** Single condition inside an audience rule tree. */
export type AudienceRule = FilterCondition & {
  kind: 'rule';
  id: string;
};

/** Group of conditions (possibly nested) combined by a logical operator. */
export interface AudienceRuleGroup {
  kind: 'group';
  id: string;
  operator: LogicalOperator;
  rules: Array<AudienceRule | AudienceRuleGroup>;
}

/** Audience definition saved by a user for preview or activation. */
export interface AudienceDefinition {
  id: string;
  name: string;
  description?: string;
  filters: FilterCondition[];
  filterGroups?: AudienceRuleGroup;
  logicalOperator?: LogicalOperator;
  sourceAnalysisId?: string;
  estimatedSize?: number;
  status: AudienceStatus;
  createdBy: string;
  ownerName?: string;
  lastDestination?: ActivationDestination;
  createdAt: string;
  updatedAt: string;
}

/** Aggregated, PII-free audience preview. */
export interface AudiencePreview {
  size: number;
  baseSize: number;
  share: number;
  distributions: Array<{
    field: string;
    label: string;
    buckets: Array<{ value: string; label: string; count: number }>;
  }>;
  freshness: string;
  sources: string[];
}

/** Destinations supported by the simulated activation flow. */
export const ACTIVATION_DESTINATIONS = ['CRM', 'MEDIA'] as const;

/** Destinations supported by the simulated activation flow. */
export type ActivationDestination = (typeof ACTIVATION_DESTINATIONS)[number];

/** Lifecycle of a simulated activation job. */
export const ACTIVATION_JOB_STATUSES = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

/** Lifecycle of a simulated activation job. */
export type ActivationJobStatus = (typeof ACTIVATION_JOB_STATUSES)[number];

/** Simulated activation job that sends an audience to a destination. */
export interface ActivationJob {
  id: string;
  audienceId: string;
  audienceName: string;
  destination: ActivationDestination;
  status: ActivationJobStatus;
  records: number;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

/** Layout coordinates for a dashboard card. */
export interface DashboardCardLayout {
  mode: DashboardLayoutMode;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Single dashboard card that references a saved analysis. */
export interface DashboardCard {
  id: string;
  title: string;
  analysisId: string;
  visualization?: VisualizationSpec;
  layout: DashboardCardLayout;
}

/** Dashboard definition composed of references to saved analyses. */
export interface DashboardDefinition {
  id: string;
  name: string;
  description?: string;
  cards: DashboardCard[];
  visibility?: SharingLevel;
  ownerName?: string;
  team?: string;
  favoritedBy?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Glossary term exposed through the semantic catalog. */
export interface BusinessTerm {
  id: string;
  term: string;
  definition: string;
  domain: BusinessDomain;
  owner: string;
  synonyms: string[];
  relatedMetricIds: string[];
  relatedDimensionIds: string[];
  sensitivity: DataSensitivityLevel;
  updatedAt: string;
}

/** Data lineage summary associated with a data product. */
export interface DataLineageDefinition {
  upstreamIds: string[];
  downstreamIds: string[];
}

/** Data product contract exposed in the governance surface. */
export interface DataProductDefinition {
  id: string;
  name: string;
  description: string;
  domain: BusinessDomain;
  owner: string;
  sourceEntityTypes: DatasetEntityType[];
  freshnessSLOMinutes: number;
  qualityThreshold: number;
  lineage: DataLineageDefinition;
  updatedAt: string;
}

/** Shared metric-definition fields used by every metric in the semantic layer. */
export interface MetricDefinitionBase {
  id: string;
  name: string;
  shortName: string;
  description: string;
  businessDefinition: string;
  formula: string;
  aggregation: AggregationType;
  format: MetricFormat;
  unit?: string;
  domain: BusinessDomain;
  owner: string;
  source: string;
  timeField: string;
  allowedDimensions: '*' | string[];
  allowedFilters: string[];
  certificationStatus: CertificationStatus;
  freshnessSLOMinutes: number;
  qualityThreshold: number;
  version: string;
  updatedAt: string;
  additivity: MetricAdditivity;
  /** What the number represents (feeds chart recommendations). Inferred when missing. */
  semanticType?: MetricSemanticType;
  /** Position of the metric in the acquisition-to-activation funnel (1 = top). */
  funnelStage?: number;
}

/** What a metric value represents, used to pick and validate charts. */
export const METRIC_SEMANTIC_TYPES = [
  'COUNT',
  'AMOUNT',
  'RATE',
  'PERCENTAGE',
  'SCORE',
  'DURATION',
  'VOLUME',
  'CURRENCY',
  'FUNNEL_VALUE',
  'GEO_MEASURE',
  'OTHER',
] as const;

/** What a metric value represents. */
export type MetricSemanticType = (typeof METRIC_SEMANTIC_TYPES)[number];

/** What a dimension represents, used to pick and validate charts. */
export const DIMENSION_SEMANTIC_TYPES = [
  'CATEGORY',
  'TIME',
  'GEO',
  'FUNNEL_STAGE',
  'SOURCE',
  'DESTINATION',
  'ENTITY',
  'PRODUCT',
  'CUSTOMER',
  'EVENT',
] as const;

/** What a dimension represents. */
export type DimensionSemanticType = (typeof DIMENSION_SEMANTIC_TYPES)[number];

/** Ratio metric definition requiring numerator and denominator dependencies. */
export interface RatioMetricDefinition extends MetricDefinitionBase {
  aggregation: 'RATIO';
  numerator: string;
  denominator: string;
}

/** Non-ratio metric definition. */
export interface StandardMetricDefinition extends MetricDefinitionBase {
  aggregation: Exclude<AggregationType, 'RATIO'>;
}

/** Metric definition contract consumed by the semantic catalog and query engine. */
export type MetricDefinition = RatioMetricDefinition | StandardMetricDefinition;

/** Dimension definition contract consumed by the semantic catalog. */
export interface DimensionDefinition {
  id: string;
  name: string;
  description: string;
  type: DimensionValueType;
  domain: BusinessDomain;
  source: string;
  allowedOperators: FilterOperator[];
  sensitivity: DataSensitivityLevel;
  certificationStatus: CertificationStatus;
  /** What the dimension represents (feeds chart recommendations). Inferred when missing. */
  semanticType?: DimensionSemanticType;
  /** Date dimensions of a lifecycle: START opens a cohort, EVENT is a later milestone. */
  cohortRole?: 'START' | 'EVENT';
  /** Geographic level of GEO dimensions. */
  geoLevel?: 'UF' | 'REGION';
}

/** Column definition returned by the analytics engine. */
export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  format?: ColumnFormat;
  role: ColumnRole;
}

/** Metadata block returned alongside analytics rows. */
export interface AnalyticsResultMetadata {
  queryId: string;
  executionMs: number;
  rowCount: number;
  freshness: string;
  qualityScore: number;
  metricDefinitions: MetricDefinition[];
  warnings?: string[];
  /** Data mesh bases read and joins executed. */
  plan?: {
    datasets: Array<{ id: string; name: string }>;
    joins: Array<{ left: string; right: string; key: string; description: string }>;
  };
}

/** Query result contract shared between the engine and the frontend. */
export interface AnalyticsResult {
  columns: ColumnDef[];
  rows: Array<Record<string, unknown>>;
  metadata: AnalyticsResultMetadata;
}

/** Full deterministic dataset artifact emitted by the local seed generator. */
export interface DatasetBundle {
  companies: Company[];
  partners: Partner[];
  accounts: Account[];
  products: Product[];
  companyProducts: CompanyProduct[];
  mediaCampaigns: MediaCampaign[];
  mediaTouchpoints: MediaTouchpoint[];
  funnelEvents: FunnelEvent[];
  crmInteractions: CRMInteraction[];
  conversations: Conversation[];
  digitalEvents: DigitalEvent[];
  appNavigationEvents: AppNavigationEvent[];
  transactions: Transaction[];
  npsResponses: NpsResponse[];
  /** Materialized by `npm run intelligence:rebuild` (empty until then). */
  customerIntelligence: CustomerIntelligenceSnapshot[];
  qualityStatuses: QualityStatus[];
  auditLogs: AuditLogEntry[];
}
