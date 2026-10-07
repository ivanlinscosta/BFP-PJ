import {
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  StopQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { validateAnalysisSpec } from '@bfp/semantic-layer';
import { AthenaAnalyticsQueryEngine, type AthenaClientLike } from '@api/engines/athenaEngine';

function query(extra: Record<string, unknown> = {}) {
  const validation = validateAnalysisSpec({
    datasets: ['customer_360'],
    metrics: [{ id: 'account_conversion_rate' }],
    dimensions: [{ id: 'acquisition_channel' }],
    filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
    dateRange: { type: 'LAST_N_DAYS', value: 90 },
    visualization: { type: 'AUTO' },
    ...extra,
  });
  return validation.resolvedQuery!;
}

function fakeClient(states: string[]) {
  const commands: unknown[] = [];
  const client: AthenaClientLike = {
    send: (async (command: unknown) => {
      commands.push(command);
      if (command instanceof StartQueryExecutionCommand) return { QueryExecutionId: 'exec-1' };
      if (command instanceof GetQueryExecutionCommand) {
        return { QueryExecution: { Status: { State: states.shift() ?? 'SUCCEEDED' } } };
      }
      if (command instanceof GetQueryResultsCommand) {
        return {
          ResultSet: {
            Rows: [
              { Data: [{ VarCharValue: 'c0' }, { VarCharValue: 'c1' }] },
              { Data: [{ VarCharValue: 'GOOGLE_SEARCH' }, { VarCharValue: '0.148' }] },
              { Data: [{ VarCharValue: 'META' }, { VarCharValue: '0.097' }] },
            ],
          },
        };
      }
      return {};
    }) as AthenaClientLike['send'],
  };
  return { client, commands };
}

describe('AthenaAnalyticsQueryEngine', () => {
  it('runs parameterized SQL, polls until success and normalizes rows', async () => {
    const { client, commands } = fakeClient(['RUNNING', 'SUCCEEDED']);
    const engine = new AthenaAnalyticsQueryEngine({
      client,
      meshDatabasePrefix: 'bfp_pj_dev',
      workgroup: 'bfp-pj-dev',
      accessScope: 'analyst:analyst',
      freshness: async () => '2026-10-07T00:00:00.000Z',
      pollIntervalMs: 1,
    });

    const result = await engine.execute(query());
    const start = commands.find(
      (command) => command instanceof StartQueryExecutionCommand,
    ) as StartQueryExecutionCommand;

    expect(start.input.WorkGroup).toBe('bfp-pj-dev');
    expect(start.input.QueryString).toContain('bfp_pj_dev_customer360.customer_360');
    expect(start.input.ExecutionParameters).toContain("'SP'");
    expect(result.rows).toEqual([
      { acquisition_channel: 'GOOGLE_SEARCH', account_conversion_rate: 0.148 },
      { acquisition_channel: 'META', account_conversion_rate: 0.097 },
    ]);
    expect(result.columns.map((column) => column.label)).toEqual([
      'Canal',
      'Conversão de abertura',
    ]);
    expect(result.metadata.queryId).toBe('exec-1');
    expect(result.visualization.recommendedType).toBe('BAR');
  });

  it('maps failures and timeouts to typed API errors and stops the query', async () => {
    const failing = new AthenaAnalyticsQueryEngine({
      client: fakeClient(['FAILED']).client,
      meshDatabasePrefix: 'bfp_pj_dev',
      workgroup: 'wg',
      accessScope: 'analyst:fail',
      freshness: async () => '',
      pollIntervalMs: 1,
    });
    await expect(failing.execute(query({ limit: 5 }))).rejects.toMatchObject({
      code: 'athena_query_failed',
    });

    const slow = fakeClient(Array.from({ length: 50 }, () => 'RUNNING'));
    const timingOut = new AthenaAnalyticsQueryEngine({
      client: slow.client,
      meshDatabasePrefix: 'bfp_pj_dev',
      workgroup: 'wg',
      accessScope: 'analyst:slow',
      freshness: async () => '',
      pollIntervalMs: 1,
      timeoutMs: 5,
    });
    await expect(timingOut.execute(query({ limit: 7 }))).rejects.toMatchObject({ statusCode: 504 });
    expect(slow.commands.some((command) => command instanceof StopQueryExecutionCommand)).toBe(
      true,
    );
  });
});
