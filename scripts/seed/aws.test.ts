import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { batchWriteDataset, buildBatchWriteInputs, marshallDatasetItem } from './aws';
import { generateDatasetBundle } from './generator';

describe('seed aws marshalling', () => {
  it('marshals company and timeline keys using dataset conventions', () => {
    const bundle = generateDatasetBundle({ scale: 0.05 });
    const item = marshallDatasetItem({ entityType: 'company', entity: bundle.companies[0]! });

    expect(item).toMatchObject({
      PK: 'ENTITY#company',
      SK: bundle.companies[0]!.id,
      entityType: 'company',
      GSI1PK: `COMPANY#${bundle.companies[0]!.id}`,
      GSI1SK: `${bundle.companies[0]!.createdAt}#company#${bundle.companies[0]!.id}`,
    });
  });

  it('chunks batch write requests at 25 items', () => {
    const bundle = generateDatasetBundle({ scale: 0.05 });
    const inputs = buildBatchWriteInputs(bundle, 'bfp-dev-dataset');

    expect(inputs.length).toBeGreaterThan(1);
    expect(Object.values(inputs[0]!.RequestItems ?? {})[0]).toHaveLength(25);
    expect(Object.values(inputs.at(-1)!.RequestItems ?? {})[0]!.length).toBeLessThanOrEqual(25);
  });

  it('retries unprocessed items with exponential backoff', async () => {
    const bundle = generateDatasetBundle({ scale: 0.02 });
    const sentCommands: BatchWriteCommand[] = [];
    const sleepCalls: number[] = [];
    const mockClient = {
      send: vi.fn(async (command: BatchWriteCommand) => {
        sentCommands.push(command);
        if (sentCommands.length === 1) {
          const requestItems = command.input.RequestItems ?? {};
          const tableName = Object.keys(requestItems)[0]!;
          return {
            UnprocessedItems: {
              [tableName]: requestItems[tableName]!.slice(0, 2),
            },
          };
        }
        return { UnprocessedItems: {} };
      }),
    };

    await batchWriteDataset(mockClient, bundle, 'bfp-dev-dataset', {
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
    });

    expect(sentCommands[0]).toBeInstanceOf(BatchWriteCommand);
    expect(sentCommands.length).toBeGreaterThan(1);
    expect(sleepCalls[0]).toBe(100);
  });
});
