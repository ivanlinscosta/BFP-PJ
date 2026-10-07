import { BadgeCheck, Database, ExternalLink, Link2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { LoadingRows, ErrorState } from '@/components/states/states';
import { cn } from '@/lib/utils';
import { SOURCE_LABELS, useMeshDatasets } from './api';

const DOMAIN_LABELS: Record<string, string> = {
  acquisition: 'Aquisição',
  media: 'Mídia',
  customer360: 'Clientes',
  products: 'Produtos',
};

/** Atlan certification badge (VERIFIED/DRAFT/DEPRECATED) with a link to the asset. */
export function AtlanBadge({ status, url }: { status?: string; url: string }) {
  const label =
    status === 'VERIFIED'
      ? 'Atlan · Verificado'
      : status === 'DEPRECATED'
        ? 'Atlan · Descontinuado'
        : 'Atlan · Rascunho';
  return (
    <a
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-semibold',
        status === 'VERIFIED' ? 'bg-success-soft text-success' : 'bg-muted text-ink-soft',
      )}
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
      {label}
      <ExternalLink aria-hidden className="h-3 w-3" />
    </a>
  );
}

/**
 * Dialog where the user chooses which data mesh bases feed the analysis. Only the selected
 * bases are read and joined by the engine.
 */
export function DatasetPicker({
  open,
  onClose,
  selected,
  onApply,
}: {
  open: boolean;
  onClose(): void;
  selected: string[];
  onApply(datasetIds: string[]): void;
}) {
  const catalog = useMeshDatasets();
  const [draft, setDraft] = useState<string[]>(selected);

  return (
    <Dialog
      className="max-w-3xl"
      description={
        catalog.data
          ? `Fonte do catálogo: ${SOURCE_LABELS.mesh[catalog.data.sources.mesh]} · Atlan: ${SOURCE_LABELS.atlan[catalog.data.sources.atlan]}. O motor só lê e une (JOIN por company_id) as bases selecionadas.`
          : 'O motor só lê e une as bases selecionadas.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            disabled={draft.length === 0}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            variant="primary"
          >
            Usar {draft.length} {draft.length === 1 ? 'base' : 'bases'}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Bases de dados do data mesh"
    >
      {catalog.isLoading ? (
        <LoadingRows rows={5} />
      ) : catalog.isError ? (
        <ErrorState compact error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : (
        <ul className="m-0 flex max-h-[60vh] list-none flex-col gap-2 overflow-y-auto p-0">
          {(catalog.data?.items ?? []).map((dataset) => {
            const checked = draft.includes(dataset.id);
            return (
              <li key={dataset.id}>
                <label
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-[var(--radius-control)] border px-4 py-3 transition-colors',
                    checked
                      ? 'border-brand-orange bg-cream'
                      : 'border-line hover:border-line-strong',
                    !dataset.available && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    checked={checked}
                    className="mt-1 h-4 w-4 accent-[var(--color-brand-orange)]"
                    disabled={!dataset.available}
                    onChange={() =>
                      setDraft((current) =>
                        checked
                          ? current.filter((id) => id !== dataset.id)
                          : [...current, dataset.id],
                      )
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Database aria-hidden className="h-4 w-4 text-brand-navy" />
                      <span className="text-sm font-semibold text-brand-navy">{dataset.name}</span>
                      <Badge tone="neutral">
                        {DOMAIN_LABELS[dataset.domain] ?? dataset.domain}
                      </Badge>
                      {dataset.atlan ? (
                        <AtlanBadge
                          status={dataset.atlan.certificateStatus}
                          url={dataset.atlan.url}
                        />
                      ) : null}
                      {!dataset.available ? (
                        <Badge tone="warning">Ainda não publicada</Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[13px] text-ink-soft">
                      {dataset.atlan?.description ?? dataset.description}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
                      <span>Owner: {dataset.atlan?.owners[0] ?? dataset.owner}</span>
                      <span>{dataset.grain}</span>
                      <span>
                        <code>
                          {dataset.location.database}.{dataset.location.table}
                        </code>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Link2 aria-hidden className="h-3 w-3" />
                        JOIN por {dataset.joinKey}
                      </span>
                      <span>{dataset.metricIds.length} métricas</span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
