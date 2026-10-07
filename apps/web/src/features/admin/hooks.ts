import { useQuery } from '@tanstack/react-query';
import { getFeatureFlags, type FeatureFlags } from './api';

const ENABLED: FeatureFlags = {
  aiCopilot: true,
  audienceActivation: true,
  csvExport: true,
  dashboardSharing: true,
};

/** Feature flags governed in Administração (defaults to enabled while loading). */
export function useFeatureFlags(): FeatureFlags {
  const flags = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: getFeatureFlags,
    staleTime: 60_000,
    retry: false,
  });
  return flags.data ?? ENABLED;
}
