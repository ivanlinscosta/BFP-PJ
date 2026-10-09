import { AthenaClient } from '@aws-sdk/client-athena';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GlueClient } from '@aws-sdk/client-glue';
import { gzipSync } from 'node:zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoCustomerIntelligenceRepository } from '../../../apps/api/src/services/customerIntelligence/repository';
import { INTELLIGENCE_RAW_KEY } from '../../../apps/api/src/services/customerIntelligence/rebuild';
import { publishLakeTable } from '../lake-publish';
import { INTELLIGENCE_AS_OF } from './generator';
import { buildIntelligenceLakeTables } from './lake-tables';
import { loadBundle, printReport, rebuildIntelligence } from './rebuild';

/**
 * npm run seed:intelligence — publishes the Customer Intelligence read model in AWS:
 *   DynamoDB (dataset table, INTEL# partitions): full profile + compact summary per customer;
 *   S3 <bucket>/intelligence/raw/customers.json.gz: raw behavior read by the daily rebuild Lambda;
 *   lake (optional, when DATA_LAKE_BUCKET is set): gold tables customer_features, customer_dna,
 *   customer_signals, nba_recommendations and nba_outcomes in <prefix>_intelligence.
 * The customer_intelligence mesh product itself is loaded by seed:aws/seed:lake from dataset.json.
 *
 * Required env: AWS_REGION, DATASET_TABLE. Lake: DATA_LAKE_BUCKET, MESH_DATABASE_PREFIX,
 * ATHENA_WORKGROUP.
 */
const region = process.env.AWS_REGION ?? 'sa-east-1';
const tableName = process.env.DATASET_TABLE;
if (!tableName) throw new Error('Defina a variável de ambiente DATASET_TABLE.');

const bundle = await loadBundle();
const { raws, profiles, report } = rebuildIntelligence(bundle);
printReport(report);

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const repository = new DynamoCustomerIntelligenceRepository(client, tableName);
for (let index = 0; index < profiles.length; index += 250) {
  await repository.putProfiles(profiles.slice(index, index + 250));
  console.log(`DynamoDB: ${Math.min(index + 250, profiles.length)}/${profiles.length} perfis`);
}

const bucket = process.env.DATA_LAKE_BUCKET;
const prefix = process.env.MESH_DATABASE_PREFIX;
const workgroup = process.env.ATHENA_WORKGROUP;
if (bucket && prefix && workgroup) {
  const s3 = new S3Client({ region });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: INTELLIGENCE_RAW_KEY,
      Body: gzipSync(Buffer.from(JSON.stringify({ asOf: INTELLIGENCE_AS_OF, raws }))),
      ContentType: 'application/json',
      ContentEncoding: 'gzip',
    }),
  );
  console.log(`S3: s3://${bucket}/${INTELLIGENCE_RAW_KEY} (${raws.length} clientes)`);
  const target = {
    s3,
    athena: new AthenaClient({ region }),
    glue: new GlueClient({ region }),
    bucket,
    prefix,
    workgroup,
  };
  for (const table of buildIntelligenceLakeTables(raws, profiles, INTELLIGENCE_AS_OF)) {
    await publishLakeTable(target, table);
  }
} else {
  console.log('Lake ignorado: defina DATA_LAKE_BUCKET, MESH_DATABASE_PREFIX e ATHENA_WORKGROUP.');
}
console.log(
  JSON.stringify({ level: 'info', message: 'NBA_GENERATED', customers: profiles.length }),
);
