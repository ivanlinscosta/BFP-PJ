import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { MESH_DATASETS } from '@bfp/semantic-layer';
import type { EnvironmentConfig } from './config';

export interface DataStackProps extends StackProps {
  config: EnvironmentConfig;
  /** IAM principals (ARNs) that administer the data mesh in Lake Formation. */
  lakeFormationAdmins: string[];
}

/** LF-tag keys used to govern the mesh (attribute-based access control). */
export const MESH_TAGS = {
  domain: 'bfp_domain',
  classification: 'bfp_classification',
} as const;

/**
 * Data foundation as an AWS data mesh: one Glue database per business domain (data product),
 * governed by Lake Formation (registered S3 location + LF-tags), Athena workgroup, DynamoDB
 * application state and the integration secrets (Atlan, FullStory).
 */
export class DataStack extends Stack {
  readonly lakeBucket: s3.Bucket;
  readonly meshDatabasePrefix: string;
  readonly meshDatabases: string[];
  readonly workgroupName: string;
  readonly datasetTable: dynamodb.Table;
  readonly objectsTable: dynamodb.Table;
  readonly dataKey: kms.Key;
  readonly atlanSecret: secretsmanager.Secret;
  readonly fullstorySecret: secretsmanager.Secret;
  readonly dataLoadedAtParameter: ssm.StringParameter;
  readonly domainTagValues: string[];

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config } = props;
    const removalPolicy = config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.dataKey = new kms.Key(this, 'DataKey', {
      alias: `alias/${config.prefix}-data`,
      enableKeyRotation: true,
      removalPolicy,
    });

    this.lakeBucket = new s3.Bucket(this, 'DataLake', {
      bucketName: `bfp-data-${config.name}-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.dataKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: config.retainData,
      removalPolicy,
      autoDeleteObjects: !config.retainData,
      lifecycleRules: [{ prefix: 'analytics-results/', expiration: Duration.days(7) }],
    });

    // Lake Formation administrators: the CloudFormation execution role (to create tags and
    // grants) and the operators that publish data products.
    const cfnExecRole = `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-${this.region}`;
    const lfSettings = new lakeformation.CfnDataLakeSettings(this, 'LakeFormationSettings', {
      admins: [...new Set([cfnExecRole, ...props.lakeFormationAdmins])].map((arn) => ({
        dataLakePrincipalIdentifier: arn,
      })),
      // New databases/tables are governed by Lake Formation grants, not by IAM-only access.
      createDatabaseDefaultPermissions: [],
      createTableDefaultPermissions: [],
      parameters: { CROSS_ACCOUNT_VERSION: '4' },
    });

    // Role Lake Formation uses to vend credentials for the registered lake location.
    const dataAccessRole = new iam.Role(this, 'LakeFormationDataAccessRole', {
      roleName: `${config.prefix}-lf-data-access`,
      assumedBy: new iam.ServicePrincipal('lakeformation.amazonaws.com'),
    });
    this.lakeBucket.grantReadWrite(dataAccessRole);
    this.dataKey.grantEncryptDecrypt(dataAccessRole);
    const registration = new lakeformation.CfnResource(this, 'LakeLocation', {
      resourceArn: this.lakeBucket.bucketArn,
      roleArn: dataAccessRole.roleArn,
      useServiceLinkedRole: false,
    });
    registration.addResourceDependency(lfSettings);

    this.meshDatabasePrefix = `bfp_pj_${config.name}`;
    this.domainTagValues = MESH_DATASETS.map((dataset) => dataset.glueDatabase);
    const domainTag = new lakeformation.CfnTag(this, 'DomainTag', {
      tagKey: MESH_TAGS.domain,
      tagValues: this.domainTagValues,
    });
    const classificationTag = new lakeformation.CfnTag(this, 'ClassificationTag', {
      tagKey: MESH_TAGS.classification,
      tagValues: ['synthetic', 'internal', 'confidential'],
    });
    domainTag.addResourceDependency(lfSettings);
    classificationTag.addResourceDependency(lfSettings);

    this.meshDatabases = MESH_DATASETS.map((dataset) => {
      const name = `${this.meshDatabasePrefix}_${dataset.glueDatabase}`;
      const database = new glue.CfnDatabase(this, `Mesh-${dataset.glueDatabase}`, {
        catalogId: this.account,
        databaseInput: {
          name,
          description: `Produto de dados "${dataset.name}" · owner ${dataset.owner} · ${dataset.description}`,
          locationUri: `s3://${this.lakeBucket.bucketName}/gold/${dataset.glueDatabase}/`,
          parameters: {
            'bfp:domain': dataset.domain,
            'bfp:owner': dataset.owner,
            'bfp:data_product': dataset.dataProductId,
          },
        },
      });
      database.addResourceDependency(lfSettings);

      const association = new lakeformation.CfnTagAssociation(
        this,
        `MeshTags-${dataset.glueDatabase}`,
        {
          resource: { database: { catalogId: this.account, name } },
          lfTags: [
            {
              catalogId: this.account,
              tagKey: MESH_TAGS.domain,
              tagValues: [dataset.glueDatabase],
            },
            { catalogId: this.account, tagKey: MESH_TAGS.classification, tagValues: ['synthetic'] },
          ],
        },
      );
      association.addResourceDependency(database);
      association.addResourceDependency(domainTag);
      association.addResourceDependency(classificationTag);
      return name;
    });

    this.workgroupName = config.prefix;
    new athena.CfnWorkGroup(this, 'Workgroup', {
      name: this.workgroupName,
      recursiveDeleteOption: !config.retainData,
      workGroupConfiguration: {
        enforceWorkGroupConfiguration: true,
        publishCloudWatchMetricsEnabled: true,
        bytesScannedCutoffPerQuery: config.athenaBytesScannedCutoff,
        engineVersion: { selectedEngineVersion: 'Athena engine version 3' },
        resultConfiguration: {
          outputLocation: `s3://${this.lakeBucket.bucketName}/analytics-results/`,
          encryptionConfiguration: { encryptionOption: 'SSE_KMS', kmsKey: this.dataKey.keyArn },
        },
      },
    });

    const tableDefaults = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.dataKey,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    };

    this.datasetTable = new dynamodb.Table(this, 'DatasetTable', {
      ...tableDefaults,
      tableName: `${config.prefix}-dataset`,
    });
    this.datasetTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });

    // Analyses, dashboards, audiences, activation jobs, AI conversations, favorites, preferences.
    this.objectsTable = new dynamodb.Table(this, 'ObjectsTable', {
      ...tableDefaults,
      tableName: `${config.prefix}-objects`,
    });
    this.objectsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
    });
    this.objectsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    // Integration credentials are filled by operators after deploy (never in the repository).
    this.atlanSecret = new secretsmanager.Secret(this, 'AtlanSecret', {
      secretName: `${config.prefix}/atlan`,
      description:
        'Atlan: {"baseUrl":"https://<tenant>.atlan.com","apiToken":"...","glossaryGuid":"..."}',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ baseUrl: '', glossaryGuid: '' }),
        generateStringKey: 'placeholder',
      },
      removalPolicy,
    });
    this.fullstorySecret = new secretsmanager.Secret(this, 'FullStorySecret', {
      secretName: `${config.prefix}/fullstory`,
      description: 'FullStory: {"apiKey":"...","segmentId":"..."}',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ segmentId: '' }),
        generateStringKey: 'placeholder',
      },
      removalPolicy,
    });

    this.dataLoadedAtParameter = new ssm.StringParameter(this, 'DataLoadedAt', {
      parameterName: `/${config.prefix}/data-loaded-at`,
      description: 'Horário da última publicação de dados no data mesh (escrito por seed:lake).',
      stringValue: 'pendente',
    });
  }
}
