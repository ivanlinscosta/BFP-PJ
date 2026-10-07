import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from './config';

export interface WebStackProps extends StackProps {
  config: EnvironmentConfig;
  api: apigw.HttpApi;
  /** Overrides the web bundle location (tests). */
  webAssetPath?: string;
}

const WEB_DIST = fileURLToPath(new URL('../../apps/web/dist', import.meta.url));

/**
 * Private S3 bucket + CloudFront (Origin Access Control, HTTPS, compression, SPA routing).
 * /api/* is routed to the HTTP API through the same distribution, so the browser stays
 * same-origin and no AWS credential ever reaches the frontend.
 */
export class WebStack extends Stack {
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { config } = props;

    const bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `${config.prefix}-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
      },
    });

    const apiOrigin = new origins.HttpOrigin(
      `${props.api.apiId}.execute-api.${this.region}.amazonaws.com`,
      { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY },
    );

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${config.prefix} web`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
        },
      },
      // SPA routing: deep links such as /clientes/:id are served by index.html.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });

    new s3deploy.BucketDeployment(this, 'DeployAssets', {
      destinationBucket: bucket,
      sources: [s3deploy.Source.asset(props.webAssetPath ?? WEB_DIST, { exclude: ['index.html'] })],
      cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
      prune: false,
    });
    new s3deploy.BucketDeployment(this, 'DeployIndex', {
      destinationBucket: bucket,
      sources: [
        s3deploy.Source.asset(props.webAssetPath ?? WEB_DIST, { exclude: ['*', '!index.html'] }),
      ],
      cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
      prune: false,
      distribution: this.distribution,
      distributionPaths: ['/index.html', '/'],
    });

    new CfnOutput(this, 'WebUrl', { value: `https://${this.distribution.distributionDomainName}` });
  }
}
