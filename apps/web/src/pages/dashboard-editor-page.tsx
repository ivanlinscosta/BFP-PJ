import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, BookOpen, GripVertical, Plus, Trash2 } from 'lucide-react';
import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { AnalysisSpec, DashboardCard, SharingLevel } from '@bfp/domain';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { VisibilityPicker } from '@/components/ui/visibility-picker';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states/states';
import {
  appendCard,
  createDashboard,
  getDashboard,
  relayoutCards,
  updateDashboard,
  type DashboardView,
} from '@/features/dashboards/api';
import { listAnalyses, saveAnalysis } from '@/features/explorer/api';
import { getSavedStudy, listSavedStudies } from '@/features/intelligence/api';
import { describeError } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Create (/dashboards/novo) or edit (/dashboards/:id/editar) a dashboard composed of saved analyses. */
export function DashboardEditorPage() {
  const { dashboardId } = useParams();
  const existing = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId!),
    enabled: Boolean(dashboardId),
  });

  if (dashboardId && existing.isLoading) return <LoadingRows rows={6} />;
  if (dashboardId && (existing.isError || !existing.data)) {
    return (
      <Card>
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Card>
    );
  }

  return <DashboardEditor existing={existing.data?.dashboard} key={dashboardId ?? 'new'} />;
}

function DashboardEditor({ existing }: { existing?: DashboardView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dashboardId = existing?.id;
  const editing = Boolean(existing);
  const analyses = useQuery({ queryKey: ['analyses'], queryFn: listAnalyses });
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [visibility, setVisibility] = useState<SharingLevel>(existing?.visibility ?? 'PRIVATE');
  const [cards, setCards] = useState<DashboardCard[]>(existing?.cards ?? []);
  const [selectedAnalysis, setSelectedAnalysis] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [searchParams] = useSearchParams();
  const studies = useQuery({ queryKey: ['saved-studies'], queryFn: listSavedStudies });
  const [selectedStudy, setSelectedStudy] = useState(searchParams.get('estudo') ?? '');
  // Cards that come from a study chapter: their analysis is saved together with the dashboard.
  const [pending, setPending] = useState<Record<string, { name: string; spec: AnalysisSpec }>>({});

  const useStudy = useMutation({
    mutationFn: (studyId: string) => getSavedStudy(studyId),
    onSuccess: (saved) => {
      const stamp = Date.now().toString(36);
      const additions = saved.study.sections.map((section, index) => {
        const id = `study-${stamp}-${index}`;
        const spec: AnalysisSpec = {
          ...section.spec,
          name: section.title,
          visualization: { type: section.visualization },
        };
        return { id, name: section.title, spec };
      });
      setPending((current) => ({
        ...current,
        ...Object.fromEntries(additions.map(({ id, name, spec }) => [id, { name, spec }])),
      }));
      setCards((current) =>
        additions.reduce<DashboardCard[]>((list, { id, name, spec }) => {
          const index = list.length;
          return [
            ...list,
            {
              id,
              title: name,
              analysisId: id,
              visualization: spec.visualization,
              layout: {
                mode: 'GRID',
                x: (index % 2) * 6,
                y: Math.floor(index / 2) * 4,
                w: 6,
                h: 4,
              },
            },
          ];
        }, current),
      );
      setName((current) => current || saved.name);
      setDescription((current) => current || saved.study.summary);
      setAnnouncement(`${additions.length} capítulos do estudo adicionados como cards.`);
    },
  });

  // /dashboards/novo?estudo=<id> (from a saved study) starts with that study.
  const appliedFromLink = useRef(false);
  useEffect(() => {
    const fromLink = searchParams.get('estudo');
    if (fromLink && !appliedFromLink.current && !editing) {
      appliedFromLink.current = true;
      useStudy.mutate(fromLink);
    }
  }, [searchParams, editing, useStudy]);

  const save = useMutation({
    mutationFn: async () => {
      // Each study chapter becomes a saved analysis (same visibility as the dashboard).
      const resolved = await Promise.all(
        cards.map(async (card) => {
          const draft = pending[card.id];
          if (!draft) return card;
          const analysis = await saveAnalysis({
            name: draft.name,
            visibility,
            team: existing?.team,
            spec: draft.spec,
          });
          return { ...card, analysisId: analysis.id };
        }),
      );
      const input = {
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        team: existing?.team,
        cards: relayoutCards(resolved),
      };
      return editing ? updateDashboard(dashboardId!, input) : createDashboard(input);
    },
    onSuccess: (dashboard) => {
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', dashboard.id] });
      navigate(`/dashboards/${dashboard.id}`);
    },
  });

  const titleFor = (card: DashboardCard) =>
    (analyses.data ?? []).find((analysis) => analysis.id === card.analysisId)?.name ?? card.title;

  function move(from: number, to: number) {
    if (to < 0 || to >= cards.length || from === to) return;
    setCards((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
    setAnnouncement(`${titleFor(cards[from]!)} movido para a posição ${to + 1}.`);
  }

  function addSelected() {
    const analysis = (analyses.data ?? []).find((item) => item.id === selectedAnalysis);
    if (!analysis) return;
    setCards((current) => appendCard(current, analysis));
    setSelectedAnalysis('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) save.mutate();
  }

  const available = (analyses.data ?? []).filter(
    (analysis) => !cards.some((card) => card.analysisId === analysis.id),
  );

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => navigate(editing ? `/dashboards/${dashboardId}` : '/dashboards')}
            >
              Cancelar
            </Button>
            <Button disabled={!name.trim() || save.isPending} type="submit" variant="primary">
              {save.isPending ? 'Salvando…' : 'Salvar dashboard'}
            </Button>
          </>
        }
        breadcrumbs={[
          { label: 'Dashboards', to: '/dashboards' },
          { label: editing ? 'Editar' : 'Novo dashboard' },
        ]}
        subtitle="Organize análises salvas ou transforme um estudo em painel. A ordem dos cards é salva com o dashboard."
        title={editing ? 'Editar dashboard' : 'Criar dashboard'}
      />
      {save.isError ? (
        <Notice className="mb-4" tone="error" title="Não foi possível salvar">
          {describeError(save.error).description}
        </Notice>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="px-5 py-5">
          <h2 className="m-0 text-lg font-semibold text-brand-navy">Cards do dashboard</h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Arraste pelo puxador ou use as setas para reordenar.
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {cards.length === 0 ? (
            <EmptyState
              className="py-10"
              description="Escolha uma análise salva abaixo ou use um estudo salvo (ao lado) para criar os cards."
              title="Nenhum card ainda"
            />
          ) : (
            <ol className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
              {cards.map((card, index) => (
                <li
                  className={cn(
                    'flex items-center gap-3 rounded-[var(--radius-control)] border bg-card px-3 py-3',
                    dragIndex === index ? 'border-brand-orange bg-cream' : 'border-line',
                  )}
                  draggable
                  key={card.id}
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDragStart={() => setDragIndex(index)}
                  onDrop={() => {
                    if (dragIndex !== null) move(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <GripVertical aria-hidden className="h-4 w-4 cursor-grab text-ink-faint" />
                  <span className="w-6 text-[13px] font-semibold text-ink-soft">{index + 1}</span>
                  <span className="flex-1 truncate text-sm font-semibold text-brand-navy">
                    {titleFor(card)}
                  </span>
                  <Button
                    aria-label={`Mover ${titleFor(card)} para cima`}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    size="icon"
                    variant="ghost"
                  >
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={`Mover ${titleFor(card)} para baixo`}
                    disabled={index === cards.length - 1}
                    onClick={() => move(index, index + 1)}
                    size="icon"
                    variant="ghost"
                  >
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={`Remover ${titleFor(card)}`}
                    onClick={() =>
                      setCards((current) => current.filter((item) => item.id !== card.id))
                    }
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden className="h-4 w-4 text-danger" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-5">
            <Field
              className="min-w-[260px] flex-1"
              htmlFor="add-analysis"
              label="Adicionar análise salva"
            >
              <Select
                id="add-analysis"
                onChange={(event) => setSelectedAnalysis(event.target.value)}
                value={selectedAnalysis}
              >
                <option value="">
                  {analyses.isLoading ? 'Carregando análises…' : 'Selecione uma análise'}
                </option>
                {available.map((analysis) => (
                  <option key={analysis.id} value={analysis.id}>
                    {analysis.name}
                    {analysis.access !== 'OWNER' && analysis.metadata?.ownerName
                      ? ` — ${analysis.metadata.ownerName}`
                      : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={!selectedAnalysis} onClick={addSelected}>
              <Plus aria-hidden className="h-4 w-4" />
              Adicionar card
            </Button>
          </div>
        </Card>
        <Card className="flex flex-col gap-4 px-5 py-5">
          <Field htmlFor="dashboard-name" label="Nome do dashboard">
            <Input
              id="dashboard-name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Aquisição por canal"
              required
              value={name}
            />
          </Field>
          <Field htmlFor="dashboard-description" label="Descrição">
            <Textarea
              id="dashboard-description"
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              value={description}
            />
          </Field>
          {!editing || existing?.access === 'OWNER' ? (
            <VisibilityPicker onChange={setVisibility} value={visibility} />
          ) : null}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="m-0 flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <BookOpen aria-hidden className="h-4 w-4" />
              Criar a partir de um estudo
            </p>
            <p className="m-0 text-xs text-ink-soft">
              Cada capítulo do estudo salvo vira um card. As análises dos capítulos são salvas em
              Minhas análises junto com o dashboard.
            </p>
            <Field htmlFor="add-study" label="Estudo salvo">
              <Select
                id="add-study"
                onChange={(event) => setSelectedStudy(event.target.value)}
                value={selectedStudy}
              >
                <option value="">
                  {studies.isLoading
                    ? 'Carregando estudos…'
                    : (studies.data ?? []).length === 0
                      ? 'Nenhum estudo salvo'
                      : 'Selecione um estudo'}
                </option>
                {(studies.data ?? []).map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.name} · {study.sections} capítulos
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              disabled={!selectedStudy || useStudy.isPending}
              onClick={() => useStudy.mutate(selectedStudy)}
            >
              <BookOpen aria-hidden className="h-4 w-4" />
              {useStudy.isPending ? 'Carregando estudo…' : 'Usar estudo'}
            </Button>
            {useStudy.isError ? (
              <Notice tone="error">{describeError(useStudy.error).description}</Notice>
            ) : null}
          </div>
        </Card>
      </div>
    </form>
  );
}
