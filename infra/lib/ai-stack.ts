import { Stack, type StackProps } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from './config';

export interface AiStackProps extends StackProps {
  config: EnvironmentConfig;
  /** Bedrock model or inference-profile id. Never hardcoded: comes from context/env. */
  bedrockModelId: string;
}

/** Inteligência PJ configuration: the Bedrock model id lives in SSM Parameter Store. */
export class AiStack extends Stack {
  readonly modelParameter: ssm.StringParameter;

  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);

    this.modelParameter = new ssm.StringParameter(this, 'BedrockModelId', {
      parameterName: `/${props.config.prefix}/bedrock-model-id`,
      description:
        'Modelo Claude no Amazon Bedrock usado pela Inteligência PJ. Vazio = provedor determinístico local.',
      stringValue: props.bedrockModelId || 'NOT_CONFIGURED',
    });
  }
}
