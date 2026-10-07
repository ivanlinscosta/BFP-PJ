import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { AudienceDefinition } from '@bfp/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Eyebrow } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states/states';
import { deleteAudience, listAllActivations, listAudiences } from '@/features/audiences/api';
import { TEMPLATES } from '@/features/audiences/templates';
import { formatCount, formatRelative } from '@/lib/format';
import { normalizeText } from '@/lib/text';

const STATUS: Record<
  AudienceDefinition['status'],
  { label: string; tone: 'neutral' | 'tint' | 'success' }
> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  READY: { label: 'Pronta', tone: 'tint' },
  ACTIVATED: { label: 'Ativada', tone: 'success' },
};

export function AudiencesPage() {
  const queryClient = useQueryClient();
  const audiences = useQuery({ queryKey: ['audiences'], queryFn: listAudiences });
  const activations = useQuery({
    queryKey: ['audiences', 'activations'],
    queryFn: listAllActivations,
  });
  const [query, setQuery] = useState('');
  const [toDelete, setToDelete] = useState<AudienceDefinition | null>(null);
  const remove = useMutation({
    mutationFn: (audience: AudienceDefinition) => deleteAudience(audience.id),
    onSuccess: () => {
      setToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['audiences'] });
    },
  });
  const items = (audiences.data ?? []).filter((audience) =>
    normalizeText(`${audience.name} ${audience.description ?? ''}`).includes(normalizeText(query)),
  );

  return (
    <div>
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-orange-hover"
            to="/audiencias/nova"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Criar audiência
          </Link>
        }
        subtitle="Transforme análises em públicos acionáveis para CRM e Mídia."
        title="Minhas audiências"
      />
      <section aria-label="Modelos" className="mb-6">
        <Eyebrow>Comece por um modelo</Eyebrow>
        <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATES.map((template) => (
            <Link
              className="rounded-[var(--radius-card)] border border-line bg-card px-4 py-3 hover:border-brand-orange"
              key={template.id}
              to={`/audiencias/nova?modelo=${template.id}`}
            >
              <p className="text-sm font-semibold text-brand-navy">{template.name}</p>
              <p className="mt-1 text-[13px] text-ink-soft">{template.description}</p>
            </Link>
          ))}
        </div>
      </section>
      <SearchInput
        aria-label="Buscar audiência"
        containerClassName="mb-4 max-w-md"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar audiência"
        value={query}
      />
      <Card>
        {audiences.isLoading ? (
          <LoadingRows className="p-4" rows={4} />
        ) : audiences.isError ? (
          <ErrorState error={audiences.error} onRetry={() => void audiences.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            action={
              <Link
                className="text-sm font-semibold text-brand-navy hover:underline"
                to="/audiencias/nova"
              >
                Criar audiência
              </Link>
            }
            description="Combine estado, porte, onboarding, ativação e produtos para criar seu primeiro público."
            icon={<Users aria-hidden className="h-8 w-8" />}
            title="Nenhuma audiência ainda"
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH className="text-right">Tamanho</TH>
                <TH>Owner</TH>
                <TH>Última atualização</TH>
                <TH>Status</TH>
                <TH>Destino</TH>
                <TH className="text-right">Ações</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((audience) => {
                const lastJob = activations.data?.find((job) => job.audienceId === audience.id);
                return (
                  <TR key={audience.id}>
                    <TD>
                      <Link
                        className="font-semibold text-brand-navy hover:underline"
                        to={`/audiencias/${audience.id}`}
                      >
                        {audience.name}
                      </Link>
                      {audience.description ? (
                        <p className="text-xs text-ink-soft">{audience.description}</p>
                      ) : null}
                    </TD>
                    <TD className="text-right font-semibold tabular-nums">
                      {audience.estimatedSize !== undefined
                        ? formatCount(audience.estimatedSize)
                        : '—'}
                    </TD>
                    <TD>{audience.ownerName ?? 'Você'}</TD>
                    <TD>{formatRelative(audience.updatedAt)}</TD>
                    <TD>
                      <Badge tone={STATUS[audience.status].tone}>
                        {STATUS[audience.status].label}
                      </Badge>
                    </TD>
                    <TD>
                      {lastJob
                        ? `${lastJob.destination === 'CRM' ? 'CRM' : 'Mídia'} · ${lastJob.status === 'COMPLETED' ? 'enviado' : 'em envio'}`
                        : audience.lastDestination
                          ? audience.lastDestination === 'CRM'
                            ? 'CRM'
                            : 'Mídia'
                          : '—'}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          className="inline-flex h-8 items-center rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-brand-navy hover:bg-muted"
                          to={`/audiencias/${audience.id}`}
                        >
                          Abrir
                        </Link>
                        <Button
                          aria-label={`Excluir ${audience.name}`}
                          onClick={() => setToDelete(audience)}
                          size="icon"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Dialog
        description={
          toDelete
            ? `“${toDelete.name}” será removida. Envios simulados anteriores não são afetados.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button
              disabled={remove.isPending}
              onClick={() => toDelete && remove.mutate(toDelete)}
              variant="danger"
            >
              Excluir audiência
            </Button>
          </>
        }
        onClose={() => setToDelete(null)}
        open={Boolean(toDelete)}
        title="Excluir audiência?"
      />
    </div>
  );
}
