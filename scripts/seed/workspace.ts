import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildAudienceProfiles, evaluateAudience } from '@bfp/analytics-engine';
import type { AudienceDefinition } from '@bfp/domain';
import { buildDemoWorkspace } from '../../apps/api/src/demo/workspace';
import { DynamoObjectRepository } from '../../apps/api/src/repositories/dynamoObjectRepository';
import { readDatasetBundle } from './io';

/**
 * Writes the demo workspace (analyses, dashboards, favorites, audiences of Mariana, Rafael and
 * Camila) into the DynamoDB objects table. Required env: AWS_REGION, OBJECTS_TABLE.
 */
async function main() {
  const region = process.env.AWS_REGION;
  const table = process.env.OBJECTS_TABLE;
  if (!region || !table) {
    throw new Error('Defina AWS_REGION e OBJECTS_TABLE.');
  }

  const bundle = await readDatasetBundle();
  const profiles = buildAudienceProfiles(bundle);
  const repository = new DynamoObjectRepository(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region })),
    table,
  );

  const objects = buildDemoWorkspace(new Date());
  for (const object of objects) {
    if (object.type === 'audience') {
      const audience = object.value as AudienceDefinition;
      await repository.put({
        ...object,
        value: {
          ...audience,
          estimatedSize: audience.filterGroups
            ? evaluateAudience(profiles, audience.filterGroups).length
            : audience.estimatedSize,
        },
      });
      continue;
    }
    await repository.put(object);
  }

  console.log(`${objects.length} objetos de demonstração gravados em ${table}.`);
}

await main();
