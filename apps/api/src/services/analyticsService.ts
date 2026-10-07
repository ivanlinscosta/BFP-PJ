import {
  generateInsights,
  planMeshExecution,
  type AnalyticsExecutionResult,
} from '@bfp/analytics-engine';
import type { AnalysisSpec, MediaCampaign } from '@bfp/domain';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';
import { resolveDimensionValueLabel, validateAnalysisSpec } from '@bfp/semantic-layer';
import { assertDomainAccess } from '@api/auth/rbac';
import type { AuthenticatedUser } from '@api/auth/types';
import { throwSemanticValidationError } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** pt-BR label for temporal buckets: 2026-09 → set/26, 2026-09-14 → 14/09/26. */
function formatTimeBucket(raw: string) {
  const month = /^(\d{4})-(\d{2})$/.exec(raw);
  if (month) {
    return `${MONTHS[Number(month[2]) - 1]}/${month[1]!.slice(2)}`;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (day) {
    return `${day[3]}/${day[2]}/${day[1]!.slice(2)}`;
  }
  return raw;
}

/** Business labels for every dimension value present in the result (no row-level data added). */
async function buildValueLabels(context: ApiContext, result: AnalyticsExecutionResult) {
  const labels: Record<string, Record<string, string>> = {};
  const dimensionColumns = result.columns.filter((column) => column.type === 'dimension');
  const dimensionKeys = dimensionColumns.map((column) => column.key);
  const temporalKeys = new Set(
    dimensionColumns.filter((column) => column.role === 'time').map((column) => column.key),
  );
  const campaignNames = dimensionKeys.includes('acquisition_campaign')
    ? new Map(
        (await context.getDatasetRepository().listByType<MediaCampaign>('campaign')).map(
          (campaign) => [campaign.id, campaign.name],
        ),
      )
    : new Map<string, string>();

  for (const key of dimensionKeys) {
    const entries: Record<string, string> = {};
    for (const row of result.rows) {
      const raw = String(row[key] ?? '');
      entries[raw] = temporalKeys.has(key)
        ? formatTimeBucket(raw)
        : key === 'acquisition_campaign'
          ? (campaignNames.get(raw) ?? (raw || 'Sem campanha'))
          : resolveDimensionValueLabel(key, row[key]);
    }
    labels[key] = entries;
  }

  return labels;
}

/**
 * Single governed execution path: semantic validation → RBAC by domain → engine →
 * value labels → deterministic insights. Used by the HTTP route and by AI tools.
 */
export async function executeGovernedQuery(
  context: ApiContext,
  auth: AuthenticatedUser,
  spec: AnalysisSpec,
  correlationId?: string,
) {
  const semanticValidation = validateAnalysisSpec({
    ...spec,
    metadata: { ...spec.metadata, createdBy: auth.userId },
  });

  if (!semanticValidation.ok || !semanticValidation.resolvedQuery) {
    throwSemanticValidationError(semanticValidation.errors);
  }

  const resolvedQuery = semanticValidation.resolvedQuery;
  const domains = [
    ...new Set([
      ...resolvedQuery.metrics.map(
        (metric: ValidatedAnalysisQuery['metrics'][number]) => metric.definition.domain,
      ),
      ...resolvedQuery.dimensions.map(
        (dimension: ValidatedAnalysisQuery['dimensions'][number]) => dimension.definition.domain,
      ),
      ...resolvedQuery.filters.map(
        (filter: ValidatedAnalysisQuery['filters'][number]) => filter.definition.domain,
      ),
    ]),
  ];
  assertDomainAccess(auth.role, domains);

  const startedAt = performance.now();
  const result = await context.getAnalyticsEngine(auth).execute(resolvedQuery);
  const valueLabels = await buildValueLabels(context, result);
  const insights = generateInsights({
    result,
    labelFor: (key, value) => valueLabels[key]?.[String(value ?? '')] ?? String(value ?? '—'),
  });

  context.logger.info('analytics_query_executed', {
    correlationId,
    userId: auth.userId,
    operation: 'ANALYTICS_QUERY',
    queryId: result.metadata.queryId,
    engine: context.config.analyticsEngine,
    durationMs: Math.round(performance.now() - startedAt),
    rowCount: result.metadata.rowCount,
    status: 'success',
  });

  return {
    ...result,
    metadata: { ...result.metadata, plan: planMeshExecution(resolvedQuery) },
    insights,
    valueLabels,
  };
}

/** Response type of the governed query path. */
export type GovernedQueryResult = Awaited<ReturnType<typeof executeGovernedQuery>>;
