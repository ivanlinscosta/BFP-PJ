import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as kms from 'aws-cdk-lib/aws-kms';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from './config';

export interface ApiStackProps extends StackProps {
  config: EnvironmentConfig;
  userPool: cognito.UserPool;
  client: cognito.UserPoolClient;
  datasetTable: dynamodb.Table;
  objectsTable: dynamodb.Table;
  lakeBucket: s3.Bucket;
  dataKey: kms.Key;
  /** Prefix of the per-domain Glue databases of the data mesh (`<prefix>_<domain>`). */
  meshDatabasePrefix: string;
  meshDatabases: string[];
  /** LF-tag key/values that identify the mesh domains (grants are tag based). */
  domainTag: { key: string; values: string[] };
  workgroupName: string;
  /** SSM parameter with the Bedrock model id (resolved at deploy time; changing it needs no export update). */
  modelParameterName: string;
  dataLoadedAtParameter: ssm.StringParameter;
  atlanSecret: secretsmanager.Secret;
  fullstorySecret: secretsmanager.Secret;
  /** Optional Amazon DataZone domain whose listings are linked to the mesh tables. */
  datazoneDomainId?: string;
  /** Overrides the Lambda bundle location (tests). */
  lambdaCodePath?: string;
}

const LAMBDA_BUNDLE = fileURLToPath(new URL('../../apps/api/dist/lambda', import.meta.url));

/** API Gateway HTTP API (JWT authorizer) → Lambda (Express app) with least-privilege IAM. */
export class ApiStack extends Stack {
  readonly api: apigw.HttpApi;
  readonly handler: lambda.Function;
  readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.logGroup = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/aws/lambda/${config.prefix}-api`,
      retention: config.logRetentionDays,
    });

    this.handler = new lambda.Function(this, 'ApiFunction', {
      functionName: `${config.prefix}-api`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset(props.lambdaCodePath ?? LAMBDA_BUNDLE),
      handler: 'index.handler',
      memorySize: 1024,
      // HTTP requests are capped at 30 s by API Gateway; background studies (async self-invoke)
      // run planning, governed queries and analysis with Claude and need more time.
      timeout: Duration.seconds(120),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: this.logGroup,
      environment: {
        NODE_ENV: 'production',
        AUTH_MODE: 'cognito',
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.client.userPoolClientId,
        DATASET_TABLE: props.datasetTable.tableName,
        OBJECTS_TABLE: props.objectsTable.tableName,
        ANALYTICS_ENGINE: 'athena',
        ATHENA_DATABASE: props.meshDatabasePrefix,
        ATHENA_WORKGROUP: props.workgroupName,
        MESH_CATALOG: 'glue',
        MESH_DATABASE_PREFIX: props.meshDatabasePrefix,
        DATA_LOADED_AT_PARAMETER: props.dataLoadedAtParameter.parameterName,
        ATLAN_SECRET_ID: props.atlanSecret.secretName,
        FULLSTORY_SECRET_ID: props.fullstorySecret.secretName,
        ...(props.datazoneDomainId ? { DATAZONE_DOMAIN_ID: props.datazoneDomainId } : {}),
        BEDROCK_MODEL_ID: ssm.StringParameter.valueForStringParameter(
          this,
          props.modelParameterName,
        ),
        SEED_DEMO_WORKSPACE: 'false',
        WEB_ORIGIN: 'https://localhost',
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    props.datasetTable.grantReadWriteData(this.handler);
    props.objectsTable.grantReadWriteData(this.handler);
    props.lakeBucket.grantRead(this.handler, 'gold/*');
    props.lakeBucket.grantReadWrite(this.handler, 'analytics-results/*');
    props.dataKey.grantEncryptDecrypt(this.handler);
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'athena:StartQueryExecution',
          'athena:GetQueryExecution',
          'athena:GetQueryResults',
          'athena:StopQueryExecution',
        ],
        resources: [
          `arn:aws:athena:${this.region}:${this.account}:workgroup/${props.workgroupName}`,
        ],
      }),
    );
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['glue:GetDatabase', 'glue:GetTable', 'glue:GetTables', 'glue:GetPartitions'],
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          ...props.meshDatabases.flatMap((database) => [
            `arn:aws:glue:${this.region}:${this.account}:database/${database}`,
            `arn:aws:glue:${this.region}:${this.account}:table/${database}/*`,
          ]),
        ],
      }),
    );
    // Lake Formation vends the S3 credentials for mesh tables; access is decided by LF grants.
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lakeformation:GetDataAccess', 'lakeformation:GetResourceLFTags'],
        resources: ['*'],
      }),
    );
    if (props.datazoneDomainId) {
      this.handler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['datazone:SearchListings'],
          resources: [
            `arn:aws:datazone:${this.region}:${this.account}:domain/${props.datazoneDomainId}`,
          ],
        }),
      );
    }
    // Background studies: the API Lambda invokes itself asynchronously (InvocationType=Event).
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:${config.prefix}-api`],
      }),
    );
    props.atlanSecret.grantRead(this.handler);
    props.fullstorySecret.grantRead(this.handler);
    props.dataLoadedAtParameter.grantRead(this.handler);

    const principal = { dataLakePrincipalIdentifier: this.handler.role?.roleArn ?? '' };
    const domainExpression = [{ tagKey: props.domainTag.key, tagValues: props.domainTag.values }];
    new lakeformation.CfnPrincipalPermissions(this, 'MeshDatabaseGrant', {
      principal,
      resource: {
        lfTagPolicy: {
          catalogId: this.account,
          resourceType: 'DATABASE',
          expression: domainExpression,
        },
      },
      permissions: ['DESCRIBE'],
      permissionsWithGrantOption: [],
    });
    new lakeformation.CfnPrincipalPermissions(this, 'MeshTableGrant', {
      principal,
      resource: {
        lfTagPolicy: {
          catalogId: this.account,
          resourceType: 'TABLE',
          expression: domainExpression,
        },
      },
      permissions: ['SELECT', 'DESCRIBE'],
      permissionsWithGrantOption: [],
    });
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      }),
    );
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:ListUsersInGroup'],
        resources: [props.userPool.userPoolArn],
      }),
    );

    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.client.userPoolClientId] },
    );
    const integration = new HttpLambdaIntegration('ApiIntegration', this.handler);

    this.api = new apigw.HttpApi(this, 'HttpApi', {
      apiName: `${config.prefix}-api`,
      createDefaultStage: false,
    });
    new apigw.HttpStage(this, 'DefaultStage', {
      httpApi: this.api,
      stageName: '$default',
      autoDeploy: true,
      throttle: config.apiThrottle,
    });

    // Public routes (login and health); everything else requires a Cognito access token.
    this.api.addRoutes({ path: '/api/auth/login', methods: [apigw.HttpMethod.POST], integration });
    this.api.addRoutes({ path: '/api/health', methods: [apigw.HttpMethod.GET], integration });
    this.api.addRoutes({
      path: '/api/{proxy+}',
      methods: [
        apigw.HttpMethod.GET,
        apigw.HttpMethod.POST,
        apigw.HttpMethod.PUT,
        apigw.HttpMethod.DELETE,
      ],
      integration,
      authorizer,
    });

    new CfnOutput(this, 'ApiEndpoint', { value: this.api.apiEndpoint });
  }
}
