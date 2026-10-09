/**
 * Zod schemas for the API contracts shared across the monorepo.
 */

import {
  ACTIVATION_DESTINATIONS,
  COMPARISON_TYPES,
  DATE_GRANULARITIES,
  LOGICAL_OPERATORS,
  OBJECT_TYPES,
  SHARING_LEVELS,
  SORT_DIRECTIONS,
  USER_ROLES,
  VISUALIZATION_TYPES,
  type AnalysisSpec,
  type AudienceRule,
  type AudienceRuleGroup,
} from '@bfp/domain';
import { z } from 'zod';

const nonEmptyTrimmedString = z.string().trim().min(1);
const scalarFilterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

/** Optional allowlists used to tighten AnalysisSpec validation. */
export interface AnalysisSpecSchemaOptions {
  knownMetricIds?: readonly string[];
  knownDimensionIds?: readonly string[];
}

function buildKnownIdSchema(
  label: string,
  ids: readonly string[] | undefined,
): z.ZodType<string, string> {
  return nonEmptyTrimmedString.superRefine((value, context) => {
    if (ids && ids.length > 0 && !ids.includes(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown ${label}: ${value}`,
      });
    }
  });
}

/** Schema for a metric selection entry. */
export function createMetricSelectionSchema(options: AnalysisSpecSchemaOptions = {}) {
  return z.object({
    id: buildKnownIdSchema('metric id', options.knownMetricIds),
    alias: nonEmptyTrimmedString.optional(),
  });
}

/** Schema for a dimension selection entry. */
export function createDimensionSelectionSchema(options: AnalysisSpecSchemaOptions = {}) {
  return z.object({
    id: buildKnownIdSchema('dimension id', options.knownDimensionIds),
    granularity: z.enum(DATE_GRANULARITIES).optional(),
  });
}

const unaryFilterConditionSchema = z.object({
  field: nonEmptyTrimmedString,
  operator: z.enum(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS']),
  value: scalarFilterValueSchema,
});

const setFilterConditionSchema = z.object({
  field: nonEmptyTrimmedString,
  operator: z.enum(['IN', 'NOT_IN']),
  value: z.array(scalarFilterValueSchema).min(1),
});

const betweenFilterConditionSchema = z.object({
  field: nonEmptyTrimmedString,
  operator: z.literal('BETWEEN'),
  value: z.tuple([scalarFilterValueSchema, scalarFilterValueSchema]),
});

const nullaryFilterConditionSchema = z.object({
  field: nonEmptyTrimmedString,
  operator: z.enum(['IS_NULL', 'IS_NOT_NULL']),
});

/** Schema for any supported filter condition. */
export const filterConditionSchema = z.union([
  unaryFilterConditionSchema,
  setFilterConditionSchema,
  betweenFilterConditionSchema,
  nullaryFilterConditionSchema,
]);

const presetDateRangeTypeSchema = z.enum([
  'TODAY',
  'YESTERDAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'LAST_90_DAYS',
  'LAST_120_DAYS',
  'THIS_MONTH',
  'LAST_MONTH',
  'THIS_QUARTER',
  'LAST_QUARTER',
  'THIS_YEAR',
  'LAST_YEAR',
  'ALL_TIME',
]);

const lastNDaysDateRangeSchema = z.object({
  type: z.literal('LAST_N_DAYS'),
  value: z.number().int().positive(),
});

const customDateRangeSchema = z
  .object({
    type: z.literal('CUSTOM'),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .superRefine((value, context) => {
    if (new Date(value.from).getTime() > new Date(value.to).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: '`from` must be less than or equal to `to`.',
      });
    }
  });

const presetDateRangeSchema = z.object({
  type: presetDateRangeTypeSchema,
});

/** Schema for date range definitions. */
export const dateRangeSpecSchema = z.union([
  lastNDaysDateRangeSchema,
  customDateRangeSchema,
  presetDateRangeSchema,
]);

/** Schema for comparison rules. */
export const comparisonSpecSchema = z.object({
  type: z.enum(COMPARISON_TYPES),
});

/** Schema for sorting rules. */
export const sortSpecSchema = z.object({
  field: nonEmptyTrimmedString,
  direction: z.enum(SORT_DIRECTIONS),
});

/** Schema for visualization preferences. */
export const visualizationSettingsSchema = z
  .object({
    orientation: z.enum(['HORIZONTAL', 'VERTICAL']).optional(),
    stacking: z.enum(['NONE', 'STACKED', 'PERCENT']).optional(),
    showValues: z.boolean().optional(),
    showLegend: z.boolean().optional(),
    showTable: z.boolean().optional(),
    showGrid: z.boolean().optional(),
    showPoints: z.boolean().optional(),
    smooth: z.boolean().optional(),
    showPercent: z.boolean().optional(),
    trendLine: z.boolean().optional(),
    sort: z.enum(['ASC', 'DESC', 'NONE', 'LABEL']).optional(),
    topN: z.number().int().min(1).max(500).optional(),
    normalize: z.boolean().optional(),
    xAxis: z.string().max(100).optional(),
    yAxis: z.string().max(100).optional(),
    series: z.string().max(100).optional(),
    size: z.string().max(100).optional(),
    colorBy: z.string().max(100).optional(),
    mapLevel: z.enum(['UF', 'REGION']).optional(),
    bins: z.number().int().min(2).max(100).optional(),
    innerRadius: z.number().min(0).max(90).optional(),
    conditional: z.boolean().optional(),
  })
  .strip();

export const visualizationSpecSchema = z.object({
  type: z.enum(VISUALIZATION_TYPES),
  mode: z.enum(['AUTO', 'MANUAL']).optional(),
  settings: visualizationSettingsSchema.optional(),
});

/** Schema for the AnalysisSpec metadata block. */
export const analysisMetadataSchema = z.object({
  createdBy: nonEmptyTrimmedString.optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(SHARING_LEVELS).optional(),
  ownerName: nonEmptyTrimmedString.optional(),
  team: nonEmptyTrimmedString.optional(),
});

/** Schema for sharing levels of saved objects. */
export const sharingLevelSchema = z.enum(SHARING_LEVELS);

const audienceRuleBaseSchema = z.object({
  kind: z.literal('rule'),
  id: nonEmptyTrimmedString,
});

/** Schema for a single audience rule (a governed filter condition with an id). */
export const audienceRuleSchema = z.union([
  audienceRuleBaseSchema.extend({
    field: nonEmptyTrimmedString,
    operator: z.enum(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'CONTAINS']),
    value: scalarFilterValueSchema,
  }),
  audienceRuleBaseSchema.extend({
    field: nonEmptyTrimmedString,
    operator: z.enum(['IN', 'NOT_IN']),
    value: z.array(scalarFilterValueSchema).min(1),
  }),
]);

/** Recursive schema for AND/OR audience rule groups (max depth enforced by the API). */
export const audienceRuleGroupSchema: z.ZodType<AudienceRuleGroup> = z.lazy(() =>
  z.object({
    kind: z.literal('group'),
    id: nonEmptyTrimmedString,
    operator: z.enum(LOGICAL_OPERATORS),
    rules: z
      .array(z.union([audienceRuleSchema, audienceRuleGroupSchema]))
      .max(30)
      .transform((rules) => rules as Array<AudienceRule | AudienceRuleGroup>),
  }),
);

/** Schema for structured AnalysisSpec operations proposed by the AI or the UI. */
const analysisOperationUnion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ADD_METRIC'), metricId: nonEmptyTrimmedString }),
  z.object({ type: z.literal('REMOVE_METRIC'), metricId: nonEmptyTrimmedString }),
  z.object({
    type: z.literal('ADD_DIMENSION'),
    dimensionId: nonEmptyTrimmedString,
    granularity: z.enum(DATE_GRANULARITIES).optional(),
  }),
  z.object({ type: z.literal('REMOVE_DIMENSION'), dimensionId: nonEmptyTrimmedString }),
  z.object({ type: z.literal('ADD_FILTER'), filter: filterConditionSchema }),
  z.object({ type: z.literal('REMOVE_FILTER'), field: nonEmptyTrimmedString }),
  z.object({ type: z.literal('SET_DATE_RANGE'), dateRange: dateRangeSpecSchema }),
  z.object({ type: z.literal('SET_VISUALIZATION'), visualization: z.enum(VISUALIZATION_TYPES) }),
  z.object({
    type: z.literal('SORT'),
    field: nonEmptyTrimmedString,
    direction: z.enum(SORT_DIRECTIONS),
  }),
  z.object({
    type: z.literal('SET_COMPARISON'),
    comparison: z.enum(COMPARISON_TYPES),
  }),
  z.object({ type: z.literal('ADD_DATASET'), datasetId: nonEmptyTrimmedString }),
  z.object({ type: z.literal('REMOVE_DATASET'), datasetId: nonEmptyTrimmedString }),
  z.object({ type: z.literal('CLEAR') }),
]);

/**
 * Operation accepted from the UI and the AI. SET_VISUALIZATION may be written with
 * `visualizationType` (the AI's spelling) instead of `visualization`.
 */
export const analysisOperationSchema = z.preprocess(
  (value) =>
    value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'SET_VISUALIZATION' &&
    'visualizationType' in value &&
    !('visualization' in value)
      ? { ...value, visualization: (value as { visualizationType: unknown }).visualizationType }
      : value,
  analysisOperationUnion,
);

/** Schema for activation requests of a saved audience. */
export const activationRequestSchema = z.object({
  destination: z.enum(ACTIVATION_DESTINATIONS),
});

/** Schema factory for the central AnalysisSpec contract. */
export function createAnalysisSpecSchema(options: AnalysisSpecSchemaOptions = {}) {
  return z
    .object({
      id: nonEmptyTrimmedString.optional(),
      name: nonEmptyTrimmedString.optional(),
      datasets: z.array(nonEmptyTrimmedString).max(10).optional(),
      metrics: z.array(createMetricSelectionSchema(options)).min(1),
      dimensions: z.array(createDimensionSelectionSchema(options)).default([]),
      filters: z.array(filterConditionSchema).default([]),
      dateRange: dateRangeSpecSchema.optional(),
      comparison: comparisonSpecSchema.optional(),
      sorting: z.array(sortSpecSchema).optional(),
      limit: z.number().int().positive().optional(),
      visualization: visualizationSpecSchema,
      metadata: analysisMetadataSchema.optional(),
    })
    .transform((value) => value as AnalysisSpec);
}

/** Default schema for AnalysisSpec without semantic allowlists. */
export const analysisSpecSchema = createAnalysisSpecSchema();

/** Schema for authentication requests. */
export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/** Schema for the authenticated user payload. */
export const authUserSchema = z.object({
  id: nonEmptyTrimmedString,
  email: z.email(),
  role: z.enum(USER_ROLES),
  groups: z.array(z.enum(USER_ROLES)).min(1),
  name: nonEmptyTrimmedString.optional(),
  team: nonEmptyTrimmedString.optional(),
});

/** Schema for authentication responses. */
export const loginResponseSchema = z.object({
  accessToken: nonEmptyTrimmedString,
  idToken: nonEmptyTrimmedString.optional(),
  refreshToken: nonEmptyTrimmedString.optional(),
  expiresIn: z.number().int().nonnegative(),
  tokenType: z.literal('Bearer'),
  user: authUserSchema,
});

/** Schema for the API health response. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('bfp-api'),
  authMode: z.enum(['dev', 'cognito']),
  time: z.iso.datetime(),
});

/** Schema for the normalized API error envelope. */
export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: nonEmptyTrimmedString,
    message: nonEmptyTrimmedString,
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** Schema for persisted object identifiers. */
export const objectReferenceSchema = z.object({
  type: z.enum(OBJECT_TYPES),
  id: nonEmptyTrimmedString,
});

/** Authentication request payload type. */
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Authentication response payload type. */
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Authenticated user payload type. */
export type AuthUser = z.infer<typeof authUserSchema>;

/** API health payload type. */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Normalized API error envelope type. */
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

/** Persisted object reference type. */
export type ObjectReference = z.infer<typeof objectReferenceSchema>;
