import serverlessExpress from '@codegenie/serverless-express';
import { createApp } from './app';
import { AuthService } from '@api/auth/authService';
import { loadConfig } from '@api/common/config';
import { logger } from '@api/common/logger';
import { createApiContext } from '@api/http/context';
import {
  isIntelligenceRebuildEvent,
  rebuildIntelligenceReadModel,
} from '@api/services/customerIntelligence/rebuild';
import { isStudyWorkerEvent, runStudyJob } from '@api/services/intelligence/studyJobs';

const config = loadConfig();
const context = createApiContext({ config, logger, authService: new AuthService(config) });
const httpHandler = serverlessExpress({ app: createApp({ context }) });

/** API Gateway requests go to Express; asynchronous self-invocations run background studies. */
export const handler = async (event: unknown, lambdaContext: unknown) => {
  if (isStudyWorkerEvent(event)) {
    await runStudyJob(context, event.userId, event.studyId);
    return { ok: true };
  }
  return (httpHandler as (event: unknown, context: unknown) => Promise<unknown>)(
    event,
    lambdaContext,
  );
};

/** EventBridge schedule: recomputes Customer DNA, signals and NBA for every customer. */
export const intelligenceRebuildHandler = async (event: unknown) => {
  const bucket = process.env.INTELLIGENCE_RAW_BUCKET;
  if (!bucket) throw new Error('INTELLIGENCE_RAW_BUCKET não configurado.');
  if (!isIntelligenceRebuildEvent(event)) {
    logger.warn('intelligence_rebuild_ignored', { operation: 'INTELLIGENCE_REBUILD' });
    return { ok: false };
  }
  return { ok: true, ...(await rebuildIntelligenceReadModel(context, { bucket })) };
};
