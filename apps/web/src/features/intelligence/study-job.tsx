import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Notice } from '@/components/ui/notice';
import { describeError } from '@/lib/errors';
import { getStudyJob, type IntelligenceStudy } from './api';
import { ThinkingIndicator } from './thinking-indicator';

/** Follows a background study until it is ready, showing the agent's real progress. */
export function StudyJobProgress({
  jobId,
  onReady,
}: {
  jobId: string;
  onReady(study: IntelligenceStudy): void;
}) {
  const job = useQuery({
    queryKey: ['ai-study', jobId],
    queryFn: () => getStudyJob(jobId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1_500 : false),
    retry: 2,
  });

  useEffect(() => {
    if (job.data?.status === 'done' && job.data.study) onReady(job.data.study);
  }, [job.data, onReady]);

  if (job.isError) {
    return (
      <Notice tone="error" title="Não foi possível acompanhar o estudo">
        {describeError(job.error).description}
      </Notice>
    );
  }
  if (job.data?.status === 'error') {
    return (
      <Notice tone="error" title="O estudo não foi concluído">
        {job.data.error ?? 'Tente novamente em instantes.'}
      </Notice>
    );
  }
  return <ThinkingIndicator progress={job.data?.progress ?? 'Planejando o estudo'} study />;
}
