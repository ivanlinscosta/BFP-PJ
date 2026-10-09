import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesColumn, Ellipsis, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SharingLevel } from '@bfp/domain';
import { describeAnalysisSpec } from '@bfp/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, SearchInput } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Popover } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { VisibilityPicker, sharingLabel } from '@/components/ui/visibility-picker';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/states/states';
import { useMetricCatalog, useSpecLabels } from '@/features/catalog/hooks';
import {
  deleteAnalysis,
  listAnalyses,
  saveAnalysis,
  type SavedAnalysis,
} from '@/features/explorer/api';
import { AddToDashboardDialog } from '@/features/explorer/components/action-dialogs';
import { useAnalysisStore } from '@/features/explorer/store';
import { SavedStudiesList } from '@/features/intelligence/saved-studies';
import { describeError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { normalizeText } from '@/lib/text';

const VIZ_LABELS: Record<string, string> = {
  AUTO: 'Automática',
  BAR: 'Barras',
  GROUPED_BAR: 'Barras',
  LINE: 'Linha',
  TABLE: 'Tabela',
  HEATMAP: 'Mapa de calor',
  SCATTER: 'Dispersão',
  KPI: 'Indicadores',
};

type OwnerFilter = 'ALL' | 'MINE' | 'SHARED';
type DateFilter = 'ALL' | '1' | '7' | '30';
type Action = { kind: 'rename' | 'share' | 'dashboard' | 'delete'; analysis: SavedAnalysis } | null;

export function AnalysesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('aba') === 'estudos' ? 'estudos' : 'analises';
  const queryClient = useQueryClient();
  const labels = useSpecLabels();
  const metrics = useMetricCatalog();
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const analyses = useQuery({ queryKey: ['analyses'], queryFn: listAnalyses });
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState<OwnerFilter>('ALL');
  const [date, setDate] = useState<DateFilter>('ALL');
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [metric, setMetric] = useState('ALL');
  const [sharing, setSharing] = useState<'ALL' | SharingLevel>('ALL');
  const [action, setAction] = useState<Action>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [visibility, setVisibility] = useState<SharingLevel>('TEAM');

  const filtered = useMemo(() => {
    const normalized = normalizeText(query);
    return (analyses.data ?? []).filter((analysis) => {
      const updated = new Date(analysis.metadata?.updatedAt ?? 0).getTime();
      return (
        (!normalized ||
          normalizeText(`${analysis.name} ${analysis.metadata?.ownerName ?? ''}`).includes(
            normalized,
          )) &&
        (owner === 'ALL' ||
          (owner === 'MINE' ? analysis.access === 'OWNER' : analysis.access !== 'OWNER')) &&
        (cutoff === null || updated >= cutoff) &&
        (metric === 'ALL' || analysis.metrics.some((item) => item.id === metric)) &&
        (sharing === 'ALL' || (analysis.metadata?.visibility ?? 'PRIVATE') === sharing)
      );
    });
  }, [analyses.data, query, owner, cutoff, metric, sharing]);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['analyses'] });
  const mutation = useMutation({
    mutationFn: async (input: {
      kind: 'duplicate' | 'rename' | 'share' | 'delete';
      analysis: SavedAnalysis;
    }) => {
      const { analysis } = input;
      if (input.kind === 'delete') return deleteAnalysis(analysis.id);
      return saveAnalysis({
        id: input.kind === 'duplicate' ? undefined : analysis.id,
        name:
          input.kind === 'duplicate'
            ? `${analysis.name} (cópia)`
            : input.kind === 'rename'
              ? renameValue.trim()
              : analysis.name,
        description: analysis.metadata?.description,
        visibility:
          input.kind === 'share'
            ? visibility
            : input.kind === 'duplicate'
              ? 'PRIVATE'
              : analysis.metadata?.visibility,
        spec: analysis,
      });
    },
    onSuccess: () => {
      invalidate();
      setAction(null);
    },
  });

  function open(analysis: SavedAnalysis) {
    loadAnalysis(analysis, { id: analysis.id, name: analysis.name });
    navigate('/explorar');
  }

  return (
    <div>
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-4 text-sm font-semibold text-white hover:bg-brand-orange-hover"
            to="/explorar/adicionar"
          >
            <Plus aria-hidden className="h-4 w-4" />
            Nova análise
          </Link>
        }
        subtitle="Retome, organize e compartilhe as análises do playground e os estudos da Inteligência PJ."
        title="Minhas análises"
      />

      <Tabs
        className="mb-5"
        idPrefix="analyses"
        items={[
          { value: 'analises', label: 'Análises' },
          { value: 'estudos', label: 'Estudos' },
        ]}
        label="Tipo de conteúdo"
        onChange={(value) =>
          setSearchParams(value === 'estudos' ? { aba: 'estudos' } : {}, { replace: true })
        }
        value={tab}
      />

      {tab === 'estudos' ? (
        <div aria-labelledby="analyses-tab-estudos" id="analyses-panel-estudos" role="tabpanel">
          <SavedStudiesList />
        </div>
      ) : (
        <div aria-labelledby="analyses-tab-analises" id="analyses-panel-analises" role="tabpanel">
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(4,180px)]">
            <SearchInput
              aria-label="Buscar análise"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome ou owner"
              value={query}
            />
            <Select
              aria-label="Owner"
              leadingChevron
              onChange={(event) => setOwner(event.target.value as OwnerFilter)}
              value={owner}
            >
              <option value="ALL">Todos os owners</option>
              <option value="MINE">Minhas</option>
              <option value="SHARED">Compartilhadas comigo</option>
            </Select>
            <Select
              aria-label="Data"
              leadingChevron
              onChange={(event) => {
                const next = event.target.value as DateFilter;
                setDate(next);
                setCutoff(next === 'ALL' ? null : Date.now() - Number(next) * 86_400_000);
              }}
              value={date}
            >
              <option value="ALL">Qualquer data</option>
              <option value="1">Últimas 24 h</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </Select>
            <Select
              aria-label="Métrica"
              leadingChevron
              onChange={(event) => setMetric(event.target.value)}
              value={metric}
            >
              <option value="ALL">Todas as métricas</option>
              {(metrics.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortName}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Compartilhamento"
              leadingChevron
              onChange={(event) => setSharing(event.target.value as 'ALL' | SharingLevel)}
              value={sharing}
            >
              <option value="ALL">Todo compartilhamento</option>
              <option value="PRIVATE">Privado</option>
              <option value="TEAM">Time</option>
              <option value="READ_ONLY">Somente leitura</option>
            </Select>
          </div>

          <p className="mb-3 text-[13px] text-ink-soft">{filtered.length} análises</p>

          {analyses.isLoading ? (
            <LoadingRows rows={6} />
          ) : analyses.isError ? (
            <Card>
              <ErrorState error={analyses.error} onRetry={() => void analyses.refetch()} />
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <EmptyState
                action={
                  <Link
                    className="text-sm font-semibold text-brand-navy hover:underline"
                    to="/explorar"
                  >
                    Ir para o Explorar
                  </Link>
                }
                description="Monte uma análise no playground e salve para encontrá-la aqui."
                icon={<ChartNoAxesColumn aria-hidden className="h-8 w-8" />}
                title="Nenhuma análise encontrada"
              />
            </Card>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {filtered.map((analysis) => {
                const description = describeAnalysisSpec(analysis, labels);
                return (
                  <li key={analysis.id}>
                    <Card className="grid items-center gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,230px)_auto]">
                      <div className="min-w-0">
                        <button
                          className="text-left text-base font-semibold text-brand-navy hover:underline"
                          onClick={() => open(analysis)}
                          type="button"
                        >
                          {analysis.name}
                        </button>
                        <p className="mt-1 truncate text-[13px] text-ink-soft">
                          {description.sentence}
                        </p>
                      </div>
                      <dl className="m-0 text-[13px]">
                        <dt className="text-ink-faint">Métricas · Dimensões</dt>
                        <dd className="m-0 text-ink">
                          {description.metrics.join(', ')}
                          {description.dimensions.length
                            ? ` · ${description.dimensions.join(', ')}`
                            : ''}
                        </dd>
                      </dl>
                      <dl className="m-0 text-[13px]">
                        <dt className="text-ink-faint">Filtros · Visualização</dt>
                        <dd className="m-0 text-ink">
                          {description.filters.join(', ') || 'Sem filtros'} ·{' '}
                          {VIZ_LABELS[analysis.visualization.type] ?? analysis.visualization.type}
                        </dd>
                      </dl>
                      <div className="min-w-0 text-[13px]">
                        <p className="truncate text-ink">
                          {analysis.access === 'OWNER'
                            ? 'Você'
                            : (analysis.metadata?.ownerName ?? 'Outro owner')}{' '}
                          · {formatRelative(analysis.metadata?.updatedAt)}
                        </p>
                        <Badge
                          className="mt-1 max-w-full"
                          title={sharingLabel(
                            analysis.metadata?.visibility,
                            analysis.metadata?.team,
                          )}
                          tone={
                            analysis.metadata?.visibility === 'PRIVATE' ||
                            !analysis.metadata?.visibility
                              ? 'neutral'
                              : 'tint'
                          }
                        >
                          <span className="truncate">
                            {sharingLabel(analysis.metadata?.visibility, analysis.metadata?.team)}
                          </span>
                        </Badge>
                      </div>
                      <div className="flex shrink-0 items-center justify-end gap-2">
                        <Button onClick={() => open(analysis)} size="sm">
                          Abrir
                        </Button>
                        <Popover
                          align="end"
                          anchor={
                            <Button
                              aria-expanded={menuFor === analysis.id}
                              aria-label={`Mais ações para ${analysis.name}`}
                              onClick={() =>
                                setMenuFor(menuFor === analysis.id ? null : analysis.id)
                              }
                              size="icon"
                              variant="ghost"
                            >
                              <Ellipsis aria-hidden className="h-4 w-4" />
                            </Button>
                          }
                          className="w-56"
                          onClose={() => setMenuFor(null)}
                          open={menuFor === analysis.id}
                        >
                          <div className="flex flex-col" role="menu">
                            {(
                              [
                                ['duplicate', 'Duplicar', true],
                                ['rename', 'Renomear', analysis.access !== 'VIEW'],
                                ['share', 'Compartilhar', analysis.access === 'OWNER'],
                                ['dashboard', 'Adicionar ao dashboard', true],
                                ['delete', 'Excluir', analysis.access === 'OWNER'],
                              ] as const
                            )
                              .filter(([, , allowed]) => allowed)
                              .map(([kind, label]) => (
                                <button
                                  className={`rounded px-3 py-2 text-left text-sm hover:bg-muted ${kind === 'delete' ? 'text-danger' : 'text-ink'}`}
                                  key={kind}
                                  onClick={() => {
                                    setMenuFor(null);
                                    if (kind === 'duplicate') {
                                      mutation.mutate({ kind: 'duplicate', analysis });
                                      return;
                                    }
                                    setRenameValue(analysis.name);
                                    setVisibility(analysis.metadata?.visibility ?? 'TEAM');
                                    setAction({ kind, analysis });
                                  }}
                                  role="menuitem"
                                  type="button"
                                >
                                  {label}
                                </button>
                              ))}
                          </div>
                        </Popover>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {mutation.isError && !action ? (
        <Notice className="mt-4" tone="error">
          {describeError(mutation.error).description}
        </Notice>
      ) : null}

      <Dialog
        footer={
          <>
            <Button onClick={() => setAction(null)}>Cancelar</Button>
            <Button
              disabled={!renameValue.trim() || mutation.isPending}
              onClick={() =>
                action && mutation.mutate({ kind: 'rename', analysis: action.analysis })
              }
              variant="primary"
            >
              Salvar nome
            </Button>
          </>
        }
        onClose={() => setAction(null)}
        open={action?.kind === 'rename'}
        title="Renomear análise"
      >
        <Field htmlFor="rename-analysis" label="Nome">
          <Input
            id="rename-analysis"
            onChange={(event) => setRenameValue(event.target.value)}
            value={renameValue}
          />
        </Field>
      </Dialog>
      <Dialog
        footer={
          <>
            <Button onClick={() => setAction(null)}>Cancelar</Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                action && mutation.mutate({ kind: 'share', analysis: action.analysis })
              }
              variant="primary"
            >
              Salvar compartilhamento
            </Button>
          </>
        }
        onClose={() => setAction(null)}
        open={action?.kind === 'share'}
        title="Compartilhar análise"
      >
        <VisibilityPicker onChange={setVisibility} value={visibility} />
      </Dialog>
      <Dialog
        description={
          action
            ? `“${action.analysis.name}” será removida, e os dashboards que a usam mostrarão o card como indisponível.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setAction(null)}>Cancelar</Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                action && mutation.mutate({ kind: 'delete', analysis: action.analysis })
              }
              variant="danger"
            >
              Excluir análise
            </Button>
          </>
        }
        onClose={() => setAction(null)}
        open={action?.kind === 'delete'}
        title="Excluir análise?"
      />
      {action?.kind === 'dashboard' ? (
        <AddToDashboardDialog
          analysis={{ id: action.analysis.id, name: action.analysis.name }}
          onClose={() => setAction(null)}
          open
        />
      ) : null}
    </div>
  );
}
