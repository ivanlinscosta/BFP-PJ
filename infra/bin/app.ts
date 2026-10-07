import { App, Tags } from 'aws-cdk-lib';
import { AiStack } from '../lib/ai-stack';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { resolveEnvironment } from '../lib/config';
import { DataStack, MESH_TAGS } from '../lib/data-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { WebStack } from '../lib/web-stack';

const app = new App();
const config = resolveEnvironment(String(app.node.tryGetContext('env') ?? 'dev'));
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: String(app.node.tryGetContext('region') ?? process.env.CDK_DEFAULT_REGION ?? 'sa-east-1'),
};
const bedrockModelId = String(
  app.node.tryGetContext('bedrockModelId') || process.env.BEDROCK_MODEL_ID || '',
);

const contextList = (key: string) =>
  String(app.node.tryGetContext(key) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const data = new DataStack(app, `${config.prefix}-data`, {
  env,
  config,
  lakeFormationAdmins: contextList('lakeFormationAdmins'),
});
const auth = new AuthStack(app, `${config.prefix}-auth`, { env, config });
const ai = new AiStack(app, `${config.prefix}-ai`, { env, config, bedrockModelId });
const api = new ApiStack(app, `${config.prefix}-api`, {
  env,
  config,
  userPool: auth.userPool,
  client: auth.client,
  datasetTable: data.datasetTable,
  objectsTable: data.objectsTable,
  lakeBucket: data.lakeBucket,
  dataKey: data.dataKey,
  meshDatabasePrefix: data.meshDatabasePrefix,
  meshDatabases: data.meshDatabases,
  domainTag: { key: MESH_TAGS.domain, values: data.domainTagValues },
  workgroupName: data.workgroupName,
  modelParameter: ai.modelParameter,
  dataLoadedAtParameter: data.dataLoadedAtParameter,
  atlanSecret: data.atlanSecret,
  fullstorySecret: data.fullstorySecret,
  datazoneDomainId: String(app.node.tryGetContext('datazoneDomainId') ?? '') || undefined,
});
new WebStack(app, `${config.prefix}-web`, { env, config, api: api.api });
new ObservabilityStack(app, `${config.prefix}-observability`, {
  env,
  config,
  handler: api.handler,
  logGroup: api.logGroup,
  api: api.api,
  workgroupName: data.workgroupName,
});

const repository = String(app.node.tryGetContext('githubRepository') ?? '');
if (repository) {
  new GithubOidcStack(app, 'bfp-pj-github-oidc', { env, repository });
}

Tags.of(app).add('project', 'bfp-pj');
Tags.of(app).add('environment', config.name);
Tags.of(app).add('data-classification', 'synthetic');
