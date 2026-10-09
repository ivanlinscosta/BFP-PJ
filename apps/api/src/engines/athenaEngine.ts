import { createHash } from 'node:crypto';
import {
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
  type AthenaClient,
} from '@aws-sdk/client-athena';
import {
  AthenaCompilationError,
  buildResultColumns,
  compileAthenaQuery,
  recommendVisualization,
  resolveDateRange,
  type AnalyticsExecutionResult,
} from '@bfp/analytics-engine';
import { MESH_DATASET_BY_ID, type MeshDatasetId } from '@bfp/semantic-layer';
import type { ValidatedAnalysisQuery } from '@bfp/semantic-layer';
import { ApiError } from '@api/common/errors';

/** Minimal Athena client surface (eases testing with fakes). */
export type AthenaClientLike = Pick<AthenaClient, 'send'>;

export interface AthenaEngineOptions {
  client: AthenaClientLike;
  /** Domain databases are `<prefix>_<domain>` (e.g. bfp_pj_dev_customer360). */
  meshDatabasePrefix: string;
  workgroup: string;
  outputLocation?: string;
  accessScope: string;
  clock?: () => Date;
  freshness: () => Promise<string>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

const resultCache = new Map<string, { expiresAt: number; result: AnalyticsExecutionResult }>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Analytics engine backed by Amazon Athena over the Gold tables in the Glue Data Catalog.
 * The SQL comes exclusively from the governed compiler; results are normalized to the same
 * AnalyticsResult contract used by the local engine.
 */
export class AthenaAnalyticsQueryEngine {
  constructor(private readonly options: AthenaEngineOptions) {}

  /** Compiles the governed SQL; a query the mesh cannot answer is a client error, not a 500. */
  private compile(query: ValidatedAnalysisQuery, window: ReturnType<typeof resolveDateRange>) {
    try {
      return compileAthenaQuery(query, {
        window,
        resolveTable: (dataset) => this.resolveTable(dataset),
      });
    } catch (error) {
      if (error instanceof AthenaCompilationError) {
        throw new ApiError(422, 'analysis_not_supported', error.message);
      }
      throw error;
    }
  }

  async execute(query: ValidatedAnalysisQuery): Promise<AnalyticsExecutionResult> {
    const clock = this.options.clock ?? (() => new Date());
    const cacheKey = createHash('sha256')
      .update(JSON.stringify({ spec: query.spec, scope: this.options.accessScope }))
      .digest('hex');
    const cached = resultCache.get(cacheKey);
    if (cached && cached.expiresAt > clock().getTime()) {
      return cached.result;
    }

    const startedAt = clock().getTime();
    const window = resolveDateRange(query.dateRange, { referenceDate: clock() });
    const compiled = this.compile(query, window);
    const started = await this.options.client.send(
      new StartQueryExecutionCommand({
        QueryString: compiled.sql,
        QueryExecutionContext: { Database: `${this.options.meshDatabasePrefix}_customer360` },
        WorkGroup: this.options.workgroup,
        ExecutionParameters: compiled.parameters.length ? compiled.parameters : undefined,
        ResultConfiguration: this.options.outputLocation
          ? { OutputLocation: this.options.outputLocation }
          : undefined,
      }),
    );
    const executionId = started.QueryExecutionId;
    if (!executionId) {
      throw new ApiError(502, 'athena_query_failed', 'O motor analítico não iniciou a consulta.');
    }

    await this.waitForCompletion(executionId);

    const rawRows: string[][] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.options.client.send(
        new GetQueryResultsCommand({ QueryExecutionId: executionId, NextToken: nextToken }),
      );
      for (const row of page.ResultSet?.Rows ?? []) {
        rawRows.push((row.Data ?? []).map((cell) => cell.VarCharValue ?? ''));
      }
      nextToken = page.NextToken;
    } while (nextToken);

    const [, ...dataRows] = rawRows;
    const rows = dataRows.map((cells) =>
      Object.fromEntries(
        compiled.columns.map((column, index) => {
          const raw = cells[index];
          if (column.kind === 'dimension') {
            return [column.key, raw === '' ? null : raw];
          }
          const value = raw === '' || raw === undefined ? null : Number(raw);
          return [column.key, value !== null && Number.isFinite(value) ? value : null];
        }),
      ),
    );

    const result: AnalyticsExecutionResult = {
      columns: buildResultColumns(query),
      rows,
      visualization: recommendVisualization(query, rows),
      metadata: {
        queryId: executionId,
        executionMs: clock().getTime() - startedAt,
        rowCount: rows.length,
        freshness: await this.options.freshness(),
        qualityScore: 0.99,
        metricDefinitions: query.metrics.map((metric) => metric.definition),
        warnings:
          query.comparison?.type === 'PREVIOUS_PERIOD'
            ? ['Comparação com período anterior ainda não disponível no Athena.']
            : rows.length === 0
              ? ['Nenhum dado encontrado para o recorte solicitado.']
              : undefined,
      },
    };

    resultCache.set(cacheKey, {
      expiresAt: clock().getTime() + (this.options.cacheTtlMs ?? 60_000),
      result,
    });
    return result;
  }

  /**
   * Catalog preview: the first rows of a mesh table. Table and column names come from the governed
   * mesh contract (never from the request), so the SQL is not built from user input.
   */
  async previewTable(dataset: MeshDatasetId, columns: readonly string[], limit: number) {
    const select = columns.map((column) => `"${column.replace(/"/g, '')}"`).join(', ');
    const started = await this.options.client.send(
      new StartQueryExecutionCommand({
        QueryString: `SELECT ${select} FROM ${this.resolveTable(dataset)} LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))}`,
        QueryExecutionContext: { Database: `${this.options.meshDatabasePrefix}_customer360` },
        WorkGroup: this.options.workgroup,
        ResultConfiguration: this.options.outputLocation
          ? { OutputLocation: this.options.outputLocation }
          : undefined,
      }),
    );
    const executionId = started.QueryExecutionId;
    if (!executionId) {
      throw new ApiError(502, 'athena_query_failed', 'O motor analítico não iniciou a consulta.');
    }
    await this.waitForCompletion(executionId);
    const page = await this.options.client.send(
      new GetQueryResultsCommand({ QueryExecutionId: executionId }),
    );
    const [, ...rows] = (page.ResultSet?.Rows ?? []).map((row) =>
      (row.Data ?? []).map((cell) => cell.VarCharValue ?? ''),
    );
    return rows;
  }

  /** Fully qualified mesh table for a data product. */
  resolveTable(dataset: MeshDatasetId) {
    const definition = MESH_DATASET_BY_ID.get(dataset);
    if (!definition) {
      throw new ApiError(422, 'unknown_dataset', 'Base de dados desconhecida no data mesh.');
    }
    return `${this.options.meshDatabasePrefix}_${definition.glueDatabase}.${definition.table}`;
  }

  private async waitForCompletion(executionId: string) {
    const clock = this.options.clock ?? (() => new Date());
    const deadline = clock().getTime() + (this.options.timeoutMs ?? 25_000);
    let interval = this.options.pollIntervalMs ?? 250;

    for (;;) {
      const execution = await this.options.client.send(
        new GetQueryExecutionCommand({ QueryExecutionId: executionId }),
      );
      const state = execution.QueryExecution?.Status?.State;
      if (state === 'SUCCEEDED') {
        return;
      }
      if (state === 'FAILED' || state === 'CANCELLED') {
        throw new ApiError(
          502,
          'athena_query_failed',
          'O motor analítico não concluiu a consulta.',
        );
      }
      if (clock().getTime() >= deadline) {
        await this.options.client.send(
          new StopQueryExecutionCommand({ QueryExecutionId: executionId }),
        );
        throw new ApiError(504, 'athena_timeout', 'A consulta demorou mais que o esperado.');
      }
      await sleep(interval);
      interval = Math.min(interval * 2, 2_000);
    }
  }
}
