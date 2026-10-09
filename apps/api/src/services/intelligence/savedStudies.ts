import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/types';
import { ApiError, NotFoundError } from '@api/common/errors';
import type { ApiContext } from '@api/http/context';
import type { Study } from '@api/services/intelligence/study';
import { getStudyJob } from '@api/services/intelligence/studyJobs';

/** Study kept by the user in Minhas análises (a frozen copy: numbers as of when it was saved). */
export interface SavedStudy {
  id: string;
  name: string;
  prompt: string;
  datasets?: string[];
  study: Study;
  createdAt: string;
  updatedAt: string;
}

/** List item: everything except the chapters' data. */
export type SavedStudySummary = Omit<SavedStudy, 'study'> & {
  sections: number;
  generatedBy: Study['generatedBy'];
  summary: string;
};

function summarize(saved: SavedStudy): SavedStudySummary {
  const { study, ...rest } = saved;
  return {
    ...rest,
    sections: study.sections.length,
    generatedBy: study.generatedBy,
    summary: study.summary,
  };
}

/** Saves a finished study job of the user under a name. */
export async function saveStudy(
  context: ApiContext,
  auth: AuthenticatedUser,
  studyJobId: string,
  name?: string,
) {
  const job = await getStudyJob(context, auth.userId, studyJobId);
  if (!job) throw new NotFoundError('Estudo não encontrado.');
  if (job.status !== 'done' || !job.study) {
    throw new ApiError(409, 'study_not_ready', 'O estudo ainda não terminou.');
  }
  const now = context.clock().toISOString();
  const saved: SavedStudy = {
    id: randomUUID(),
    name: name?.trim() || job.study.title,
    prompt: job.prompt,
    datasets: job.datasets,
    study: job.study,
    createdAt: now,
    updatedAt: now,
  };
  await context.getObjectRepository().put<SavedStudy>({
    userId: auth.userId,
    type: 'savedStudy',
    id: saved.id,
    value: saved,
  });
  return summarize(saved);
}

export async function listSavedStudies(context: ApiContext, auth: AuthenticatedUser) {
  const items = await context
    .getObjectRepository()
    .listByType<SavedStudy>(auth.userId, 'savedStudy');
  return items
    .map((item) => summarize(item.value))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getSavedStudy(context: ApiContext, auth: AuthenticatedUser, id: string) {
  const stored = await context.getObjectRepository().get<SavedStudy>(auth.userId, 'savedStudy', id);
  if (!stored) throw new NotFoundError('Estudo salvo não encontrado.');
  return stored.value;
}

export async function deleteSavedStudy(context: ApiContext, auth: AuthenticatedUser, id: string) {
  await getSavedStudy(context, auth, id);
  await context.getObjectRepository().delete(auth.userId, 'savedStudy', id);
}
