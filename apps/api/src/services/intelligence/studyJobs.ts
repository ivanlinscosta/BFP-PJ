import { randomUUID } from 'node:crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { AuthenticatedUser } from '@api/auth/types';
import type { ApiContext } from '@api/http/context';
import { runAiStudy, runOpenAIStudy } from '@api/services/intelligence/aiStudy';
import {
  createOpenAIClient,
  resolveOpenAIKey,
  type OpenAIChatClient,
} from '@api/services/intelligence/openaiProvider';
import type { MeshDatasetId } from '@bfp/semantic-layer';
import {
  createBedrockClient,
  type BedrockConverseClient,
} from '@api/services/intelligence/bedrockProvider';
import { buildStudy, type Study } from '@api/services/intelligence/study';
import type { ToolContext } from '@api/services/intelligence/tools';

/** Background study requested from the chat (the agentic study outlives the 30 s API limit). */
export interface StudyJob {
  id: string;
  prompt: string;
  status: 'running' | 'done' | 'error';
  progress: string;
  createdAt: string;
  updatedAt: string;
  /** Identity the worker acts as (RBAC by domain is applied to every query). */
  auth: AuthenticatedUser;
  /** Bases selected in the conversation: the study only reads them. */
  datasets?: MeshDatasetId[];
  study?: Study;
  error?: string;
}

/** Event that makes the API Lambda run a study job instead of an HTTP request. */
export interface StudyWorkerEvent {
  bfpTask: 'study';
  userId: string;
  studyId: string;
}

export function isStudyWorkerEvent(event: unknown): event is StudyWorkerEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as { bfpTask?: unknown }).bfpTask === 'study' &&
    typeof (event as { studyId?: unknown }).studyId === 'string'
  );
}

async function save(context: ApiContext, job: StudyJob) {
  await context.getObjectRepository().put<StudyJob>({
    userId: job.auth.userId,
    type: 'aiStudy',
    id: job.id,
    value: { ...job, updatedAt: context.clock().toISOString() },
  });
}

export async function getStudyJob(context: ApiContext, userId: string, studyId: string) {
  return (await context.getObjectRepository().get<StudyJob>(userId, 'aiStudy', studyId))?.value;
}

/** Why the generative AI was not used, in words the user understands. */
function aiUnavailableReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/use case details/i.test(message)) {
    return 'o acesso ao Claude no Amazon Bedrock aguarda o formulário de caso de uso da Anthropic';
  }
  if (/access/i.test(message)) return 'o modelo Claude não está liberado nesta conta AWS';
  return 'o modelo de IA não respondeu';
}

/**
 * Runs a study job: Claude on Bedrock writes the study over governed queries; if the model is
 * not configured or fails, the deterministic engine builds a question-driven study and the
 * reason is shown to the user. Every number comes from executeGovernedQuery in both paths.
 */
export async function runStudyJob(
  context: ApiContext,
  userId: string,
  studyId: string,
  dependencies: { bedrockClient?: BedrockConverseClient; openaiClient?: OpenAIChatClient } = {},
) {
  const job = await getStudyJob(context, userId, studyId);
  if (!job || job.status !== 'running') return;

  const progress = async (message: string) => {
    job.progress = message;
    await save(context, job);
  };
  const toolContext: ToolContext = {
    context,
    auth: job.auth,
    queries: [],
    datasets: job.datasets?.length ? job.datasets : undefined,
  };

  try {
    let study: Study | undefined;
    let notice: string | undefined;
    const openaiKey =
      context.config.aiProvider === 'openai' && !dependencies.openaiClient
        ? await resolveOpenAIKey(context.config).catch(() => null)
        : null;
    if (context.config.aiProvider === 'openai' && (dependencies.openaiClient || openaiKey)) {
      try {
        study = await runOpenAIStudy({
          prompt: job.prompt,
          toolContext,
          model: context.config.openai.model,
          client: dependencies.openaiClient ?? createOpenAIClient(openaiKey ?? ''),
          onProgress: progress,
        });
      } catch (error) {
        context.logger.warn('ai_study_fallback', {
          studyId,
          userId,
          provider: 'openai',
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error),
        });
        notice =
          'Estudo montado pelo motor determinístico porque a IA não conseguiu concluir o estudo.';
        toolContext.queries.splice(0);
      }
    } else if (context.config.aiProvider === 'bedrock' && context.config.bedrockModelId) {
      try {
        study = await runAiStudy({
          prompt: job.prompt,
          toolContext,
          modelId: context.config.bedrockModelId,
          client: dependencies.bedrockClient ?? createBedrockClient(context.config.bedrockRegion),
          onProgress: progress,
        });
      } catch (error) {
        context.logger.warn('ai_study_fallback', {
          studyId,
          userId,
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error),
        });
        notice = `Estudo montado pelo motor determinístico porque ${aiUnavailableReason(error)}.`;
        toolContext.queries.splice(0);
      }
    } else {
      notice = 'Estudo montado pelo motor determinístico: a IA generativa não está configurada.';
    }

    if (!study) {
      await progress('Montando o estudo com o motor determinístico');
      study = { ...(await buildStudy(toolContext, job.prompt)), notice };
    }

    await save(context, { ...job, status: 'done', progress: 'Estudo pronto', study });
    context.logger.info('ai_study_completed', {
      studyId,
      userId,
      operation: 'AI_REQUEST',
      generatedBy: study.generatedBy,
      sections: study.sections.length,
      queries: study.queryCount,
    });
  } catch (error) {
    context.logger.error('ai_study_failed', {
      studyId,
      userId,
      errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    await save(context, {
      ...job,
      status: 'error',
      progress: 'Falha ao montar o estudo',
      error: 'Não foi possível montar o estudo agora. Tente novamente.',
    });
  }
}

/** Persists a new study job in the running state. */
export async function createStudyJob(
  context: ApiContext,
  auth: AuthenticatedUser,
  prompt: string,
  datasets?: MeshDatasetId[],
) {
  const now = context.clock().toISOString();
  const job: StudyJob = {
    id: randomUUID(),
    prompt,
    status: 'running',
    progress: 'Planejando o estudo',
    createdAt: now,
    updatedAt: now,
    auth,
    datasets,
  };
  await save(context, job);
  return job;
}

/**
 * Creates a study job and starts it. In AWS the API Lambda invokes itself asynchronously (the
 * HTTP request returns immediately); locally the job runs in the same process.
 */
export async function startStudyJob(
  context: ApiContext,
  auth: AuthenticatedUser,
  prompt: string,
  datasets?: MeshDatasetId[],
) {
  const job = await createStudyJob(context, auth, prompt, datasets);

  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (functionName) {
    const event: StudyWorkerEvent = { bfpTask: 'study', userId: auth.userId, studyId: job.id };
    await new LambdaClient({ region: context.config.awsRegion }).send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify(event)),
      }),
    );
  } else {
    void runStudyJob(context, auth.userId, job.id);
  }
  return job;
}
