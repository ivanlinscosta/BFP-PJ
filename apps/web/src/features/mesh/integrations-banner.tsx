import { Database } from 'lucide-react';
import { SOURCE_LABELS, useIntegrationStatus } from './api';

/** One-line status of the data mesh, Atlan, DataZone and FullStory integrations. */
export function IntegrationsBanner() {
  const status = useIntegrationStatus();
  if (!status.data) return null;
  const { mesh, atlan, datazone, fullstory } = status.data;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius-control)] bg-tint px-3 py-2 text-xs text-brand-navy">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <Database aria-hidden className="h-3.5 w-3.5" />
        Data mesh: {SOURCE_LABELS.mesh[mesh.source]} · {mesh.available}/{mesh.datasets} bases
        publicadas
      </span>
      <span>Atlan: {SOURCE_LABELS.atlan[atlan]}</span>
      <span>DataZone: {SOURCE_LABELS.datazone[datazone]}</span>
      <span>FullStory: {SOURCE_LABELS.fullstory[fullstory]}</span>
    </p>
  );
}
