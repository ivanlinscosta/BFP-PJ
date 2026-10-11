import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { PRIMARY_NAVIGATION, type NavigationItem } from '@/app/navigation';
import { cn } from '@/lib/utils';
import { useSidebarStore } from './sidebar-store';

function SidebarLink({ item, collapsed }: { item: NavigationItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      to={item.path}
    >
      {({ isActive }) => (
        <span
          className={cn(
            'flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors',
            collapsed && 'justify-center px-0',
            isActive
              ? 'bg-peach-soft font-semibold text-brand-navy'
              : 'text-ink-soft hover:bg-muted hover:text-brand-navy',
          )}
        >
          <Icon
            aria-hidden
            className={cn('h-5 w-5 shrink-0', isActive ? 'text-brand-orange' : 'text-ink-soft')}
            strokeWidth={1.75}
          />
          {collapsed ? null : <span className="leading-none">{item.label}</span>}
        </span>
      )}
    </NavLink>
  );
}

/** Fixed white sidebar: Itaú mark, product name, navigation; collapses to icons. */
export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-line bg-card transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[var(--spacing-sidebar-collapsed)]' : 'w-[var(--spacing-sidebar)]',
      )}
    >
      <div
        className={cn(
          'border-b border-line pt-6 pb-4',
          collapsed ? 'mx-2 flex justify-center' : 'mx-4 px-2',
        )}
      >
        <img
          alt="Itaú"
          className={collapsed ? 'h-10 w-10' : 'h-[60px] w-[60px]'}
          height={60}
          src="/itau-logo.png"
          width={60}
        />
        {collapsed ? null : (
          <>
            <p className="mt-6 text-lg leading-tight font-bold text-brand-navy">BFP - PJ</p>
            <p className="mt-1.5 text-[13px] text-ink-soft">Plataforma analítica</p>
          </>
        )}
      </div>
      <nav
        aria-label="Navegação principal"
        className={cn('mt-6 border-b border-line pb-4', collapsed ? 'mx-2' : 'mx-4')}
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {PRIMARY_NAVIGATION.map((item) => (
            <li key={item.path}>
              <SidebarLink collapsed={collapsed} item={item} />
            </li>
          ))}
        </ul>
      </nav>
      <div className={cn('mt-auto pb-4', collapsed ? 'mx-2' : 'mx-4')}>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          className={cn(
            'flex h-10 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm text-ink-soft hover:bg-muted hover:text-brand-navy',
            collapsed && 'justify-center px-0',
          )}
          onClick={toggle}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          type="button"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose aria-hidden className="h-5 w-5" strokeWidth={1.75} />
              <span className="leading-none">Recolher menu</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/** Compact navigation for narrow viewports (tablet/mobile). */
export function MobileNavigation() {
  return (
    <nav
      aria-label="Navegação"
      className="flex gap-1 overflow-x-auto border-b border-line bg-card px-4 py-2 lg:hidden"
    >
      {PRIMARY_NAVIGATION.map((item) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              'rounded px-3 py-1.5 text-[13px] whitespace-nowrap',
              isActive ? 'bg-peach-soft font-semibold text-brand-navy' : 'text-ink-soft',
            )
          }
          key={item.path}
          to={item.path}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
