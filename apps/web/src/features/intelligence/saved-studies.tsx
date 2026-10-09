import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, Save, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, SearchInput } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states/states';
import { useMeshDatasets } from '@/features/mesh/api';
import { describeError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { normalizeText } from '@/lib/text';
import { deleteSavedStudy, listSavedStudies, saveStudy, type SavedStudySummary } from './api';

export const SAVED_STUDIES_KEY = ['saved-studies'] as const;

/** Minhas análises → Estudos: studies the user saved from Inteligência PJ. */
export function SavedStudiesList() {
  const queryClient = useQueryClient();
  const studies = useQuery({ queryKey: SAVED_STUDIES_KEY, queryFn: listSavedStudies });
  const mesh = useMeshDatasets();
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<SavedStudySummary | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedStudy(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_STUDIES_KEY });
      setDeleting(null);
    },
  });
  const datasetName = (id: string) =>
    mesh.data?.items.find((dataset) => dataset.id === id)?.name ?? id;

  const normalized = normalizeText(query);
  const filtered = (studies.data ?? []).filter(
    (study) => !normalized || normalizeText(`${study.name} ${study.prompt}`).includes(normalized),
  );

  return (
    <div>
      <div className="mb-4">
        <SearchInput
          aria-label="Buscar estudo"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou pergunta"
          value={query}
        />
      </div>
      <p className="mb-3 text-[13px] text-ink-soft">{filtered.length} estudos</p>

      {studies.isLoading ? (
        <LoadingRows rows={4} />
      ) : studies.isError ? (
        <Card>
          <ErrorState error={studies.error} onRetry={() => void studies.refetch()} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            action={
              <Link
                className="text-sm font-semibold text-brand-navy hover:underline"
                to="/inteligencia"
              >
                Ir para a Inteligência PJ
              </Link>
            }
            description="Peça um estudo na Inteligência PJ e use “Salvar estudo” para guardá-lo aqui."
            icon={<BookOpen aria-hidden className="h-8 w-8" />}
            title="Nenhum estudo salvo"
          />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
          {filtered.map((study) => (
            <li key={study.id}>
              <Card className="flex h-full flex-col gap-2 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    className="min-w-0 text-[15px] font-semibold text-brand-navy hover:underline"
                    to={`/analises/estudos/${study.id}`}
                  >
                    {study.name}
                  </Link>
                  <button
                    aria-label={`Excluir ${study.name}`}
                    className="shrink-0 rounded p-1 text-ink-faint hover:bg-muted hover:text-danger"
                    onClick={() => setDeleting(study)}
                    type="button"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                <p className="m-0 line-clamp-2 text-sm text-ink-soft">{study.summary}</p>
                <p className="m-0 mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-ink-faint">
                  {study.generatedBy === 'ai' ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-brand-navy">
                      <Sparkles aria-hidden className="h-3 w-3" /> IA
                    </span>
                  ) : null}
                  <span>{study.sections} capítulos</span>
                  {study.datasets?.length ? (
                    <span title={study.datasets.map(datasetName).join(', ')}>
                      · {study.datasets.slice(0, 3).map(datasetName).join(', ')}
                      {study.datasets.length > 3 ? ` +${study.datasets.length - 3}` : ''}
                    </span>
                  ) : null}
                  <span>· salvo {formatRelative(study.createdAt)}</span>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
              variant="danger"
            >
              Excluir estudo
            </Button>
          </>
        }
        onClose={() => setDeleting(null)}
        open={deleting !== null}
        title="Excluir estudo"
      >
        <p className="m-0 text-sm text-ink">
          O estudo “{deleting?.name}” será removido de Minhas análises.
        </p>
        {remove.isError ? (
          <Notice className="mt-3" tone="error">
            {describeError(remove.error).description}
          </Notice>
        ) : null}
      </Dialog>
    </div>
  );
}

/** "Salvar estudo": keeps the finished study in Minhas análises → Estudos. */
export function SaveStudyButton({ jobId, defaultName }: { jobId: string; defaultName: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const save = useMutation({
    mutationFn: () => saveStudy(jobId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SAVED_STUDIES_KEY });
      setOpen(false);
    },
  });

  if (save.isSuccess) {
    return (
      <Link
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-semibold text-success hover:bg-muted"
        to={`/analises/estudos/${save.data.id}`}
      >
        <Check aria-hidden className="h-3.5 w-3.5" />
        Estudo salvo · abrir em Minhas análises
      </Link>
    );
  }
  return (
    <>
      <button
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-semibold text-brand-navy hover:bg-muted"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Save aria-hidden className="h-3.5 w-3.5" />
        Salvar estudo
      </button>
      <Dialog
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={save.isPending || !name.trim()}
              onClick={() => save.mutate()}
              variant="primary"
            >
              {save.isPending ? 'Salvando…' : 'Salvar estudo'}
            </Button>
          </>
        }
        onClose={() => setOpen(false)}
        open={open}
        title="Salvar estudo"
      >
        <Field htmlFor={`save-study-name-${jobId}`} label="Nome do estudo">
          <Input
            id={`save-study-name-${jobId}`}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </Field>
        <p className="m-0 mt-2 text-xs text-ink-soft">
          O estudo fica em Minhas análises → Estudos, com os números de agora.
        </p>
        {save.isError ? (
          <Notice className="mt-3" tone="error">
            {describeError(save.error).description}
          </Notice>
        ) : null}
      </Dialog>
    </>
  );
}
