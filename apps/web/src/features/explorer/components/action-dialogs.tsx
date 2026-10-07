import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import type { AnalysisSpec, SharingLevel } from '@bfp/domain';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { VisibilityPicker } from '@/components/ui/visibility-picker';
import { ErrorState, LoadingRows } from '@/components/states/states';
import {
  appendCard,
  createDashboard,
  listDashboards,
  toDashboardInput,
  updateDashboard,
} from '@/features/dashboards/api';
import { describeError } from '@/lib/errors';
import { saveAnalysis, type SavedAnalysis } from '../api';
import { buildExplorerHref } from '../spec';

export function SaveAnalysisDialog({
  open,
  onClose,
  spec,
  defaultName,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose(): void;
  spec: AnalysisSpec;
  defaultName: string;
  existing: { id: string; name: string } | null;
  onSaved(analysis: SavedAnalysis): void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? defaultName);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SharingLevel>('PRIVATE');
  const [asCopy, setAsCopy] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      saveAnalysis({
        id: existing && !asCopy ? existing.id : undefined,
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        spec,
      }),
    onSuccess: (analysis) => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] });
      onSaved(analysis);
      onClose();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) mutation.mutate();
  }

  return (
    <Dialog
      description="Salve para retomar, compartilhar ou adicionar a um dashboard."
      onClose={onClose}
      open={open}
      title="Salvar análise"
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field htmlFor="analysis-name" label="Nome da análise">
          <Input
            id="analysis-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </Field>
        <Field htmlFor="analysis-description" label="Descrição (opcional)">
          <Textarea
            id="analysis-description"
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            value={description}
          />
        </Field>
        <VisibilityPicker onChange={setVisibility} value={visibility} />
        {existing ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              checked={asCopy}
              className="accent-[var(--color-brand-orange)]"
              onChange={(event) => setAsCopy(event.target.checked)}
              type="checkbox"
            />
            Salvar como nova análise (manter “{existing.name}”)
          </label>
        ) : null}
        {mutation.isError ? (
          <Notice tone="error">{describeError(mutation.error).description}</Notice>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim() || mutation.isPending} type="submit" variant="primary">
            {mutation.isPending ? 'Salvando…' : 'Salvar análise'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ShareDialog({
  open,
  onClose,
  spec,
  saved,
}: {
  open: boolean;
  onClose(): void;
  spec: AnalysisSpec;
  saved: { id: string; name: string } | null;
}) {
  const queryClient = useQueryClient();
  const [visibility, setVisibility] = useState<SharingLevel>('TEAM');
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${buildExplorerHref(spec)}`;
  const mutation = useMutation({
    mutationFn: () => saveAnalysis({ id: saved!.id, name: saved!.name, visibility, spec }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['analyses'] }),
  });

  async function copy() {
    await navigator.clipboard?.writeText(link);
    setCopied(true);
  }

  return (
    <Dialog
      description="Compartilhe o link da análise ou defina quem pode acessá-la."
      onClose={onClose}
      open={open}
      title="Compartilhar análise"
    >
      <div className="flex flex-col gap-5">
        <Field htmlFor="share-link" label="Link da análise">
          <div className="flex gap-2">
            <Input id="share-link" readOnly value={link} />
            <Button aria-label="Copiar link" onClick={copy}>
              {copied ? (
                <Check aria-hidden className="h-4 w-4" />
              ) : (
                <Copy aria-hidden className="h-4 w-4" />
              )}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </Field>
        {saved ? (
          <>
            <VisibilityPicker onChange={setVisibility} value={visibility} />
            {mutation.isSuccess ? (
              <Notice tone="success">Compartilhamento atualizado.</Notice>
            ) : null}
            {mutation.isError ? (
              <Notice tone="error">{describeError(mutation.error).description}</Notice>
            ) : null}
            <div className="flex justify-end">
              <Button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
                variant="primary"
              >
                Salvar compartilhamento
              </Button>
            </div>
          </>
        ) : (
          <Notice tone="info">
            Salve a análise para definir permissões de time ou somente leitura. O link acima abre o
            mesmo recorte.
          </Notice>
        )}
      </div>
    </Dialog>
  );
}

export function AddToDashboardDialog({
  open,
  onClose,
  analysis,
}: {
  open: boolean;
  onClose(): void;
  analysis: { id: string; name: string } | null;
}) {
  const queryClient = useQueryClient();
  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: listDashboards, enabled: open });
  const [newName, setNewName] = useState('');
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);
  const editable = (dashboards.data ?? []).filter((dashboard) => dashboard.access !== 'VIEW');

  const addMutation = useMutation({
    mutationFn: async (target: { id?: string }) => {
      if (!analysis) throw new Error('missing analysis');
      if (target.id) {
        const dashboard = editable.find((item) => item.id === target.id)!;
        return updateDashboard(
          dashboard.id,
          toDashboardInput(dashboard, appendCard(dashboard.cards, analysis)),
        );
      }
      return createDashboard({
        name: newName.trim(),
        cards: appendCard([], analysis),
        visibility: 'PRIVATE',
      });
    },
    onSuccess: (dashboard) => {
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      setDone({ id: dashboard.id, name: dashboard.name });
    },
  });

  return (
    <Dialog
      description={analysis ? `Adicione “${analysis.name}” como um card.` : undefined}
      onClose={onClose}
      open={open}
      title="Adicionar ao dashboard"
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success">Análise adicionada a “{done.name}”.</Notice>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Continuar explorando</Button>
            <Link
              className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-brand-orange px-4 text-sm font-semibold text-white"
              to={`/dashboards/${done.id}`}
            >
              Abrir dashboard
            </Link>
          </div>
        </div>
      ) : dashboards.isLoading ? (
        <LoadingRows rows={3} />
      ) : dashboards.isError ? (
        <ErrorState compact error={dashboards.error} onRetry={() => void dashboards.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto p-0">
            {editable.map((dashboard) => (
              <li key={dashboard.id}>
                <button
                  className="flex w-full items-center justify-between rounded-[var(--radius-control)] border border-line px-3 py-2.5 text-left hover:border-brand-orange hover:bg-cream disabled:opacity-50"
                  disabled={addMutation.isPending}
                  onClick={() => addMutation.mutate({ id: dashboard.id })}
                  type="button"
                >
                  <span className="text-sm font-semibold text-brand-navy">{dashboard.name}</span>
                  <span className="text-xs text-ink-soft">{dashboard.cards.length} análises</span>
                </button>
              </li>
            ))}
            {editable.length === 0 ? (
              <li className="text-sm text-ink-soft">Você ainda não tem dashboards editáveis.</li>
            ) : null}
          </ul>
          <form
            className="flex items-end gap-2 border-t border-line pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim()) addMutation.mutate({});
            }}
          >
            <Field
              className="flex-1"
              htmlFor="new-dashboard-name"
              label="Ou crie um novo dashboard"
            >
              <Input
                id="new-dashboard-name"
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Ex.: Aquisição por canal"
                value={newName}
              />
            </Field>
            <Button
              disabled={!newName.trim() || addMutation.isPending}
              type="submit"
              variant="primary"
            >
              Criar e adicionar
            </Button>
          </form>
          {addMutation.isError ? (
            <Notice tone="error">{describeError(addMutation.error).description}</Notice>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
