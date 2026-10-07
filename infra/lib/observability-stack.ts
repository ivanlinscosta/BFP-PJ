import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from './config';

export interface ObservabilityStackProps extends StackProps {
  config: EnvironmentConfig;
  handler: lambda.Function;
  logGroup: logs.LogGroup;
  api: apigw.HttpApi;
  workgroupName: string;
}

/** CloudWatch dashboard, log-based metrics from structured logs and alarms. */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { config } = props;
    const namespace = `BFP-PJ/${config.name}`;

    const logMetric = (name: string, pattern: string, value = '1') => {
      new logs.MetricFilter(this, `${name}Filter`, {
        logGroup: props.logGroup,
        metricNamespace: namespace,
        metricName: name,
        filterPattern: logs.FilterPattern.literal(pattern),
        metricValue: value,
      });
      return new cloudwatch.Metric({
        namespace,
        metricName: name,
        statistic: 'Sum',
        period: Duration.minutes(5),
      });
    };

    const aiRequests = logMetric(
      'AiRequests',
      '{ $.operation = "AI_REQUEST" && $.status = "success" }',
    );
    const aiErrors = logMetric('AiErrors', '{ $.operation = "AI_REQUEST" && $.status = "error" }');
    const aiLatency = new cloudwatch.Metric({
      namespace,
      metricName: 'AiLatencyMs',
      statistic: 'p90',
      period: Duration.minutes(5),
    });
    new logs.MetricFilter(this, 'AiLatencyFilter', {
      logGroup: props.logGroup,
      metricNamespace: namespace,
      metricName: 'AiLatencyMs',
      filterPattern: logs.FilterPattern.literal(
        '{ $.operation = "AI_REQUEST" && $.durationMs = * }',
      ),
      metricValue: '$.durationMs',
    });
    const queries = logMetric('AnalyticsQueries', '{ $.operation = "ANALYTICS_QUERY" }');
    const queryLatency = new cloudwatch.Metric({
      namespace,
      metricName: 'AnalyticsLatencyMs',
      statistic: 'p90',
      period: Duration.minutes(5),
    });
    new logs.MetricFilter(this, 'AnalyticsLatencyFilter', {
      logGroup: props.logGroup,
      metricNamespace: namespace,
      metricName: 'AnalyticsLatencyMs',
      filterPattern: logs.FilterPattern.literal(
        '{ $.operation = "ANALYTICS_QUERY" && $.durationMs = * }',
      ),
      metricValue: '$.durationMs',
    });

    const apiMetric = (metricName: string, statistic = 'Sum') =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName,
        dimensionsMap: { ApiId: props.api.apiId },
        statistic,
        period: Duration.minutes(5),
      });
    const athenaMetric = (metricName: string, statistic: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/Athena',
        metricName,
        dimensionsMap: { WorkGroup: props.workgroupName },
        statistic,
        period: Duration.minutes(5),
      });

    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${config.prefix}-operacao`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Lambda — erros e invocações',
            left: [props.handler.metricErrors(), props.handler.metricInvocations()],
          }),
          new cloudwatch.GraphWidget({
            title: 'Lambda — latência p90',
            left: [props.handler.metricDuration({ statistic: 'p90' })],
          }),
          new cloudwatch.GraphWidget({
            title: 'API — 4xx / 5xx',
            left: [apiMetric('4xx'), apiMetric('5xx')],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'API — latência p90',
            left: [apiMetric('Latency', 'p90')],
          }),
          new cloudwatch.GraphWidget({
            title: 'Athena — consultas e latência',
            left: [queries],
            right: [queryLatency, athenaMetric('EngineExecutionTime', 'p90')],
          }),
          new cloudwatch.GraphWidget({
            title: 'Athena — bytes processados',
            left: [athenaMetric('ProcessedBytes', 'Sum')],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'Inteligência PJ — requisições e erros',
            left: [aiRequests, aiErrors],
          }),
          new cloudwatch.GraphWidget({
            title: 'Inteligência PJ — latência p90',
            left: [aiLatency],
          }),
        ],
      ],
    });

    new cloudwatch.Alarm(this, 'LambdaErrors', {
      alarmName: `${config.prefix}-lambda-errors`,
      metric: props.handler.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    new cloudwatch.Alarm(this, 'Api5xx', {
      alarmName: `${config.prefix}-api-5xx`,
      metric: apiMetric('5xx'),
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    new cloudwatch.Alarm(this, 'AiErrorsAlarm', {
      alarmName: `${config.prefix}-ai-errors`,
      metric: aiErrors,
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
