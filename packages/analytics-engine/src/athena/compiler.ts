import type { DateGranularity, FilterCondition, ScalarFilterValue } from '@bfp/domain';
import {
  MESH_DATASETS,
  MESH_JOIN_KEY,
  datasetForDimension,
  getMetricDefinition,
  type MeshDatasetId,
} from '@bfp/semantic-layer';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';

/**
 * Controlled Athena (Trino) SQL compiler over the AWS data mesh.
 *
 * Each mesh data product is a normalized table in its own domain database. A metric is computed
 * on its fact table (alias `f`); company attributes come from Customer 360 (alias `c`) through an
 * explicit JOIN on company_id, only when the user selected that dataset. Every identifier comes
 * from the whitelists below; user values travel as ExecutionParameters and output columns are
 * aliased c0..cn.
 */

/** Physical columns per mesh dataset, keyed by governed dimension id. */
export const DIMENSION_COLUMNS: Record<MeshDatasetId, Record<string, string>> = {
  customer_360: {
    segment: 'segment',
    industry: 'industry',
    company_size: 'company_size',
    state: 'state',
    region: 'region',
    acquisition_source: 'acquisition_source',
    acquisition_channel: 'acquisition_channel',
    acquisition_campaign: 'acquisition_campaign_id',
    company_status: 'company_status',
    lead_date: 'lead_created_at',
    account_opened_date: 'account_opened_at',
    onboarding_completed_date: 'onboarding_completed_at',
    activation_date: 'activation_date',
  },
  media_touchpoints: {
    touchpoint_date: 'occurred_at',
    campaign_channel: 'channel',
    campaign_objective: 'campaign_objective',
  },
  company_products: {
    product: 'product_name',
    product_category: 'product_category',
    contracted_date: 'contracted_at',
  },
  conversations: { conversation_status: 'status', conversation_channel: 'channel' },
  crm_interactions: {},
  digital_journey: {},
  app_navigation: {
    app_screen: 'screen',
    app_action: 'action',
    app_platform: 'platform',
    app_event_date: 'occurred_at',
  },
  transactions: {
    transaction_type: 'transaction_type',
    transaction_channel: 'channel',
    transaction_date: 'occurred_at',
  },
  nps_responses: { nps_touchpoint: 'touchpoint', nps_date: 'responded_at' },
};

/** Gold tables per mesh dataset (kept for documentation and the lake loader). */
export const GOLD_TABLES: Record<MeshDatasetId, string> = Object.fromEntries(
  MESH_DATASETS.map((dataset) => [dataset.id, dataset.table]),
) as Record<MeshDatasetId, string>;

const TIMESTAMP_COLUMNS = new Set([
  'lead_created_at',
  'account_opened_at',
  'onboarding_started_at',
  'onboarding_completed_at',
  'activation_date',
  'occurred_at',
  'contracted_at',
  'started_at',
  'created_at',
  'responded_at',
]);

interface BaseMetricSql {
  dataset: MeshDatasetId;
  /** Time column on the fact table. */
  time: string;
  /** Aggregation over the fact (`f.`) and, when joined, Customer 360 (`c.`). */
  expression: string;
  where?: string;
  /** The predicate/expression reads Customer 360 columns, so the JOIN is mandatory. */
  needsCompany?: boolean;
}

/** Whitelisted SQL for every non-ratio governed metric. Ratios are composed from these. */
export const BASE_METRIC_SQL: Record<string, BaseMetricSql> = {
  companies_total: {
    dataset: 'customer_360',
    time: 'created_at',
    expression: 'COUNT(DISTINCT f.company_id)',
  },
  new_companies: {
    dataset: 'customer_360',
    time: 'onboarding_completed_at',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: 'f.onboarding_completed_at IS NOT NULL',
  },
  leads: {
    dataset: 'customer_360',
    time: 'lead_created_at',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: 'f.lead_created_at IS NOT NULL',
  },
  converted_leads: {
    dataset: 'customer_360',
    time: 'lead_created_at',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: 'f.account_opened_at IS NOT NULL',
  },
  accounts_opened: {
    dataset: 'customer_360',
    time: 'account_opened_at',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: 'f.account_opened_at IS NOT NULL',
  },
  onboarding_started: {
    dataset: 'customer_360',
    time: 'onboarding_started_at',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: 'f.onboarding_started_at IS NOT NULL',
  },
  onboarding_completed: {
    dataset: 'customer_360',
    time: 'onboarding_completed_at',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: 'f.onboarding_completed_at IS NOT NULL',
  },
  activation_d30: {
    dataset: 'customer_360',
    time: 'activation_date',
    expression: 'COUNT(DISTINCT f.company_id)',
    where:
      "f.activation_date IS NOT NULL AND date_diff('day', f.account_opened_at, f.activation_date) <= 30",
  },
  active_companies: {
    dataset: 'customer_360',
    time: 'activation_date',
    expression: 'COUNT(DISTINCT f.company_id)',
    where: "f.company_status = 'ACTIVE'",
  },
  average_opening_time: {
    dataset: 'customer_360',
    time: 'account_opened_at',
    expression: "AVG(CAST(date_diff('day', f.lead_created_at, f.account_opened_at) AS DOUBLE))",
  },
  average_onboarding_time: {
    dataset: 'customer_360',
    time: 'onboarding_completed_at',
    expression:
      "AVG(CAST(date_diff('day', f.onboarding_started_at, f.onboarding_completed_at) AS DOUBLE))",
  },
  media_spend: { dataset: 'media_touchpoints', time: 'occurred_at', expression: 'SUM(f.cost)' },
  impressions: {
    dataset: 'media_touchpoints',
    time: 'occurred_at',
    expression: 'SUM(f.impressions)',
  },
  clicks: { dataset: 'media_touchpoints', time: 'occurred_at', expression: 'SUM(f.clicks)' },
  products_per_company: {
    dataset: 'company_products',
    time: 'contracted_at',
    expression: 'CAST(COUNT(*) AS DOUBLE) / NULLIF(COUNT(DISTINCT f.company_id), 0)',
    where: "f.status <> 'CANCELLED' AND c.company_status <> 'LEAD'",
    needsCompany: true,
  },
  revenue_proxy: {
    dataset: 'company_products',
    time: 'contracted_at',
    expression: 'SUM(f.monthly_revenue_proxy)',
    where: 'f.product_name IS NOT NULL',
  },
  app_interactions: { dataset: 'app_navigation', time: 'occurred_at', expression: 'COUNT(*)' },
  app_sessions: {
    dataset: 'app_navigation',
    time: 'occurred_at',
    expression: 'COUNT(DISTINCT f.session_id)',
  },
  app_active_companies: {
    dataset: 'app_navigation',
    time: 'occurred_at',
    expression: 'COUNT(DISTINCT f.company_id)',
  },
  app_avg_screen_time: {
    dataset: 'app_navigation',
    time: 'occurred_at',
    expression: 'AVG(CAST(f.duration_seconds AS DOUBLE))',
  },
  app_errors: {
    dataset: 'app_navigation',
    time: 'occurred_at',
    expression: 'COUNT(*)',
    where: "f.action = 'ERROR'",
  },
  transaction_volume: { dataset: 'transactions', time: 'occurred_at', expression: 'SUM(f.amount)' },
  transactions_count: { dataset: 'transactions', time: 'occurred_at', expression: 'COUNT(*)' },
  nps_responses: { dataset: 'nps_responses', time: 'responded_at', expression: 'COUNT(*)' },
  nps: {
    dataset: 'nps_responses',
    time: 'responded_at',
    expression:
      'CAST(100 * (COUNT_IF(f.score >= 9) - COUNT_IF(f.score <= 6)) AS DOUBLE) / NULLIF(COUNT(*), 0)',
  },
  unresolved_conversations: {
    dataset: 'conversations',
    time: 'started_at',
    expression: 'COUNT(*)',
    where: "f.status <> 'RESOLVED'",
  },
};

const OPERATOR_SQL: Record<FilterCondition['operator'], string> = {
  EQ: '=',
  NEQ: '<>',
  GT: '>',
  GTE: '>=',
  LT: '<',
  LTE: '<=',
  IN: 'IN',
  NOT_IN: 'NOT IN',
  BETWEEN: 'BETWEEN',
  CONTAINS: 'LIKE',
  IS_NULL: 'IS NULL',
  IS_NOT_NULL: 'IS NOT NULL',
};

/** Raised when a spec references something the Athena path does not support. */
export class AthenaCompilationError extends Error {}

/** Output column of the compiled query mapped back to the AnalyticsResult key. */
export interface CompiledColumn {
  sqlAlias: string;
  key: string;
  kind: 'dimension' | 'metric';
}

/** JOIN executed by the engine, exposed to the UI ("Bases: Mídia ⋈ Customer 360"). */
export interface CompiledJoin {
  left: MeshDatasetId;
  right: MeshDatasetId;
  key: string;
}

/** Compiled statement ready for StartQueryExecution. */
export interface CompiledAthenaQuery {
  sql: string;
  parameters: string[];
  columns: CompiledColumn[];
  datasets: MeshDatasetId[];
  joins: CompiledJoin[];
}

export interface CompileOptions {
  /** Fully qualified `database.table` for each mesh dataset. */
  resolveTable: (dataset: MeshDatasetId) => string;
  window: { from: string | null; to: string | null };
  timeZone?: string;
}

const QUALIFIED_TABLE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Renders a scalar as a Trino literal for ExecutionParameters (never concatenated into SQL). */
export function toParameterLiteral(value: ScalarFilterValue) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AthenaCompilationError('Valor numérico inválido em filtro.');
    }
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  return `'${value.replace(/'/g, "''")}'`;
}

/** Column reference for a dimension inside a fact CTE (`f.` own column or `c.` joined). */
function columnRef(fact: MeshDatasetId, dimensionId: string) {
  const owner = datasetForDimension(dimensionId);
  if (!owner) {
    throw new AthenaCompilationError(`Dimensão desconhecida: ${dimensionId}.`);
  }

  const column = DIMENSION_COLUMNS[owner][dimensionId];
  if (!column) {
    throw new AthenaCompilationError(`A dimensão ${dimensionId} não está publicada no data mesh.`);
  }

  if (owner === fact) {
    return { ref: `f.${column}`, column, joined: false };
  }

  if (owner === 'customer_360') {
    return { ref: `c.${column}`, column, joined: true };
  }

  throw new AthenaCompilationError(
    `A dimensão ${dimensionId} (${owner}) não pode ser cruzada com ${fact}.`,
  );
}

function dimensionExpression(
  fact: MeshDatasetId,
  dimensionId: string,
  granularity: DateGranularity | undefined,
  timeZone: string,
) {
  const { ref, column, joined } = columnRef(fact, dimensionId);
  if (!TIMESTAMP_COLUMNS.has(column)) {
    return { sql: ref, joined };
  }

  const local = `(${ref} AT TIME ZONE '${timeZone}')`;
  const format = granularity === 'month' ? '%Y-%m' : granularity === 'week' ? '%x-W%v' : '%Y-%m-%d';
  return { sql: `date_format(${local}, '${format}')`, joined };
}

function filterPredicate(fact: MeshDatasetId, filter: FilterCondition, parameters: string[]) {
  const { ref, column, joined } = columnRef(fact, filter.field);
  const operator = OPERATOR_SQL[filter.operator];
  const placeholder = () => (TIMESTAMP_COLUMNS.has(column) ? 'from_iso8601_timestamp(?)' : '?');

  if (filter.operator === 'IS_NULL' || filter.operator === 'IS_NOT_NULL') {
    return { sql: `${ref} ${operator}`, joined };
  }

  if (filter.operator === 'IN' || filter.operator === 'NOT_IN') {
    if (filter.value.length === 0 || filter.value.length > 100) {
      throw new AthenaCompilationError('Filtros de lista aceitam de 1 a 100 valores.');
    }
    filter.value.forEach((value) => parameters.push(toParameterLiteral(value)));
    return { sql: `${ref} ${operator} (${filter.value.map(placeholder).join(', ')})`, joined };
  }

  if (filter.operator === 'BETWEEN') {
    parameters.push(toParameterLiteral(filter.value[0]), toParameterLiteral(filter.value[1]));
    return { sql: `${ref} BETWEEN ${placeholder()} AND ${placeholder()}`, joined };
  }

  if (filter.operator === 'CONTAINS') {
    parameters.push(toParameterLiteral(`%${String(filter.value).replace(/[%_]/g, '')}%`));
    return { sql: `lower(${ref}) LIKE lower(?)`, joined };
  }

  if (!('value' in filter) || Array.isArray(filter.value)) {
    throw new AthenaCompilationError(`Operador ${filter.operator} sem valor válido.`);
  }

  parameters.push(toParameterLiteral(filter.value as ScalarFilterValue));
  return { sql: `${ref} ${operator} ${placeholder()}`, joined };
}

function expandBaseMetrics(metricId: string): string[] {
  const definition = getMetricDefinition(metricId);
  if (!definition) {
    throw new AthenaCompilationError(`Métrica desconhecida: ${metricId}.`);
  }

  if (definition.aggregation === 'RATIO') {
    return [
      ...expandBaseMetrics(definition.numerator),
      ...expandBaseMetrics(definition.denominator),
    ];
  }

  if (!BASE_METRIC_SQL[metricId]) {
    throw new AthenaCompilationError(`A métrica ${metricId} ainda não está disponível no Athena.`);
  }

  return [metricId];
}

/** Compiles a semantically validated query into parameterized Athena SQL with mesh joins. */
export function compileAthenaQuery(
  query: ValidatedAnalysisQuery,
  options: CompileOptions,
): CompiledAthenaQuery {
  const timeZone = options.timeZone ?? 'America/Sao_Paulo';
  const table = (dataset: MeshDatasetId) => {
    if (!query.datasets.includes(dataset)) {
      throw new AthenaCompilationError(`A base ${dataset} não foi selecionada para esta análise.`);
    }
    const qualified = options.resolveTable(dataset);
    if (!QUALIFIED_TABLE.test(qualified)) {
      throw new AthenaCompilationError('Nome de tabela inválido no data mesh.');
    }
    return qualified;
  };

  const baseMetricIds = [
    ...new Set(query.metrics.flatMap((metric) => expandBaseMetrics(metric.definition.id))),
  ];

  // One CTE per fact = (dataset, time column, static predicate).
  const facts = new Map<
    string,
    {
      dataset: MeshDatasetId;
      time: string;
      where?: string;
      needsCompany: boolean;
      metrics: string[];
    }
  >();
  for (const metricId of baseMetricIds) {
    const sql = BASE_METRIC_SQL[metricId]!;
    const key = `${sql.dataset}|${sql.time}|${sql.where ?? ''}`;
    const fact = facts.get(key) ?? {
      dataset: sql.dataset,
      time: sql.time,
      where: sql.where,
      needsCompany: Boolean(sql.needsCompany),
      metrics: [],
    };
    fact.metrics.push(metricId);
    facts.set(key, fact);
  }

  const parameters: string[] = [];
  const factEntries = [...facts.values()];
  const metricFact = new Map<string, number>();
  const dimensionAliases = query.dimensions.map((_, index) => `d${index}`);
  const joins: CompiledJoin[] = [];

  const ctes = factEntries.map((fact, factIndex) => {
    let joinCompany = fact.needsCompany && fact.dataset !== 'customer_360';
    const select = query.dimensions.map((dimension, index) => {
      const expression = dimensionExpression(
        fact.dataset,
        dimension.definition.id,
        dimension.granularity,
        timeZone,
      );
      joinCompany ||= expression.joined;
      return `${expression.sql} AS ${dimensionAliases[index]}`;
    });
    fact.metrics.forEach((metricId) => {
      metricFact.set(metricId, factIndex);
      select.push(`${BASE_METRIC_SQL[metricId]!.expression} AS m_${metricId}`);
    });

    const predicates: string[] = [];
    if (options.window.from) {
      parameters.push(toParameterLiteral(options.window.from));
      predicates.push(`f.${fact.time} >= from_iso8601_timestamp(?)`);
    }
    if (options.window.to) {
      parameters.push(toParameterLiteral(options.window.to));
      predicates.push(`f.${fact.time} < from_iso8601_timestamp(?)`);
    }
    if (fact.where) {
      predicates.push(`(${fact.where})`);
    }
    for (const filter of query.filters) {
      const predicate = filterPredicate(fact.dataset, filter.request, parameters);
      joinCompany ||= predicate.joined;
      predicates.push(predicate.sql);
    }

    let from = `${table(fact.dataset)} f`;
    if (joinCompany) {
      from += ` INNER JOIN ${table('customer_360')} c ON c.${MESH_JOIN_KEY} = f.${MESH_JOIN_KEY}`;
      if (!joins.some((join) => join.left === fact.dataset)) {
        joins.push({ left: fact.dataset, right: 'customer_360', key: MESH_JOIN_KEY });
      }
    }

    const groupBy = dimensionAliases.length
      ? ` GROUP BY ${dimensionAliases.map((_, index) => index + 1).join(', ')}`
      : '';
    return `f${factIndex} AS (SELECT ${select.join(', ')} FROM ${from}${
      predicates.length ? ` WHERE ${predicates.join(' AND ')}` : ''
    }${groupBy})`;
  });

  const columns: CompiledColumn[] = [];
  const outer: string[] = [];
  query.dimensions.forEach((dimension, index) => {
    const alias = `c${columns.length}`;
    const expression =
      factEntries.length === 1
        ? `f0.${dimensionAliases[index]}`
        : `COALESCE(${factEntries.map((_, factIndex) => `f${factIndex}.${dimensionAliases[index]}`).join(', ')})`;
    outer.push(`${expression} AS ${alias}`);
    columns.push({ sqlAlias: alias, key: dimension.definition.id, kind: 'dimension' });
  });

  const baseRef = (metricId: string) => `f${metricFact.get(metricId)!}.m_${metricId}`;
  const metricExpression = (metricId: string): string => {
    const definition = getMetricDefinition(metricId)!;
    if (definition.aggregation !== 'RATIO') {
      return baseRef(metricId);
    }
    return `CAST(${metricExpression(definition.numerator)} AS DOUBLE) / NULLIF(CAST(${metricExpression(
      definition.denominator,
    )} AS DOUBLE), 0)`;
  };

  for (const metric of query.metrics) {
    const alias = `c${columns.length}`;
    outer.push(`${metricExpression(metric.definition.id)} AS ${alias}`);
    columns.push({ sqlAlias: alias, key: metric.alias, kind: 'metric' });
  }

  // Facts on different datasets are combined on the shared dimension keys (e.g. CAC = mídia ⋈ funil).
  const from = factEntries
    .map((fact, factIndex) => {
      if (factIndex === 0) return 'f0';
      if (fact.dataset !== factEntries[0]!.dataset) {
        joins.push({
          left: factEntries[0]!.dataset,
          right: fact.dataset,
          key: 'dimensões da análise',
        });
      }
      if (dimensionAliases.length === 0) return `CROSS JOIN f${factIndex}`;
      const on = dimensionAliases
        .map((alias) => `f0.${alias} IS NOT DISTINCT FROM f${factIndex}.${alias}`)
        .join(' AND ');
      return `FULL OUTER JOIN f${factIndex} ON ${on}`;
    })
    .join(' ');

  const sortable = new Map(columns.map((column) => [column.key, column.sqlAlias]));
  const orderBy = (query.sorting ?? [])
    .filter((sort) => sortable.has(sort.field))
    .map((sort) => `${sortable.get(sort.field)} ${sort.direction === 'DESC' ? 'DESC' : 'ASC'}`);
  const limit = query.limit ? Math.min(Math.max(1, Math.floor(query.limit)), 10_000) : 10_000;

  const sql = `WITH ${ctes.join(', ')} SELECT ${outer.join(', ')} FROM ${from}${
    orderBy.length ? ` ORDER BY ${orderBy.join(', ')}` : ''
  } LIMIT ${limit}`;

  return {
    sql,
    parameters,
    columns,
    datasets: [
      ...new Set([...factEntries.map((fact) => fact.dataset), ...joins.map((join) => join.right)]),
    ],
    joins,
  };
}
