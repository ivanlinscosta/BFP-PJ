import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ellipsis, Info, Layers, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SearchInput } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { sharingLabel } from '@/components/ui/visibility-picker';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState } from '@/components/states/states';
import { Skeleton } from '@/components/ui/skeleton';
import {
  deleteDashboard,
  listDashboards,
  setDashboardFavorite,
  type DashboardView,
} from '@/features/dashboards/api';
import { formatRelative } from '@/lib/format';
import { normalizeText } from '@/lib/text';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/services/auth';

type TabValue = 'all' | 'mine' | 'shared' | 'favorites';
type SortValue = 'recent' | 'name' | 'size';

function highlight(dashboard: DashboardView) {
  const [first, second] = dashboard.cardSummaries;
  if (!first) return null;
  const extra = dashboard.cardSummaries.length - 2;
  const subtitle =
    first.subtitle.includes('=') || !second
      ? first.subtitle
      : `${second.title}${extra > 0 ? ` · +${extra} ${extra === 1 ? 'análise' : 'análises'}` : ''}`;
  return { title: first.title, subtitle };
}

function DashboardCard({
  dashboard,
  onFavorite,
  onDelete,
}: {
  dashboard: DashboardView;
  onFavorite(): void;
  onDelete(): void;
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const own = dashboard.access === 'OWNER';
  const ownerName = own ? 'Você' : (dashboard.ownerName ?? 'Outro owner');
  const block = highlight(dashboard);

  return (
    <Card className="flex flex-col px-4 pt-5 pb-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] text-ink-soft">
          <Layers aria-hidden className="h-4 w-4 text-brand-navy" strokeWidth={1.75} />
          {dashboard.cards.length} {dashboard.cards.length === 1 ? 'análise' : 'análises'}
        </span>
        <span className="flex items-center gap-3">
          <button
            aria-label={
              dashboard.isFavorite
                ? `Remover ${dashboard.name} dos favoritos`
                : `Favoritar ${dashboard.name}`
            }
            aria-pressed={dashboard.isFavorite}
            className="text-ink-soft hover:text-brand-orange"
            onClick={onFavorite}
            type="button"
          >
            <Star
              aria-hidden
              className={cn(
                'h-5 w-5',
                dashboard.isFavorite && 'fill-brand-orange text-brand-orange',
              )}
              strokeWidth={1.5}
            />
          </button>
          <Popover
            align="end"
            anchor={
              <button
                aria-expanded={menuOpen}
                aria-label={`Ações de ${dashboard.name}`}
                className="text-ink-soft hover:text-ink"
                onClick={() => setMenuOpen((open) => !open)}
                type="button"
              >
                <Ellipsis aria-hidden className="h-5 w-5" />
              </button>
            }
            className="w-48"
            onClose={() => setMenuOpen(false)}
            open={menuOpen}
          >
            <div className="flex flex-col" role="menu">
              <button
                className="rounded px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => navigate(`/dashboards/${dashboard.id}`)}
                role="menuitem"
                type="button"
              >
                Abrir
              </button>
              {dashboard.access !== 'VIEW' ? (
                <button
                  className="rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => navigate(`/dashboards/${dashboard.id}/editar`)}
                  role="menuitem"
                  type="button"
                >
                  Editar
                </button>
              ) : null}
              {own ? (
                <button
                  className="rounded px-3 py-2 text-left text-sm text-danger hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  role="menuitem"
                  type="button"
                >
                  Excluir
                </button>
              ) : null}
            </div>
          </Popover>
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold text-brand-navy">
        <Link className="hover:underline" to={`/dashboards/${dashboard.id}`}>
          {dashboard.name}
        </Link>
      </h2>
      <p className="mt-1.5 min-h-[40px] text-sm text-ink-soft">{dashboard.description}</p>
      {block ? (
        <div className="mt-6 rounded-[var(--radius-control)] bg-muted px-3 py-3">
          <p className="truncate text-[13px] font-semibold text-brand-navy">{block.title}</p>
          <p className="mt-1.5 truncate text-[11px] text-ink-soft">{block.subtitle}</p>
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--radius-control)] bg-muted px-3 py-3 text-[13px] text-ink-soft">
          Sem análises ainda
        </div>
      )}
      <div className="mt-5 flex items-center gap-3">
        <Avatar name={own ? (getCurrentUser()?.name ?? 'Você') : ownerName} className="h-8 w-8" />
        <div className="min-w-0 flex-1 text-[13px] leading-tight">
          <p className="text-ink">
            {ownerName} · {formatRelative(dashboard.updatedAt)}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-ink-soft">
            {own
              ? sharingLabel(dashboard.visibility, dashboard.team)
              : `Pode visualizar · ${dashboard.team ?? '—'}`}
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-navy hover:underline"
          to={`/dashboards/${dashboard.id}`}
        >
          Abrir
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}

export function DashboardsPage() {
  const queryClient = useQueryClient();
  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: listDashboards });
  const [tab, setTab] = useState<TabValue>('all');
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('ALL');
  const [access, setAccess] = useState('ALL');
  const [sort, setSort] = useState<SortValue>('recent');
  const [toDelete, setToDelete] = useState<DashboardView | null>(null);
  const items = useMemo(() => dashboards.data ?? [], [dashboards.data]);

  const favorite = useMutation({
    mutationFn: (dashboard: DashboardView) =>
      setDashboardFavorite(dashboard.id, !dashboard.isFavorite),
    onMutate: async (dashboard) => {
      queryClient.setQueryData<DashboardView[]>(['dashboards'], (current) =>
        current?.map((item) =>
          item.id === dashboard.id ? { ...item, isFavorite: !item.isFavorite } : item,
        ),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['dashboards'] }),
  });
  const remove = useMutation({
    mutationFn: (dashboard: DashboardView) => deleteDashboard(dashboard.id),
    onSuccess: () => {
      setToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });

  const counts = {
    all: items.length,
    mine: items.filter((item) => item.access === 'OWNER').length,
    shared: items.filter((item) => item.access !== 'OWNER').length,
    favorites: items.filter((item) => item.isFavorite).length,
  };
  const owners = [
    ...new Set(items.map((item) => (item.access === 'OWNER' ? 'Você' : (item.ownerName ?? '—')))),
  ];

  const visible = useMemo(() => {
    const normalized = normalizeText(query);
    return items
      .filter((item) =>
        tab === 'mine'
          ? item.access === 'OWNER'
          : tab === 'shared'
            ? item.access !== 'OWNER'
            : tab === 'favorites'
              ? item.isFavorite
              : true,
      )
      .filter(
        (item) =>
          !normalized ||
          normalizeText(
            `${item.name} ${item.description ?? ''} ${item.cardSummaries.map((card) => card.title).join(' ')}`,
          ).includes(normalized),
      )
      .filter(
        (item) => owner === 'ALL' || (item.access === 'OWNER' ? 'Você' : item.ownerName) === owner,
      )
      .filter((item) =>
        access === 'ALL'
          ? true
          : access === 'EDIT'
            ? item.access !== 'VIEW'
            : item.access === 'VIEW',
      )
      .sort((left, right) =>
        sort === 'name'
          ? left.name.localeCompare(right.name, 'pt-BR')
          : sort === 'size'
            ? right.cards.length - left.cards.length
            : right.updatedAt.localeCompare(left.updatedAt),
      );
  }, [items, tab, query, owner, access, sort]);

  return (
    <div>
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-brand-orange px-3 text-[13px] font-semibold text-white hover:bg-brand-orange-hover"
            to="/dashboards/novo"
          >
            Criar dashboard
          </Link>
        }
        subtitle="Reúna suas análises salvas do playground em painéis do seu jeito."
        title="Dashboards"
      />
      <Tabs
        className="gap-6 [&>button]:pb-3 [&>button]:text-[15px]"
        items={[
          { value: 'all', label: `Todos · ${counts.all}` },
          { value: 'mine', label: `Meus dashboards · ${counts.mine}` },
          { value: 'shared', label: `Compartilhados comigo · ${counts.shared}` },
          { value: 'favorites', label: `Favoritos · ${counts.favorites}` },
        ]}
        label="Filtrar dashboards"
        onChange={setTab}
        value={tab}
      />
      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_196px_184px_214px]">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="dashboard-search">
            Buscar dashboard
          </label>
          <SearchInput
            id="dashboard-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou análise"
            value={query}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="dashboard-owner">
            Proprietário
          </label>
          <Select
            id="dashboard-owner"
            leadingChevron
            onChange={(event) => setOwner(event.target.value)}
            value={owner}
          >
            <option value="ALL">Todos os proprietários</option>
            {owners.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="dashboard-access">
            Acesso
          </label>
          <Select
            id="dashboard-access"
            leadingChevron
            onChange={(event) => setAccess(event.target.value)}
            value={access}
          >
            <option value="ALL">Todos os acessos</option>
            <option value="EDIT">Pode editar</option>
            <option value="VIEW">Pode visualizar</option>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="dashboard-sort">
            Ordenar por
          </label>
          <Select
            id="dashboard-sort"
            leadingChevron
            onChange={(event) => setSort(event.target.value as SortValue)}
            value={sort}
          >
            <option value="recent">Atualizados recentemente</option>
            <option value="name">Nome (A–Z)</option>
            <option value="size">Mais análises</option>
          </Select>
        </div>
      </div>
      <div className="mt-6 mb-3 flex items-center justify-between text-[13px] text-ink-soft">
        <span>{visible.length} dashboards</span>
        <span>Última edição do dashboard, não dos dados</span>
      </div>
      {dashboards.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-[270px]" key={index} />
          ))}
        </div>
      ) : dashboards.isError ? (
        <Card>
          <ErrorState error={dashboards.error} onRetry={() => void dashboards.refetch()} />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            action={
              <Link
                className="text-sm font-semibold text-brand-navy hover:underline"
                to="/dashboards/novo"
              >
                Criar dashboard
              </Link>
            }
            description="Salve análises no Explorar e organize-as em dashboards."
            icon={<Layers aria-hidden className="h-8 w-8" />}
            title="Nenhum dashboard por aqui"
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((dashboard) => (
            <DashboardCard
              dashboard={dashboard}
              key={dashboard.id}
              onDelete={() => setToDelete(dashboard)}
              onFavorite={() => favorite.mutate(dashboard)}
            />
          ))}
        </div>
      )}
      <p className="mt-8 flex items-center gap-2 text-[13px] text-ink-soft">
        <Info aria-hidden className="h-4 w-4" />A análise começa no Explorar. Aqui, você organiza o
        que salvou e escolhe com quem compartilhar.
      </p>
      <Dialog
        description={
          toDelete
            ? `“${toDelete.name}” será excluído. As análises salvas continuam disponíveis.`
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
              Excluir dashboard
            </Button>
          </>
        }
        onClose={() => setToDelete(null)}
        open={Boolean(toDelete)}
        title="Excluir dashboard?"
      />
    </div>
  );
}
