import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AiStack } from '../lib/ai-stack';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { resolveEnvironment } from '../lib/config';
import { DataStack, MESH_TAGS } from '../lib/data-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { WebStack } from '../lib/web-stack';

function fakeBundle(file: string) {
  const dir = mkdtempSync(join(tmpdir(), 'bfp-cdk-'));
  writeFileSync(join(dir, file), '// test bundle');
  return dir;
}

function synthesize(envName = 'dev') {
  const app = new App();
  const config = resolveEnvironment(envName);
  const env = { account: '123456789012', region: 'sa-east-1' };
  const data = new DataStack(app, 'data', {
    env,
    config,
    lakeFormationAdmins: ['arn:aws:iam::123456789012:user/operator'],
  });
  const auth = new AuthStack(app, 'auth', { env, config });
  const ai = new AiStack(app, 'ai', { env, config, bedrockModelId: '' });
  const api = new ApiStack(app, 'api', {
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
    modelParameterName: ai.modelParameterName,
    dataLoadedAtParameter: data.dataLoadedAtParameter,
    atlanSecret: data.atlanSecret,
    fullstorySecret: data.fullstorySecret,
    lambdaCodePath: fakeBundle('index.js'),
  });
  api.addDependency(ai);
  const web = new WebStack(app, 'web', {
    env,
    config,
    api: api.api,
    webAssetPath: fakeBundle('index.html'),
  });
  const observability = new ObservabilityStack(app, 'obs', {
    env,
    config,
    handler: api.handler,
    logGroup: api.logGroup,
    api: api.api,
    workgroupName: data.workgroupName,
  });
  return {
    data: Template.fromStack(data),
    auth: Template.fromStack(auth),
    api: Template.fromStack(api),
    web: Template.fromStack(web),
    observability: Template.fromStack(observability),
  };
}

describe('CDK stacks', () => {
  const templates = synthesize();

  it('governs the data mesh with Lake Formation: admins, registered lake, LF-tags and grants', () => {
    templates.data.hasResourceProperties('AWS::LakeFormation::DataLakeSettings', {
      Admins: Match.arrayWith([
        { DataLakePrincipalIdentifier: 'arn:aws:iam::123456789012:user/operator' },
      ]),
      CreateDatabaseDefaultPermissions: [],
      CreateTableDefaultPermissions: [],
    });
    templates.data.resourceCountIs('AWS::LakeFormation::Resource', 1);
    templates.data.hasResourceProperties('AWS::LakeFormation::Tag', {
      TagKey: MESH_TAGS.domain,
      TagValues: Match.arrayWith(['customer360', 'media', 'digital']),
    });
    templates.data.resourceCountIs('AWS::LakeFormation::TagAssociation', 6);
    templates.data.resourceCountIs('AWS::SecretsManager::Secret', 2);
    templates.data.hasResourceProperties('AWS::Athena::WorkGroup', {
      Name: 'bfp-pj-dev-etl',
      WorkGroupConfiguration: Match.objectLike({ EnforceWorkGroupConfiguration: false }),
    });
    templates.api.hasResourceProperties('AWS::LakeFormation::PrincipalPermissions', {
      Permissions: ['SELECT', 'DESCRIBE'],
      Resource: { LFTagPolicy: Match.objectLike({ ResourceType: 'TABLE' }) },
    });
    templates.api.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          MESH_CATALOG: 'glue',
          MESH_DATABASE_PREFIX: 'bfp_pj_dev',
          ATLAN_SECRET_ID: Match.anyValue(),
          FULLSTORY_SECRET_ID: Match.anyValue(),
        }),
      },
    });
  });

  it('creates a private, encrypted data lake, Glue database and Athena workgroup', () => {
    templates.data.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.objectLike({}),
    });
    templates.data.resourceCountIs('AWS::Glue::Database', 6);
    templates.data.hasResourceProperties('AWS::Glue::Database', {
      DatabaseInput: Match.objectLike({ Name: 'bfp_pj_dev_digital' }),
    });
    templates.data.hasResourceProperties('AWS::Athena::WorkGroup', {
      Name: 'bfp-pj-dev',
      WorkGroupConfiguration: Match.objectLike({ EnforceWorkGroupConfiguration: true }),
    });
  });

  it('uses the key schema expected by the repositories (PK/SK + GSI1/GSI2)', () => {
    templates.data.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'bfp-pj-dev-objects',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: 'GSI2' })]),
    });
  });

  it('protects the API with a Cognito JWT authorizer except login and health', () => {
    templates.auth.resourceCountIs('AWS::Cognito::UserPoolGroup', 3);
    templates.api.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', { AuthorizerType: 'JWT' });
    templates.api.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /api/auth/login',
      AuthorizationType: 'NONE',
    });
    templates.api.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /api/{proxy+}',
      AuthorizationType: 'JWT',
    });
    templates.api.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({ AUTH_MODE: 'cognito', ANALYTICS_ENGINE: 'athena' }),
      },
      TracingConfig: { Mode: 'Active' },
    });
  });

  it('serves the SPA through CloudFront with Origin Access Control and /api routing', () => {
    templates.web.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    templates.web.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 404, ResponsePagePath: '/index.html' }),
        ]),
        CacheBehaviors: Match.arrayWith([Match.objectLike({ PathPattern: '/api/*' })]),
      }),
    });
  });

  it('creates the operations dashboard and alarms', () => {
    templates.observability.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
    templates.observability.resourceCountIs('AWS::CloudWatch::Alarm', 3);
  });
});
