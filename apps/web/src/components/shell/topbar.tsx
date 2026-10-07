import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, CircleHelp, LogOut, Sparkles } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatRelative } from '@/lib/format';
import { apiRequest } from '@/services/apiClient';
import { getCurrentUser, getInitials, logout } from '@/services/auth';

const ROLE_LABELS = { admin: 'Administrador', analyst: 'Analista', business: 'Negócio' } as const;

function useFreshness() {
  return useQuery({
    queryKey: ['governance', 'freshness'],
    queryFn: () => apiRequest<{ lastLoadedAt: string; minutes: number }>('/governance/freshness'),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** White topbar: global search, freshness, help, notifications, Inteligência PJ and profile. */
export function Topbar() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const freshness = useFreshness();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    if (query) navigate(`/busca?${new URLSearchParams({ q: query }).toString()}`);
  }

  return (
    <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] items-center gap-5 border-b border-line bg-card px-6">
      <form className="w-full max-w-[300px]" onSubmit={handleSearch} role="search">
        <label className="sr-only" htmlFor="global-search">
          Buscar análises, empresas e dados
        </label>
        <div className="relative">
          <svg
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-ink-soft"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-card pr-3 pl-9 text-sm placeholder:text-ink-soft focus:border-brand-navy focus:outline-none"
            id="global-search"
            name="q"
            placeholder="Buscar análises, empresas e dados"
            type="search"
          />
        </div>
      </form>

      <p
        className="hidden items-center gap-2 text-xs text-ink-soft md:flex"
        title={freshness.data?.lastLoadedAt}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
        {freshness.data
          ? `Dados atualizados ${formatRelative(freshness.data.lastLoadedAt)}`
          : 'Verificando atualização dos dados'}
      </p>

      <div className="ml-auto flex items-center gap-5">
        <Link
          aria-label="Ajuda e roteiro de uso"
          className="text-ink-soft hover:text-brand-navy"
          to="/catalogo"
        >
          <CircleHelp aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <button
          aria-label="Notificações"
          className="text-ink-soft hover:text-brand-navy"
          type="button"
        >
          <Bell aria-hidden className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <Link
          className="hidden items-center gap-2 text-[13px] font-semibold text-brand-navy sm:flex"
          to="/inteligencia"
        >
          <Sparkles aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
          Inteligência PJ
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-3 rounded-[var(--radius-control)] py-1 pr-1 pl-1 hover:bg-muted"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tint text-xs font-bold text-brand-navy">
              {getInitials(user?.name ?? 'Usuário')}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[13px] font-semibold text-ink">
                {user?.name ?? 'Usuário'}
              </span>
              <span className="block text-[11px] text-ink-soft">{user?.team ?? ''}</span>
            </span>
            <ChevronDown aria-hidden className="h-4 w-4 text-ink-soft" />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 mt-2 w-56 rounded-[var(--radius-card)] border border-line bg-card p-2 shadow-[0_8px_24px_rgba(0,26,71,0.12)]"
              role="menu"
            >
              <p className="px-3 py-2 text-xs text-ink-soft">
                {user?.email}
                <br />
                Perfil: {user ? ROLE_LABELS[user.role] : '—'}
              </p>
              <button
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-muted"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
                role="menuitem"
                type="button"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
