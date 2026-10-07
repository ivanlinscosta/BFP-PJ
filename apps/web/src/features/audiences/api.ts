import type {
  ActivationDestination,
  ActivationJob,
  AudienceDefinition,
  AudiencePreview,
  AudienceRuleGroup,
  FilterOperator,
} from '@bfp/domain';
import { apiRequest } from '@/services/apiClient';

export interface AudienceField {
  id: string;
  label: string;
  type: 'enum' | 'multi';
  operators: FilterOperator[];
  options: Array<{ value: string; label: string }>;
}

export interface AudienceInput {
  name: string;
  description?: string;
  filters: [];
  filterGroups: AudienceRuleGroup;
}

export async function listAudiences() {
  return (await apiRequest<{ items: AudienceDefinition[] }>('/audiences')).items;
}

export async function getAudience(id: string) {
  return (
    await apiRequest<{ audience: AudienceDefinition }>(`/audiences/${encodeURIComponent(id)}`)
  ).audience;
}

export async function listAudienceFields() {
  return (await apiRequest<{ items: AudienceField[] }>('/audiences/fields')).items;
}

export async function previewAudience(filterGroups: AudienceRuleGroup, signal?: AbortSignal) {
  return (
    await apiRequest<{ preview: AudiencePreview }, { filterGroups: AudienceRuleGroup }>(
      '/audiences/preview',
      {
        method: 'POST',
        body: { filterGroups },
        signal,
      },
    )
  ).preview;
}

export async function saveAudience(input: AudienceInput, id?: string) {
  return (
    await apiRequest<{ audience: AudienceDefinition }, AudienceInput>(
      id ? `/audiences/${encodeURIComponent(id)}` : '/audiences',
      { method: id ? 'PUT' : 'POST', body: input },
    )
  ).audience;
}

export async function deleteAudience(id: string) {
  await apiRequest<void>(`/audiences/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function activateAudience(id: string, destination: ActivationDestination) {
  return (
    await apiRequest<{ job: ActivationJob }, { destination: ActivationDestination }>(
      `/audiences/${encodeURIComponent(id)}/activate`,
      { method: 'POST', body: { destination } },
    )
  ).job;
}

export async function listActivations(id: string) {
  return (
    await apiRequest<{ items: ActivationJob[] }>(`/audiences/${encodeURIComponent(id)}/activations`)
  ).items;
}

export async function listAllActivations() {
  return (await apiRequest<{ items: ActivationJob[] }>('/audiences/activations')).items;
}
