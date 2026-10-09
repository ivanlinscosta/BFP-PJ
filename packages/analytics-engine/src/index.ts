import { createHash } from 'node:crypto';

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type {
  AnalyticsResult,
  AuditLogEntry,
  ColumnDef,
  DatasetBundle,
  DatasetEntityType,
  DateGranularity,
  DateRangeSpec,
  DimensionDefinition,
  FilterCondition,
  MetricDefinition,
  SortSpec,
  VisualizationType,
} from '@bfp/domain';
import { getDimensionDefinition, getMetricDefinition } from '@bfp/semantic-layer';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_CACHE_TTL_MS = 60_000;
const ALL_GROUP_KEY = '__all__';

const ENTITY_TYPE_TO_BUNDLE_KEY = {
  company: 'companies',
  partner: 'partners',
  account: 'accounts',
  product: 'products',
  companyProduct: 'companyProducts',
  campaign: 'mediaCampaigns',
  touchpoint: 'mediaTouchpoints',
  funnelEvent: 'funnelEvents',
  crmInteraction: 'crmInteractions',
  conversation: 'conversations',
  digitalEvent: 'digitalEvents',
  appNavigation: 'appNavigationEvents',
  transaction: 'transactions',
  npsResponse: 'npsResponses',
  customerIntelligence: 'customerIntelligence',
  qualityStatus: 'qualityStatuses',
  auditLog: 'auditLogs',
} as const satisfies Record<DatasetEntityType, keyof DatasetBundle>;

const DEFAULT_ENTITY_FIELDS = {
  company: ['id', 'acquisitionCampaignId'],
  partner: ['id', 'companyId'],
  account: ['id', 'companyId'],
  product: ['id'],
  companyProduct: ['id', 'companyId', 'productId'],
  campaign: ['id'],
  touchpoint: ['id', 'companyId', 'campaignId'],
  funnelEvent: ['id', 'companyId', 'campaignId'],
  crmInteraction: ['id', 'companyId'],
  conversation: ['id', 'companyId'],
  digitalEvent: ['id', 'companyId', 'productId'],
  appNavigation: ['id', 'companyId'],
  transaction: ['id', 'companyId'],
  npsResponse: ['id', 'companyId'],
  customerIntelligence: ['id', 'companyId'],
  qualityStatus: ['id', 'companyId'],
  auditLog: ['id', 'companyId'],
} as const satisfies Record<DatasetEntityType, readonly string[]>;

const TIMESTAMP_FIELDS_BY_ENTITY_TYPE = {
  company: [
    'createdAt',
    'leadCreatedAt',
    'accountOpeningStartedAt',
    'accountOpenedAt',
    'onboardingStartedAt',
    'onboardingCompletedAt',
    'activationDate',
  ],
  partner: ['joinedAt'],
  account: ['openedAt', 'createdAt', 'closedAt'],
  product: ['createdAt'],
  companyProduct: ['contractedAt', 'activatedAt', 'cancelledAt'],
  campaign: ['startDate', 'endDate', 'createdAt'],
  touchpoint: ['occurredAt'],
  funnelEvent: ['occurredAt'],
  crmInteraction: ['occurredAt'],
  conversation: ['startedAt', 'resolvedAt'],
  digitalEvent: ['occurredAt'],
  appNavigation: ['occurredAt'],
  transaction: ['occurredAt'],
  npsResponse: ['respondedAt'],
  customerIntelligence: ['calculatedAt'],
  qualityStatus: ['checkedAt'],
  auditLog: ['timestamp'],
} as const satisfies Record<DatasetEntityType, readonly string[]>;

/** Customer Intelligence score field read by each average metric. */
const INTELLIGENCE_SCORE_FIELDS: Record<string, string> = {
  avg_nba_score: 'nbaScore',
  dna_digital_engagement_score: 'dnaDigitalEngagement',
  dna_product_depth_score: 'dnaProductDepth',
  dna_relationship_strength_score: 'dnaRelationshipStrength',
  dna_commercial_intent_score: 'dnaCommercialIntent',
  dna_business_momentum_score: 'dnaBusinessMomentum',
  dna_transaction_activity_score: 'dnaTransactionActivity',
};

type AnalyticsDocument = Record<string, unknown>;
type LoadedDocuments = Partial<Record<DatasetEntityType, readonly AnalyticsDocument[]>>;

type RuntimeMetricDefinition = MetricDefinition & {
  baseEntity: DatasetEntityType;
  sourceFields: readonly { entityType: DatasetEntityType; field: string }[];
  bakedFilters?: readonly (FilterCondition & { reason: string })[];
};

type ResolvedMetricLike = {
  request: { id: string; alias?: string };
  definition: RuntimeMetricDefinition;
  alias: string;
  baseEntity: DatasetEntityType;
  sourceFields: readonly { entityType: DatasetEntityType; field: string }[];
};

type RuntimeDimensionSelection = ValidatedAnalysisQuery['dimensions'][number] & {
  definition: DimensionDefinition & {
    label?: string;
  };
};

type FilterRuntimeSelection = ValidatedAnalysisQuery['filters'][number];

type GroupRow = {
  key: string;
  dimensions: Record<string, unknown>;
  values: Record<string, number | null>;
};

type GroupedMetricValues = Map<string, GroupRow>;

type MutableExecutionState = {
  warningSet: Set<string>;
  metricMemo: Map<string, GroupedMetricValues>;
  dependencyMemo: Map<string, ResolvedMetricLike>;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type ResolvedDateWindow = {
  from: Date | null;
  to: Date | null;
};

type CacheEntry = {
  expiresAt: number;
  result: AnalyticsExecutionResult;
};

type MetricContext = {
  query: ValidatedAnalysisQuery;
  documents: LoadedDocuments;
  window: ResolvedDateWindow;
  timeZone: string;
  state: MutableExecutionState;
};

type QualityProviderInput = {
  query: ValidatedAnalysisQuery;
  documents: LoadedDocuments;
  metricDefinitions: MetricDefinition[];
};

type QueryExecutionContext = {
  accessScope: string;
  userId: string;
  companyId: string | null;
};

/** Pure query execution interface shared by the local and cloud engines. */
export interface AnalyticsQueryEngine {
  execute(query: ValidatedAnalysisQuery): Promise<AnalyticsResult>;
}

/** Visualization guidance composed locally because the shared AnalyticsResult contract has no slot for it yet. */
export interface VisualizationRecommendation {
  requestedType: VisualizationType;
  recommendedType: VisualizationType;
  fallbackType: 'TABLE';
  variant?: 'DOUBLE_KPI';
  appliedLimit?: number;
  shouldSortBy?: SortSpec[];
  reason: string;
}

/** Runtime result composed locally with the visualization recommendation required by later phases. */
export interface AnalyticsExecutionResult extends AnalyticsResult {
  visualization: VisualizationRecommendation;
}

/** Execution-time window returned from preset or custom date ranges. */
export interface AnalyticsWindow {
  from: string | null;
  to: string | null;
}

/** Document-loader input used by both engine implementations. */
export interface AnalyticsDocumentLoaderRequest {
  query: ValidatedAnalysisQuery;
  entityTypes: DatasetEntityType[];
  fieldsByEntityType: ReadonlyMap<DatasetEntityType, ReadonlySet<string>>;
  window: ResolvedDateWindow;
}

/** Injectable document loader used by the in-memory engine. */
export type AnalyticsDocumentLoader = (
  request: AnalyticsDocumentLoaderRequest,
) => Promise<LoadedDocuments>;

/** Optional execution context used for cache scoping and audit plumbing. */
export type AnalyticsContextResolver = (
  query: ValidatedAnalysisQuery,
) => Partial<QueryExecutionContext> | undefined;

/** Optional quality provider injected by the host application. */
export type AnalyticsQualityProvider = (input: QualityProviderInput) => number | Promise<number>;

/** Optional audit sink injected by the host application. */
export type AnalyticsAuditSink = (entry: AuditLogEntry) => void | Promise<void>;

/** Shared runtime options for both analytics-engine implementations. */
export interface AnalyticsEngineOptions {
  clock?: () => Date;
  referenceDate?: Date | (() => Date);
  timeZone?: string;
  cacheTtlMs?: number;
  qualityProvider?: AnalyticsQualityProvider;
  onAudit?: AnalyticsAuditSink;
  contextResolver?: AnalyticsContextResolver;
}

/** Local engine options using either a full bundle or a custom document loader. */
export interface InMemoryAnalyticsQueryEngineOptions extends AnalyticsEngineOptions {
  bundle?: DatasetBundle;
  documentLoader?: AnalyticsDocumentLoader;
}

/** Minimal DynamoDB client surface needed by the cloud analytics engine. */
export interface DynamoDBDocumentClientLike {
  send(command: QueryCommand): Promise<{
    Items?: Array<Record<string, unknown>>;
    LastEvaluatedKey?: Record<string, unknown>;
  }>;
}

/** Cloud engine options backed by the immutable dataset table. */
export interface DynamoDBAnalyticsQueryEngineOptions extends AnalyticsEngineOptions {
  client: DynamoDBDocumentClientLike;
  tableName: string;
}

/** Constructor-like request used by the pure pipeline shared by both engines. */
export interface ExecuteAnalyticsPipelineInput {
  query: ValidatedAnalysisQuery;
  documents: LoadedDocuments;
  queryId: string;
  referenceDate?: Date;
  timeZone?: string;
  clock?: () => Date;
  qualityProvider?: AnalyticsQualityProvider;
}

function toResolvedMetricLike(
  metric: ValidatedAnalysisQuery['metrics'][number],
): ResolvedMetricLike {
  return {
    request: metric.request,
    definition: metric.definition as RuntimeMetricDefinition,
    alias: metric.alias,
    baseEntity: metric.baseEntity,
    sourceFields: metric.sourceFields,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function getClock(options?: AnalyticsEngineOptions) {
  return options?.clock ?? (() => new Date());
}

function getReferenceDate(options?: AnalyticsEngineOptions): Date {
  const referenceDate = options?.referenceDate;
  if (!referenceDate) {
    return getClock(options)();
  }

  return typeof referenceDate === 'function' ? referenceDate() : referenceDate;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return utcTime - date.getTime();
}

function zonedDateTimeToUtc(
  localDate: LocalDateParts,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
) {
  const guessUtc = Date.UTC(
    localDate.year,
    localDate.month - 1,
    localDate.day,
    hour,
    minute,
    second,
  );
  const firstOffset = getTimeZoneOffsetMs(new Date(guessUtc), timeZone);
  const corrected = guessUtc - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(corrected), timeZone);
  const finalUtc = secondOffset === firstOffset ? corrected : guessUtc - secondOffset;
  return new Date(finalUtc);
}

function toLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = getTimeZoneParts(date, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function shiftLocalDays(date: LocalDateParts, days: number): LocalDateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function shiftLocalMonths(date: LocalDateParts, months: number): LocalDateParts {
  const shifted = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: 1,
  };
}

function toAnalyticsWindow(window: ResolvedDateWindow): AnalyticsWindow {
  return {
    from: window.from?.toISOString() ?? null,
    to: window.to?.toISOString() ?? null,
  };
}

function resolveQuarterStartMonth(month: number) {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

/** Resolves an `AnalysisSpec` date preset into the canonical `[from, to)` execution window. */
export function resolveDateRange(
  dateRange: DateRangeSpec | undefined,
  options: { referenceDate?: Date; timeZone?: string } = {},
): AnalyticsWindow {
  return toAnalyticsWindow(resolveDateRangeInternal(dateRange, options));
}

function resolveDateRangeInternal(
  dateRange: DateRangeSpec | undefined,
  options: { referenceDate?: Date; timeZone?: string } = {},
): ResolvedDateWindow {
  if (!dateRange || dateRange.type === 'ALL_TIME') {
    return { from: null, to: null };
  }

  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
  const referenceDate = options.referenceDate ?? new Date();
  const today = toLocalDateParts(referenceDate, timeZone);
  const todayStart = zonedDateTimeToUtc(today, timeZone);
  const tomorrowStart = zonedDateTimeToUtc(shiftLocalDays(today, 1), timeZone);

  switch (dateRange.type) {
    case 'TODAY':
      return { from: todayStart, to: tomorrowStart };
    case 'YESTERDAY':
      return {
        from: zonedDateTimeToUtc(shiftLocalDays(today, -1), timeZone),
        to: todayStart,
      };
    case 'LAST_7_DAYS':
      return {
        from: zonedDateTimeToUtc(shiftLocalDays(today, -6), timeZone),
        to: tomorrowStart,
      };
    case 'LAST_30_DAYS':
      return {
        from: zonedDateTimeToUtc(shiftLocalDays(today, -29), timeZone),
        to: tomorrowStart,
      };
    case 'LAST_90_DAYS':
      return {
        from: zonedDateTimeToUtc(shiftLocalDays(today, -89), timeZone),
        to: tomorrowStart,
      };
    case 'LAST_120_DAYS':
      return {
        from: zonedDateTimeToUtc(shiftLocalDays(today, -119), timeZone),
        to: tomorrowStart,
      };
    case 'LAST_N_DAYS':
      return {
        from: zonedDateTimeToUtc(shiftLocalDays(today, -(dateRange.value - 1)), timeZone),
        to: tomorrowStart,
      };
    case 'THIS_MONTH': {
      const monthStart = { year: today.year, month: today.month, day: 1 };
      return {
        from: zonedDateTimeToUtc(monthStart, timeZone),
        to: zonedDateTimeToUtc(shiftLocalMonths(monthStart, 1), timeZone),
      };
    }
    case 'LAST_MONTH': {
      const currentMonthStart = { year: today.year, month: today.month, day: 1 };
      const previousMonthStart = shiftLocalMonths(currentMonthStart, -1);
      return {
        from: zonedDateTimeToUtc(previousMonthStart, timeZone),
        to: zonedDateTimeToUtc(currentMonthStart, timeZone),
      };
    }
    case 'THIS_QUARTER': {
      const quarterStart = {
        year: today.year,
        month: resolveQuarterStartMonth(today.month),
        day: 1,
      };
      return {
        from: zonedDateTimeToUtc(quarterStart, timeZone),
        to: zonedDateTimeToUtc(shiftLocalMonths(quarterStart, 3), timeZone),
      };
    }
    case 'LAST_QUARTER': {
      const currentQuarterStart = {
        year: today.year,
        month: resolveQuarterStartMonth(today.month),
        day: 1,
      };
      const previousQuarterStart = shiftLocalMonths(currentQuarterStart, -3);
      return {
        from: zonedDateTimeToUtc(previousQuarterStart, timeZone),
        to: zonedDateTimeToUtc(currentQuarterStart, timeZone),
      };
    }
    case 'THIS_YEAR': {
      const yearStart = { year: today.year, month: 1, day: 1 };
      return {
        from: zonedDateTimeToUtc(yearStart, timeZone),
        to: zonedDateTimeToUtc({ year: today.year + 1, month: 1, day: 1 }, timeZone),
      };
    }
    case 'LAST_YEAR':
      return {
        from: zonedDateTimeToUtc({ year: today.year - 1, month: 1, day: 1 }, timeZone),
        to: zonedDateTimeToUtc({ year: today.year, month: 1, day: 1 }, timeZone),
      };
    case 'CUSTOM':
      return {
        from: new Date(dateRange.from),
        to: new Date(dateRange.to),
      };
    default:
      return { from: null, to: null };
  }
}

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function asComparable(value: unknown): number | string | boolean | null {
  if (isNil(value)) {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp) && value.includes('T')) {
      return timestamp;
    }

    return value;
  }

  return String(value);
}

function valuesMatch(
  value: unknown,
  filterValue: unknown,
  comparator: (left: number | string | boolean, right: number | string | boolean) => boolean,
) {
  const left = asComparable(value);
  const right = asComparable(filterValue);

  if (left === null || right === null) {
    return false;
  }

  return comparator(left, right);
}

function getStringArrayUnique(values: unknown[]) {
  return [...new Set(values.map((value) => stableStringify(value)))];
}

function getDocumentValue(document: AnalyticsDocument, field: string): unknown {
  return document[field];
}

function buildIndexById(documents: readonly AnalyticsDocument[] | undefined) {
  const index = new Map<string, AnalyticsDocument>();
  for (const document of documents ?? []) {
    const id = getDocumentValue(document, 'id');
    if (typeof id === 'string') {
      index.set(id, document);
    }
  }
  return index;
}

function buildMultiIndex(documents: readonly AnalyticsDocument[] | undefined, field: string) {
  const index = new Map<string, AnalyticsDocument[]>();
  for (const document of documents ?? []) {
    const value = getDocumentValue(document, field);
    if (typeof value !== 'string') {
      continue;
    }

    const existing = index.get(value);
    if (existing) {
      existing.push(document);
      continue;
    }

    index.set(value, [document]);
  }
  return index;
}

function buildIndexes(documents: LoadedDocuments) {
  return {
    companyById: buildIndexById(documents.company),
    campaignById: buildIndexById(documents.campaign),
    productById: buildIndexById(documents.product),
    companyProductsByCompanyId: buildMultiIndex(documents.companyProduct, 'companyId'),
    touchpointsByCompanyId: buildMultiIndex(documents.touchpoint, 'companyId'),
    touchpointsByCampaignId: buildMultiIndex(documents.touchpoint, 'campaignId'),
    conversationsByCompanyId: buildMultiIndex(documents.conversation, 'companyId'),
  };
}

function resolveRelatedDocuments(
  baseEntityType: DatasetEntityType,
  baseDocument: AnalyticsDocument,
  targetEntityType: DatasetEntityType,
  indexes: ReturnType<typeof buildIndexes>,
): AnalyticsDocument[] {
  if (baseEntityType === targetEntityType) {
    return [baseDocument];
  }

  switch (targetEntityType) {
    case 'company': {
      const companyId =
        baseEntityType === 'company'
          ? getDocumentValue(baseDocument, 'id')
          : getDocumentValue(baseDocument, 'companyId');
      if (typeof companyId !== 'string') {
        return [];
      }

      const company = indexes.companyById.get(companyId);
      return company ? [company] : [];
    }
    case 'campaign': {
      const campaignId =
        baseEntityType === 'company'
          ? getDocumentValue(baseDocument, 'acquisitionCampaignId')
          : getDocumentValue(baseDocument, 'campaignId');
      if (typeof campaignId !== 'string') {
        return [];
      }

      const campaign = indexes.campaignById.get(campaignId);
      return campaign ? [campaign] : [];
    }
    case 'product': {
      const productId = getDocumentValue(baseDocument, 'productId');
      if (typeof productId !== 'string') {
        return [];
      }

      const product = indexes.productById.get(productId);
      return product ? [product] : [];
    }
    case 'companyProduct': {
      const companyId =
        baseEntityType === 'company'
          ? getDocumentValue(baseDocument, 'id')
          : getDocumentValue(baseDocument, 'companyId');
      if (typeof companyId !== 'string') {
        return [];
      }

      return indexes.companyProductsByCompanyId.get(companyId) ?? [];
    }
    case 'touchpoint': {
      if (baseEntityType === 'campaign') {
        const campaignId = getDocumentValue(baseDocument, 'id');
        return typeof campaignId === 'string'
          ? (indexes.touchpointsByCampaignId.get(campaignId) ?? [])
          : [];
      }

      const companyId =
        baseEntityType === 'company'
          ? getDocumentValue(baseDocument, 'id')
          : getDocumentValue(baseDocument, 'companyId');

      return typeof companyId === 'string'
        ? (indexes.touchpointsByCompanyId.get(companyId) ?? [])
        : [];
    }
    case 'conversation': {
      const companyId =
        baseEntityType === 'company'
          ? getDocumentValue(baseDocument, 'id')
          : getDocumentValue(baseDocument, 'companyId');
      return typeof companyId === 'string'
        ? (indexes.conversationsByCompanyId.get(companyId) ?? [])
        : [];
    }
    default:
      return [];
  }
}

function resolveFieldValues(
  baseEntityType: DatasetEntityType,
  baseDocument: AnalyticsDocument,
  sourceFields: readonly { entityType: DatasetEntityType; field: string }[],
  indexes: ReturnType<typeof buildIndexes>,
): unknown[] {
  const targetField = sourceFields[sourceFields.length - 1];
  if (!targetField) {
    return [];
  }

  return resolveRelatedDocuments(baseEntityType, baseDocument, targetField.entityType, indexes)
    .map((document) => getDocumentValue(document, targetField.field))
    .filter((value) => value !== undefined);
}

/** Evaluates one filter condition against extracted semantic values. */
export function matchesFilterCondition(
  filter: FilterCondition,
  values: readonly unknown[],
): boolean {
  switch (filter.operator) {
    case 'EQ':
      return values.some((value) =>
        valuesMatch(value, filter.value, (left, right) => left === right),
      );
    case 'NEQ':
      return (
        values.length > 0 &&
        values.every((value) => valuesMatch(value, filter.value, (left, right) => left !== right))
      );
    case 'IN':
      return values.some((value) =>
        filter.value.some((entry) => valuesMatch(value, entry, (left, right) => left === right)),
      );
    case 'NOT_IN':
      return (
        values.length > 0 &&
        values.every(
          (value) =>
            !filter.value.some((entry) =>
              valuesMatch(value, entry, (left, right) => left === right),
            ),
        )
      );
    case 'GT':
      return values.some((value) =>
        valuesMatch(value, filter.value, (left, right) => left > right),
      );
    case 'GTE':
      return values.some((value) =>
        valuesMatch(value, filter.value, (left, right) => left >= right),
      );
    case 'LT':
      return values.some((value) =>
        valuesMatch(value, filter.value, (left, right) => left < right),
      );
    case 'LTE':
      return values.some((value) =>
        valuesMatch(value, filter.value, (left, right) => left <= right),
      );
    case 'BETWEEN':
      return values.some(
        (value) =>
          valuesMatch(value, filter.value[0], (left, right) => left >= right) &&
          valuesMatch(value, filter.value[1], (left, right) => left <= right),
      );
    case 'CONTAINS':
      return values.some(
        (value) =>
          typeof value === 'string' &&
          value.toLowerCase().includes(String(filter.value).toLowerCase()),
      );
    case 'IS_NULL':
      return values.length === 0 || values.every((value) => isNil(value));
    case 'IS_NOT_NULL':
      return values.some((value) => !isNil(value));
    default:
      return false;
  }
}

function getMetricTimeFieldSource(metric: ResolvedMetricLike) {
  return (
    metric.sourceFields.find((field) => field.field === metric.definition.timeField) ?? {
      entityType: metric.baseEntity,
      field: metric.definition.timeField,
    }
  );
}

function isWithinWindow(value: unknown, window: ResolvedDateWindow) {
  if (!window.from && !window.to) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  if (window.from && timestamp < window.from.getTime()) {
    return false;
  }

  if (window.to && timestamp >= window.to.getTime()) {
    return false;
  }

  return true;
}

function matchesDateWindow(
  metric: ResolvedMetricLike,
  document: AnalyticsDocument,
  indexes: ReturnType<typeof buildIndexes>,
  window: ResolvedDateWindow,
) {
  if (!window.from && !window.to) {
    return true;
  }

  const timeFieldSource = getMetricTimeFieldSource(metric);
  const values = resolveFieldValues(metric.baseEntity, document, [timeFieldSource], indexes);
  return values.some((value) => isWithinWindow(value, window));
}

function matchesSemanticFilters(
  filters: readonly FilterRuntimeSelection[],
  baseEntityType: DatasetEntityType,
  document: AnalyticsDocument,
  indexes: ReturnType<typeof buildIndexes>,
) {
  return filters.every((filter) => {
    const values = resolveFieldValues(baseEntityType, document, filter.sourceFields, indexes);
    return matchesFilterCondition(filter.request, values);
  });
}

function matchesBakedFilters(
  metric: ResolvedMetricLike,
  document: AnalyticsDocument,
  indexes: ReturnType<typeof buildIndexes>,
) {
  const bakedFilters = metric.definition.bakedFilters ?? [];
  if (bakedFilters.length === 0) {
    return true;
  }

  return bakedFilters.every((filter) => {
    const matchingDimension = filterFieldToSelection(metric, filter.field);
    const values = matchingDimension
      ? resolveFieldValues(metric.baseEntity, document, matchingDimension.sourceFields, indexes)
      : [getDocumentValue(document, filter.field)];
    return matchesFilterCondition(filter, values);
  });
}

function filterFieldToSelection(_metric: ResolvedMetricLike, fieldId: string) {
  return getDimensionDefinition(fieldId) as
    | ({
        sourceFields: readonly { entityType: DatasetEntityType; field: string }[];
      } & DimensionDefinition)
    | undefined;
}

function getLocalDateString(value: string, timeZone: string) {
  const parts = toLocalDateParts(new Date(value), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getIsoWeek(localDate: LocalDateParts) {
  const date = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return {
    year: date.getUTCFullYear(),
    week,
  };
}

/** Buckets an ISO timestamp into the governed `date|week|month` São Paulo grain. */
export function bucketDateValue(
  value: string,
  granularity: DateGranularity,
  timeZone = DEFAULT_TIMEZONE,
) {
  const localDate = toLocalDateParts(new Date(value), timeZone);

  switch (granularity) {
    case 'date':
      return `${localDate.year}-${String(localDate.month).padStart(2, '0')}-${String(localDate.day).padStart(2, '0')}`;
    case 'month':
      return `${localDate.year}-${String(localDate.month).padStart(2, '0')}`;
    case 'week': {
      const week = getIsoWeek(localDate);
      return `${week.year}-W${String(week.week).padStart(2, '0')}`;
    }
    default:
      return getLocalDateString(value, timeZone);
  }
}

function getDimensionValues(
  baseEntityType: DatasetEntityType,
  document: AnalyticsDocument,
  dimension: RuntimeDimensionSelection,
  indexes: ReturnType<typeof buildIndexes>,
  timeZone: string,
) {
  const extractedValues = resolveFieldValues(
    baseEntityType,
    document,
    dimension.sourceFields,
    indexes,
  );
  const normalizedValues = extractedValues.length === 0 ? [null] : extractedValues;

  const bucketedValues = normalizedValues.map((value) => {
    if (typeof value === 'string' && dimension.granularity) {
      return bucketDateValue(value, dimension.granularity, timeZone);
    }

    return value;
  });

  return getStringArrayUnique(bucketedValues).map((entry) => JSON.parse(entry) as unknown);
}

function buildDimensionCombinations(
  baseEntityType: DatasetEntityType,
  document: AnalyticsDocument,
  dimensions: readonly RuntimeDimensionSelection[],
  indexes: ReturnType<typeof buildIndexes>,
  timeZone: string,
) {
  if (dimensions.length === 0) {
    return [{ key: ALL_GROUP_KEY, values: {} as Record<string, unknown> }];
  }

  const valuesPerDimension = dimensions.map((dimension) => ({
    dimension,
    values: getDimensionValues(baseEntityType, document, dimension, indexes, timeZone),
  }));

  const combinations: Array<Record<string, unknown>> = [{}];
  for (const item of valuesPerDimension) {
    const next: Array<Record<string, unknown>> = [];
    for (const combination of combinations) {
      for (const value of item.values) {
        next.push({ ...combination, [item.dimension.definition.id]: value });
      }
    }
    combinations.splice(0, combinations.length, ...next);
  }

  return getStringArrayUnique(combinations).map((serialized) => {
    const values = JSON.parse(serialized) as Record<string, unknown>;
    return {
      key: stableStringify(
        dimensions.map((dimension) => [dimension.definition.id, values[dimension.definition.id]]),
      ),
      values,
    };
  });
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function diffInDays(from: unknown, to: unknown) {
  if (typeof from !== 'string' || typeof to !== 'string') {
    return null;
  }

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return null;
  }

  return (toTime - fromTime) / 86_400_000;
}

function computeNonRatioMetricValue(
  metric: ResolvedMetricLike,
  documents: readonly AnalyticsDocument[],
) {
  switch (metric.definition.id) {
    case 'companies_total':
    case 'new_companies':
    case 'leads':
    case 'accounts_opened':
    case 'converted_leads':
    case 'onboarding_started':
    case 'onboarding_completed':
    case 'active_companies':
    case 'activation_d30': {
      const values = new Set<string>();
      for (const document of documents) {
        const id = getDocumentValue(document, 'id');
        if (typeof id !== 'string') {
          continue;
        }

        if (metric.definition.id === 'activation_d30') {
          const days = diffInDays(
            getDocumentValue(document, 'accountOpenedAt'),
            getDocumentValue(document, 'activationDate'),
          );
          if (days === null || days > 30) {
            continue;
          }
        }

        values.add(id);
      }
      return values.size;
    }
    case 'media_spend':
      return documents.reduce(
        (total, document) => total + (toNumber(getDocumentValue(document, 'cost')) ?? 0),
        0,
      );
    case 'impressions':
      return documents.reduce(
        (total, document) => total + (toNumber(getDocumentValue(document, 'impressions')) ?? 0),
        0,
      );
    case 'clicks':
      return documents.reduce(
        (total, document) => total + (toNumber(getDocumentValue(document, 'clicks')) ?? 0),
        0,
      );
    case 'revenue_proxy':
      return documents
        .filter((document) =>
          ['ACTIVE', 'CONTRACTED'].includes(String(getDocumentValue(document, 'status'))),
        )
        .reduce(
          (total, document) =>
            total + (toNumber(getDocumentValue(document, 'monthlyRevenueProxy')) ?? 0),
          0,
        );
    case 'products_per_company': {
      const countsByCompany = new Map<string, number>();
      for (const document of documents) {
        const companyId = getDocumentValue(document, 'companyId');
        const status = getDocumentValue(document, 'status');
        if (typeof companyId !== 'string' || !['ACTIVE', 'CONTRACTED'].includes(String(status))) {
          continue;
        }

        countsByCompany.set(companyId, (countsByCompany.get(companyId) ?? 0) + 1);
      }

      if (countsByCompany.size === 0) {
        return null;
      }

      const total = [...countsByCompany.values()].reduce((sum, value) => sum + value, 0);
      return total / countsByCompany.size;
    }
    case 'average_opening_time': {
      const values = documents
        .map((document) =>
          diffInDays(
            getDocumentValue(document, 'leadCreatedAt'),
            getDocumentValue(document, 'accountOpenedAt'),
          ),
        )
        .filter((value): value is number => value !== null);
      if (values.length === 0) {
        return null;
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    case 'average_onboarding_time': {
      const values = documents
        .map((document) =>
          diffInDays(
            getDocumentValue(document, 'onboardingStartedAt'),
            getDocumentValue(document, 'onboardingCompletedAt'),
          ),
        )
        .filter((value): value is number => value !== null);
      if (values.length === 0) {
        return null;
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    case 'unresolved_conversations':
    case 'app_interactions':
    case 'app_errors':
    case 'transactions_count':
    case 'nps_responses':
    case 'boletos_issued':
    case 'app_completions':
    case 'app_abandons':
    case 'crm_interactions_total':
    case 'conversations_total':
    case 'conversations_resolved':
    case 'contracted_products':
    case 'digital_contracted_products':
      return documents.length;
    case 'app_sessions':
    case 'digital_sessions':
    case 'app_active_companies':
    case 'bankline_active_companies':
    case 'transacting_companies':
    case 'crm_contacted_companies':
    case 'digital_active_companies': {
      const field = metric.definition.id.endsWith('_sessions') ? 'sessionId' : 'companyId';
      return new Set(
        documents
          .map((document) => getDocumentValue(document, field))
          .filter((value): value is string => typeof value === 'string'),
      ).size;
    }
    case 'app_avg_screen_time': {
      const values = documents
        .map((document) => toNumber(getDocumentValue(document, 'durationSeconds')))
        .filter((value): value is number => value !== null);
      return values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    case 'transaction_volume':
    case 'pix_volume':
      return documents.reduce(
        (total, document) => total + (toNumber(getDocumentValue(document, 'amount')) ?? 0),
        0,
      );
    case 'intelligence_customers':
      return documents.length;
    case 'avg_nba_score':
    case 'dna_digital_engagement_score':
    case 'dna_product_depth_score':
    case 'dna_relationship_strength_score':
    case 'dna_commercial_intent_score':
    case 'dna_business_momentum_score':
    case 'dna_transaction_activity_score': {
      const field = INTELLIGENCE_SCORE_FIELDS[metric.definition.id];
      const values = documents
        .map((document) => toNumber(getDocumentValue(document, field)))
        .filter((value): value is number => value !== null);
      return values.length === 0
        ? null
        : values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    case 'nps': {
      // Net Promoter Score: % promoters (9-10) minus % detractors (0-6).
      const scores = documents
        .map((document) => toNumber(getDocumentValue(document, 'score')))
        .filter((value): value is number => value !== null);
      if (scores.length === 0) {
        return null;
      }
      const promoters = scores.filter((score) => score >= 9).length;
      const detractors = scores.filter((score) => score <= 6).length;
      return (100 * (promoters - detractors)) / scores.length;
    }
    default:
      return null;
  }
}

function createDependencyMetric(metricId: string, state: MutableExecutionState) {
  const cached = state.dependencyMemo.get(metricId);
  if (cached) {
    return cached;
  }

  const definition = getMetricDefinition(metricId) as RuntimeMetricDefinition | undefined;
  if (!definition) {
    throw new Error(`Unknown metric dependency: ${metricId}`);
  }

  const resolved: ResolvedMetricLike = {
    request: { id: metricId },
    definition,
    alias: definition.id,
    baseEntity: definition.baseEntity,
    sourceFields: definition.sourceFields,
  };

  state.dependencyMemo.set(metricId, resolved);
  return resolved;
}

function appendDivisionWarning(metric: ResolvedMetricLike, state: MutableExecutionState) {
  state.warningSet.add(`Divisão por zero convertida em null para a métrica \`${metric.alias}\`.`);
}

function computeMetricGroups(
  metric: ResolvedMetricLike,
  context: MetricContext,
): GroupedMetricValues {
  const memoKey = `${metric.definition.id}:${stableStringify(toAnalyticsWindow(context.window))}`;
  const cached = context.state.metricMemo.get(memoKey);
  if (cached) {
    return cached;
  }

  if (metric.definition.aggregation === 'RATIO') {
    const numeratorMetric = createDependencyMetric(metric.definition.numerator, context.state);
    const denominatorMetric = createDependencyMetric(metric.definition.denominator, context.state);
    const numeratorGroups = computeMetricGroups(numeratorMetric, context);
    const denominatorGroups = computeMetricGroups(denominatorMetric, context);
    const groupKeys = new Set([...numeratorGroups.keys(), ...denominatorGroups.keys()]);
    const groups = new Map<string, GroupRow>();

    for (const groupKey of groupKeys) {
      const numerator = numeratorGroups.get(groupKey);
      const denominator = denominatorGroups.get(groupKey);
      const numeratorValue = numerator?.values[numeratorMetric.alias] ?? 0;
      const denominatorValue = denominator?.values[denominatorMetric.alias] ?? 0;
      const baseDimensions = numerator?.dimensions ?? denominator?.dimensions ?? {};

      let value: number | null = null;
      if (denominatorValue === 0) {
        appendDivisionWarning(metric, context.state);
      } else {
        value = numeratorValue / denominatorValue;
      }

      groups.set(groupKey, {
        key: groupKey,
        dimensions: baseDimensions,
        values: { [metric.alias]: value },
      });
    }

    context.state.metricMemo.set(memoKey, groups);
    return groups;
  }

  const indexes = buildIndexes(context.documents);
  const baseDocuments = context.documents[metric.baseEntity] ?? [];
  const groupedDocuments = new Map<
    string,
    { dimensions: Record<string, unknown>; documents: AnalyticsDocument[] }
  >();

  for (const document of baseDocuments) {
    if (!matchesDateWindow(metric, document, indexes, context.window)) {
      continue;
    }

    if (!matchesSemanticFilters(context.query.filters, metric.baseEntity, document, indexes)) {
      continue;
    }

    if (!matchesBakedFilters(metric, document, indexes)) {
      continue;
    }

    for (const combination of buildDimensionCombinations(
      metric.baseEntity,
      document,
      context.query.dimensions as RuntimeDimensionSelection[],
      indexes,
      context.timeZone,
    )) {
      const existing = groupedDocuments.get(combination.key);
      if (existing) {
        existing.documents.push(document);
        continue;
      }

      groupedDocuments.set(combination.key, {
        dimensions: combination.values,
        documents: [document],
      });
    }
  }

  const groups: GroupedMetricValues = new Map();
  for (const [groupKey, group] of groupedDocuments.entries()) {
    const value = computeNonRatioMetricValue(metric, group.documents);
    groups.set(groupKey, {
      key: groupKey,
      dimensions: group.dimensions,
      values: { [metric.alias]: value },
    });
  }

  context.state.metricMemo.set(memoKey, groups);
  return groups;
}

function computePreviousPeriodWindow(window: ResolvedDateWindow): ResolvedDateWindow {
  if (!window.from || !window.to) {
    return { from: null, to: null };
  }

  const durationMs = window.to.getTime() - window.from.getTime();
  return {
    from: new Date(window.from.getTime() - durationMs),
    to: new Date(window.from.getTime()),
  };
}

function mergeMetricGroups(metrics: readonly ResolvedMetricLike[], context: MetricContext) {
  const rowMap = new Map<string, GroupRow>();

  for (const metric of metrics) {
    const groups = computeMetricGroups(metric, context);
    for (const [groupKey, group] of groups.entries()) {
      const existing = rowMap.get(groupKey);
      if (existing) {
        existing.values[metric.alias] = group.values[metric.alias] ?? null;
        continue;
      }

      rowMap.set(groupKey, {
        key: groupKey,
        dimensions: { ...group.dimensions },
        values: { [metric.alias]: group.values[metric.alias] ?? null },
      });
    }
  }

  return rowMap;
}

function rowsFromGroupMap(
  rowMap: Map<string, GroupRow>,
  query: ValidatedAnalysisQuery,
  comparison?: Map<string, GroupRow>,
) {
  return [...rowMap.values()].map((group) => {
    const row: Record<string, unknown> = { ...group.dimensions, ...group.values };

    if (comparison) {
      const previousGroup = comparison.get(group.key);
      for (const metric of query.metrics) {
        row[`${metric.alias}__previous_period`] = previousGroup?.values[metric.alias] ?? null;
      }
    }

    return row;
  });
}

function resolveSortField(sortField: string, query: ValidatedAnalysisQuery) {
  const metric = query.metrics.find(
    (item: ValidatedAnalysisQuery['metrics'][number]) =>
      item.alias === sortField || item.definition.id === sortField,
  );
  return metric?.alias ?? sortField;
}

function compareNullableValues(left: unknown, right: unknown) {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  const normalizedLeft = asComparable(left);
  const normalizedRight = asComparable(right);

  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    return normalizedLeft - normalizedRight;
  }

  return String(normalizedLeft).localeCompare(String(normalizedRight), 'pt-BR');
}

function applySorting(
  rows: Array<Record<string, unknown>>,
  sorting: readonly SortSpec[] | undefined,
  query: ValidatedAnalysisQuery,
) {
  if (!sorting || sorting.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const sort of sorting) {
      const field = resolveSortField(sort.field, query);
      const comparison = compareNullableValues(left[field], right[field]);
      if (comparison !== 0) {
        return sort.direction === 'DESC' ? -comparison : comparison;
      }
    }

    return 0;
  });
}

/** Pure visualization recommendation engine implementing the architecture rule matrix. */
export function recommendVisualization(
  query: ValidatedAnalysisQuery,
  rows: readonly Record<string, unknown>[],
): VisualizationRecommendation {
  if (query.visualization.type !== 'AUTO') {
    return {
      requestedType: query.visualization.type,
      recommendedType: query.visualization.type,
      fallbackType: 'TABLE',
      reason: 'Visualização explicitamente escolhida na AnalysisSpec.',
    };
  }

  const metricCount = query.metrics.length;
  const dimensionCount = query.dimensions.length;
  const firstDimension = query.dimensions[0];
  const firstDimensionType = firstDimension?.definition.type;
  const firstDimensionIsTemporal = firstDimension?.definition.type === 'date';
  const firstDimensionCardinality =
    firstDimension === undefined
      ? 0
      : new Set(rows.map((row) => stableStringify(row[firstDimension.definition.id]))).size;
  const hasFunnelDimension = query.dimensions.some(
    (dimension: ValidatedAnalysisQuery['dimensions'][number]) =>
      dimension.definition.id === 'eventType',
  );

  if (metricCount === 1 && dimensionCount === 0) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'KPI',
      fallbackType: 'TABLE',
      reason: 'Uma única métrica sem dimensões favorece leitura de KPI.',
    };
  }

  if (metricCount === 2 && dimensionCount === 0) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'KPI',
      variant: 'DOUBLE_KPI',
      fallbackType: 'TABLE',
      reason: 'Duas métricas sem dimensões favorecem KPI duplo comparativo.',
    };
  }

  if (hasFunnelDimension) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'FUNNEL',
      fallbackType: 'TABLE',
      reason: 'Dimensão de funil identificada; o formato FUNNEL é o mais aderente.',
    };
  }

  if (metricCount === 1 && dimensionCount === 1 && firstDimensionIsTemporal) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'LINE',
      fallbackType: 'TABLE',
      reason: 'Uma métrica sobre uma dimensão temporal favorece série em linha.',
    };
  }

  if (metricCount >= 2 && dimensionCount === 1 && firstDimensionType !== 'date') {
    return {
      requestedType: 'AUTO',
      recommendedType: 'GROUPED_BAR',
      fallbackType: 'TABLE',
      reason: 'Múltiplas métricas sobre uma dimensão categórica favorecem GROUPED_BAR.',
    };
  }

  if (
    metricCount === 1 &&
    dimensionCount === 2 &&
    query.dimensions.every(
      (dimension: ValidatedAnalysisQuery['dimensions'][number]) =>
        dimension.definition.type !== 'date',
    )
  ) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'HEATMAP',
      fallbackType: 'TABLE',
      reason: 'Uma métrica cruzada por duas dimensões categóricas favorece mapa de calor.',
    };
  }

  if (metricCount === 1 && dimensionCount === 2) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'STACKED_BAR',
      fallbackType: 'TABLE',
      reason: 'Uma métrica distribuída em duas dimensões favorece STACKED_BAR.',
    };
  }

  if (
    metricCount === 1 &&
    dimensionCount === 1 &&
    firstDimensionType !== 'date' &&
    firstDimensionCardinality <= 8
  ) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'BAR',
      fallbackType: 'TABLE',
      reason: 'Cardinalidade categórica baixa favorece barras simples.',
    };
  }

  if (
    metricCount === 1 &&
    dimensionCount === 1 &&
    firstDimensionType !== 'date' &&
    firstDimensionCardinality > 8
  ) {
    return {
      requestedType: 'AUTO',
      recommendedType: 'BAR',
      fallbackType: 'TABLE',
      appliedLimit: 20,
      shouldSortBy: [{ field: query.metrics[0]!.alias, direction: 'DESC' }],
      reason: 'Cardinalidade categórica alta pede BAR com ordenação e limite de 20 linhas.',
    };
  }

  return {
    requestedType: 'AUTO',
    recommendedType: 'TABLE',
    fallbackType: 'TABLE',
    reason: 'Fallback explícito para tabela quando nenhuma regra específica se aplica.',
  };
}

/** Public column builder shared by every engine implementation (in-memory, DynamoDB, Athena). */
export function buildResultColumns(query: ValidatedAnalysisQuery, includeComparison = false) {
  return buildColumns(query, includeComparison);
}

function buildColumns(query: ValidatedAnalysisQuery, includeComparison: boolean): ColumnDef[] {
  const columns: ColumnDef[] = [];

  for (const [index, dimension] of query.dimensions.entries()) {
    const isTemporal = dimension.definition.type === 'date';
    columns.push({
      key: dimension.definition.id,
      label: getDimensionDefinition(dimension.definition.id)?.label ?? dimension.definition.name,
      type: 'dimension',
      format: isTemporal && dimension.granularity === 'date' ? 'date' : 'text',
      role: isTemporal ? 'time' : index === 0 ? 'category' : index === 1 ? 'series' : 'detail',
    });
  }

  for (const metric of query.metrics) {
    columns.push({
      key: metric.alias,
      label:
        metric.alias === metric.definition.id
          ? (getMetricDefinition(metric.definition.id)?.shortName ?? metric.definition.name)
          : metric.alias,
      type: 'metric',
      format: metric.definition.format,
      role: 'value',
    });

    if (includeComparison) {
      columns.push({
        key: `${metric.alias}__previous_period`,
        label: `${metric.alias === metric.definition.id ? metric.definition.name : metric.alias} (período anterior)`,
        type: 'metric',
        format: metric.definition.format,
        role: 'comparison',
      });
    }
  }

  return columns;
}

function collectMetricDefinitions(query: ValidatedAnalysisQuery) {
  return query.metrics.map(
    (metric: ValidatedAnalysisQuery['metrics'][number]) => metric.definition,
  );
}

function computeFreshness(documents: LoadedDocuments) {
  let latest: number | null = null;

  for (const [entityType, docs] of Object.entries(documents) as Array<
    [DatasetEntityType, readonly AnalyticsDocument[] | undefined]
  >) {
    for (const field of TIMESTAMP_FIELDS_BY_ENTITY_TYPE[entityType]) {
      for (const document of docs ?? []) {
        const value = getDocumentValue(document, field);
        if (typeof value !== 'string') {
          continue;
        }

        const timestamp = Date.parse(value);
        if (Number.isNaN(timestamp)) {
          continue;
        }

        latest = latest === null ? timestamp : Math.max(latest, timestamp);
      }
    }
  }

  return latest === null ? 'unknown' : new Date(latest).toISOString();
}

function computeDefaultQualityScore(metricDefinitions: readonly MetricDefinition[]) {
  if (metricDefinitions.length === 0) {
    return 1;
  }

  return Math.min(...metricDefinitions.map((metric) => metric.qualityThreshold));
}

function cloneWithExecutionMs(
  result: AnalyticsExecutionResult,
  executionMs: number,
): AnalyticsExecutionResult {
  const cloned = structuredClone(result);
  cloned.metadata.executionMs = executionMs;
  return cloned;
}

function applyVisualizationAndLimit(
  query: ValidatedAnalysisQuery,
  rows: Array<Record<string, unknown>>,
  recommendation: VisualizationRecommendation,
) {
  const effectiveSorting = query.sorting?.length ? query.sorting : recommendation.shouldSortBy;
  const sortedRows = applySorting(rows, effectiveSorting, query);
  const effectiveLimit = Math.min(
    query.limit ?? Number.POSITIVE_INFINITY,
    recommendation.appliedLimit ?? Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(effectiveLimit) ? sortedRows.slice(0, effectiveLimit) : sortedRows;
}

/** Shared pure analytics pipeline reused by the local and cloud engines. */
export async function executeAnalyticsPipeline(
  input: ExecuteAnalyticsPipelineInput,
): Promise<AnalyticsExecutionResult> {
  const clock = input.clock ?? (() => new Date());
  const startedAt = clock().getTime();
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;
  const window = resolveDateRangeInternal(input.query.dateRange, {
    referenceDate: input.referenceDate,
    timeZone,
  });

  const currentState: MutableExecutionState = {
    warningSet: new Set<string>(),
    metricMemo: new Map(),
    dependencyMemo: new Map(),
  };

  const metricContext: MetricContext = {
    query: input.query,
    documents: input.documents,
    window,
    timeZone,
    state: currentState,
  };

  const metricSelections = input.query.metrics.map(toResolvedMetricLike);
  const currentRowsMap = mergeMetricGroups(metricSelections, metricContext);

  let comparisonRowsMap: Map<string, GroupRow> | undefined;
  if (input.query.comparison?.type === 'PREVIOUS_PERIOD') {
    const previousState: MutableExecutionState = {
      warningSet: currentState.warningSet,
      metricMemo: new Map(),
      dependencyMemo: new Map(),
    };
    comparisonRowsMap = mergeMetricGroups(metricSelections, {
      ...metricContext,
      window: computePreviousPeriodWindow(window),
      state: previousState,
    });
  }

  const preVisualizationRows = rowsFromGroupMap(currentRowsMap, input.query, comparisonRowsMap);
  const recommendation = recommendVisualization(input.query, preVisualizationRows);
  const rows = applyVisualizationAndLimit(input.query, preVisualizationRows, recommendation);

  if (rows.length === 0) {
    currentState.warningSet.add('Nenhum dado encontrado para o recorte solicitado.');
  }

  const metricDefinitions = collectMetricDefinitions(input.query);
  const qualityScore = input.qualityProvider
    ? await input.qualityProvider({
        query: input.query,
        documents: input.documents,
        metricDefinitions,
      })
    : computeDefaultQualityScore(metricDefinitions);

  return {
    columns: buildColumns(input.query, input.query.comparison?.type === 'PREVIOUS_PERIOD'),
    rows,
    visualization: recommendation,
    metadata: {
      queryId: input.queryId,
      executionMs: clock().getTime() - startedAt,
      rowCount: rows.length,
      freshness: computeFreshness(input.documents),
      qualityScore,
      metricDefinitions,
      warnings: currentState.warningSet.size > 0 ? [...currentState.warningSet] : undefined,
    },
  };
}

/** Collects the minimal field set needed to execute a validated query. */
export function collectExecutionFields(query: ValidatedAnalysisQuery) {
  const fieldsByEntityType = new Map<DatasetEntityType, Set<string>>();

  const addField = (entityType: DatasetEntityType, field: string) => {
    const current = fieldsByEntityType.get(entityType);
    if (current) {
      current.add(field);
      return;
    }

    fieldsByEntityType.set(entityType, new Set([...DEFAULT_ENTITY_FIELDS[entityType], field]));
  };

  for (const field of query.requiredSourceFields) {
    addField(field.entityType, field.field);
  }

  for (const metric of query.metrics.map(toResolvedMetricLike)) {
    addField(metric.baseEntity, 'id');
    addField(metric.baseEntity, metric.definition.timeField);
    for (const field of metric.sourceFields) {
      addField(field.entityType, field.field);
    }

    for (const bakedFilter of metric.definition.bakedFilters ?? []) {
      const dimension = getDimensionDefinition(bakedFilter.field) as
        | ({
            sourceFields: readonly { entityType: DatasetEntityType; field: string }[];
          } & DimensionDefinition)
        | undefined;

      for (const field of dimension?.sourceFields ?? []) {
        addField(field.entityType, field.field);
      }
    }
  }

  for (const dimension of query.dimensions) {
    for (const field of dimension.sourceFields) {
      addField(field.entityType, field.field);
    }
  }

  for (const filter of query.filters) {
    for (const field of filter.sourceFields) {
      addField(field.entityType, field.field);
    }
  }

  return new Map(
    [...fieldsByEntityType.entries()].map(([entityType, fields]) => [
      entityType,
      new Set([...fields]),
    ]),
  );
}

function resolveExecutionContext(
  query: ValidatedAnalysisQuery,
  resolver: AnalyticsContextResolver | undefined,
): QueryExecutionContext {
  const resolved = resolver?.(query);
  return {
    accessScope: resolved?.accessScope ?? 'global',
    userId: resolved?.userId ?? query.spec.metadata?.createdBy ?? 'anonymous',
    companyId: resolved?.companyId ?? null,
  };
}

async function emitAudit(
  sink: AnalyticsAuditSink | undefined,
  clock: () => Date,
  query: ValidatedAnalysisQuery,
  queryId: string,
  context: QueryExecutionContext,
  executionMs: number,
  status: AuditLogEntry['status'],
  errorMessage?: string,
) {
  if (!sink) {
    return;
  }

  const timestamp = clock().toISOString();
  await sink({
    id: `audit-${queryId}-${timestamp}`,
    queryId,
    userId: context.userId,
    companyId: context.companyId,
    timestamp,
    metrics: query.metrics.map(
      (metric: ValidatedAnalysisQuery['metrics'][number]) => metric.definition.id,
    ),
    dimensions: query.dimensions.map(
      (dimension: ValidatedAnalysisQuery['dimensions'][number]) => dimension.definition.id,
    ),
    filters: query.spec.filters,
    executionMs,
    status,
    errorMessage,
  });
}

abstract class BaseAnalyticsQueryEngine implements AnalyticsQueryEngine {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly clock: () => Date;
  private readonly timeZone: string;
  private readonly cacheTtlMs: number;

  protected constructor(private readonly options: AnalyticsEngineOptions = {}) {
    this.clock = getClock(options);
    this.timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async execute(query: ValidatedAnalysisQuery): Promise<AnalyticsExecutionResult> {
    const startedAt = this.clock().getTime();
    const referenceDate = getReferenceDate(this.options);
    const context = resolveExecutionContext(query, this.options.contextResolver);
    const queryId = sha256(`${stableStringify(query.spec)}:${context.accessScope}`);
    const cacheEntry = this.cache.get(queryId);

    if (cacheEntry && cacheEntry.expiresAt > startedAt) {
      const result = cloneWithExecutionMs(cacheEntry.result, this.clock().getTime() - startedAt);
      await emitAudit(
        this.options.onAudit,
        this.clock,
        query,
        queryId,
        context,
        result.metadata.executionMs,
        'SUCCESS',
      );
      return result;
    }

    const fieldsByEntityType = collectExecutionFields(query);
    const entityTypes = [...fieldsByEntityType.keys()];
    const window = resolveDateRangeInternal(query.dateRange, {
      referenceDate,
      timeZone: this.timeZone,
    });

    try {
      const documents = await this.loadDocuments({
        query,
        entityTypes,
        fieldsByEntityType,
        window,
      });

      const result = await executeAnalyticsPipeline({
        query,
        documents,
        queryId,
        referenceDate,
        timeZone: this.timeZone,
        clock: this.clock,
        qualityProvider: this.options.qualityProvider,
      });

      this.cache.set(queryId, {
        expiresAt: this.clock().getTime() + this.cacheTtlMs,
        result: structuredClone(result),
      });

      await emitAudit(
        this.options.onAudit,
        this.clock,
        query,
        queryId,
        context,
        result.metadata.executionMs,
        'SUCCESS',
      );

      return result;
    } catch (error) {
      const executionMs = this.clock().getTime() - startedAt;
      await emitAudit(
        this.options.onAudit,
        this.clock,
        query,
        queryId,
        context,
        executionMs,
        'ERROR',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  protected abstract loadDocuments(
    request: AnalyticsDocumentLoaderRequest,
  ): Promise<LoadedDocuments>;
}

function bundleToLoadedDocuments(
  bundle: DatasetBundle,
  entityTypes: readonly DatasetEntityType[],
): LoadedDocuments {
  const documents: LoadedDocuments = {};

  for (const entityType of entityTypes) {
    const bundleKey = ENTITY_TYPE_TO_BUNDLE_KEY[entityType];
    documents[entityType] = bundle[bundleKey] as unknown as readonly AnalyticsDocument[];
  }

  return documents;
}

/** In-memory implementation that reuses the shared pipeline over the deterministic dataset bundle. */
export class InMemoryAnalyticsQueryEngine extends BaseAnalyticsQueryEngine {
  private readonly bundle?: DatasetBundle;
  private readonly documentLoader?: AnalyticsDocumentLoader;

  constructor(options: InMemoryAnalyticsQueryEngineOptions) {
    super(options);
    this.bundle = options.bundle;
    this.documentLoader = options.documentLoader;
  }

  protected async loadDocuments(request: AnalyticsDocumentLoaderRequest): Promise<LoadedDocuments> {
    if (this.documentLoader) {
      return this.documentLoader(request);
    }

    if (!this.bundle) {
      throw new Error('InMemoryAnalyticsQueryEngine requires either `bundle` or `documentLoader`.');
    }

    return bundleToLoadedDocuments(this.bundle, request.entityTypes);
  }
}

function buildProjectionExpression(fields: readonly string[]) {
  const expressionAttributeNames: Record<string, string> = {
    '#pk': 'PK',
    '#document': 'document',
  };
  const projectionParts = ['#pk'];

  for (const [index, field] of fields.entries()) {
    const fieldKey = `#field${index}`;
    expressionAttributeNames[fieldKey] = field;
    projectionParts.push(`#document.${fieldKey}`);
  }

  return {
    ProjectionExpression: projectionParts.join(', '),
    ExpressionAttributeNames: expressionAttributeNames,
  };
}

function extractProjectedDocument(item: Record<string, unknown>): AnalyticsDocument {
  const document = item.document;
  if (document && typeof document === 'object' && !Array.isArray(document)) {
    return document as AnalyticsDocument;
  }

  return item;
}

/** Cloud implementation that uses DynamoDB partition queries and then reuses the same pure aggregation core. */
export class DynamoDBAnalyticsQueryEngine extends BaseAnalyticsQueryEngine {
  constructor(private readonly config: DynamoDBAnalyticsQueryEngineOptions) {
    super(config);
  }

  protected async loadDocuments(request: AnalyticsDocumentLoaderRequest): Promise<LoadedDocuments> {
    const documents: LoadedDocuments = {};

    for (const entityType of request.entityTypes) {
      const requestedFields = [
        ...(request.fieldsByEntityType.get(entityType) ?? new Set<string>()),
      ].sort();
      const projection = buildProjectionExpression(requestedFields);
      const items: AnalyticsDocument[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const response = await this.config.client.send(
          new QueryCommand({
            TableName: this.config.tableName,
            KeyConditionExpression: '#pk = :pk',
            ExpressionAttributeNames: projection.ExpressionAttributeNames,
            ExpressionAttributeValues: {
              ':pk': `ENTITY#${entityType}`,
            },
            ProjectionExpression: projection.ProjectionExpression,
            ExclusiveStartKey: lastEvaluatedKey,
          }),
        );

        for (const item of response.Items ?? []) {
          items.push(extractProjectedDocument(item));
        }

        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      documents[entityType] = items;
    }

    return documents;
  }
}

export {
  INSIGHT_TYPES,
  formatInsightValue,
  generateInsights,
  isLowerBetterMetric,
  type AnalyticsInsight,
  type GenerateInsightsInput,
  type InsightType,
} from './insights';

export {
  AUDIENCE_FIELDS,
  AudienceRuleError,
  buildAudienceProfiles,
  evaluateAudience,
  listAudienceFieldOptions,
  previewAudience,
  validateAudienceRules,
  type AudienceDataset,
  type AudienceFieldDefinition,
  type AudienceFieldType,
  type AudienceProfile,
} from './audience';

export {
  AthenaCompilationError,
  BASE_METRIC_SQL,
  DIMENSION_COLUMNS,
  GOLD_TABLES,
  compileAthenaQuery,
  toParameterLiteral,
  type CompiledAthenaQuery,
  type CompiledColumn,
  type CompiledJoin,
} from './athena/compiler';

export { planMeshExecution, type MeshExecutionPlan } from './mesh-plan';
export { buildMeshRows, toFullStoryRow, type MeshRow } from './mesh-rows';
