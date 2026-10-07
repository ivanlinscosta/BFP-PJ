import serverlessExpress from '@codegenie/serverless-express';
import { createApp } from './app';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';

const app = createApp({ config: loadConfig(), logger });

export const handler = serverlessExpress({ app });
