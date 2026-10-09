import { randomUUID } from 'node:crypto';
import type { AnalysisSpec, FilterCondition } from '@bfp/domain';
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
import { buildRefinedStudy, buildStudy, type Study } from '@api/services/intelligence/study';
import type { ToolContext } from '@api/services/intelligence/tools';
import type { ConversationTurn, StoredConversation } from '@api/services/intelligence/types';
import { describeQueryForMemory } from '@api/services/intelligence/memory';

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
  /** Conversation that asked for the study: the result is added to its memory. */
  conversationId?: string;
  /**
   * Study this one refines (same chapters and queries with a new cut, e.g. segment =
   * Agronegócio). Only the structure is kept, not the previous results.
   */
  baseStudy?: BaseStudy;
  study?: Study;
  error?: string;
}

/** Structure of a previous study reused by a follow-up cut. */
export interface BaseStudy {
  prompt: string;
  title: string;
  sections: Array<{ title: string; question: string; spec: AnalysisSpec }>;
  /** Filters of the new cut, applied to every chapter. */
  filters: FilterCondition[];
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
    requiredFilters: job.baseStudy?.filters,
    refines: job.baseStudy,
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
      study = {
        ...(job.baseStudy
          ? await buildRefinedStudy(toolContext, job.baseStudy)
          : await buildStudy(toolContext, job.prompt)),
        notice,
      };
    }

    await save(context, { ...job, status: 'done', progress: 'Estudo pronto', study });
    await rememberStudy(context, job, study);
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

/**
 * Adds the finished study to the conversation memory (title, summary, chapters and their
 * queries), so follow-up questions such as "aprofunde o capítulo de CAC" have the context.
 */
async function rememberStudy(context: ApiContext, job: StudyJob, study: Study) {
  if (!job.conversationId) return;
  const repository = context.getObjectRepository();
  const stored = await repository.get<StoredConversation>(
    job.auth.userId,
    'aiConversation',
    job.conversationId,
  );
  if (!stored) return;
  const chapters = study.sections
    .map(
      (section, index) =>
        `${index + 1}. ${section.title}: ${section.findings[0] ?? ''} ${describeQueryForMemory(section.spec)}`,
    )
    .join('\n');
  const content = [
    `Estudo pronto: ${study.title}.`,
    study.summary,
    `Capítulos:\n${chapters}`,
    study.recommendations.length ? `Recomendações: ${study.recommendations.join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6_000);
  const now = context.clock().toISOString();
  const studyTurn: ConversationTurn = { role: 'assistant', content, at: now, action: 'NONE' };
  await repository.put<StoredConversation>({
    userId: job.auth.userId,
    type: 'aiConversation',
    id: job.conversationId,
    value: {
      ...stored.value,
      lastStudyJobId: job.id,
      turns: [...stored.value.turns, studyTurn].slice(-30),
      updatedAt: now,
    },
  });
}

export interface StudyJobOptions {
  datasets?: MeshDatasetId[];
  conversationId?: string;
  /** Previous study to refine, with the bases it used. */
  baseStudy?: { study: BaseStudy; datasets?: MeshDatasetId[] };
}

/**
 * Structure of a delivered study job, ready to be refined with a new cut. Null when the job is
 * missing, not finished or belongs to someone else.
 */
export async function baseStudyFrom(
  context: ApiContext,
  userId: string,
  studyJobId: string,
  filters: FilterCondition[],
) {
  const job = await getStudyJob(context, userId, studyJobId);
  if (!job?.study || job.status !== 'done') return null;
  return {
    datasets: job.datasets,
    study: {
      prompt: job.prompt,
      title: job.study.title,
      sections: job.study.sections.map((section) => ({
        title: section.title,
        question: section.question,
        spec: section.spec,
      })),
      filters,
    } satisfies BaseStudy,
  };
}

/** Persists a new study job in the running state. */
export async function createStudyJob(
  context: ApiContext,
  auth: AuthenticatedUser,
  prompt: string,
  options: StudyJobOptions = {},
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
    datasets: options.datasets ?? options.baseStudy?.datasets,
    conversationId: options.conversationId,
    baseStudy: options.baseStudy?.study,
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
  options: StudyJobOptions = {},
) {
  const job = await createStudyJob(context, auth, prompt, options);

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
