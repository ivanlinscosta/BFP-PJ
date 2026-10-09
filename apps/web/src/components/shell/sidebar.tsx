import { NavLink } from 'react-router';
import { PRIMARY_NAVIGATION, type NavigationItem } from '@/app/navigation';
import { cn } from '@/lib/utils';

function SidebarLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.path}>
      {({ isActive }) => (
        <span
          className={cn(
            'flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors',
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
          <span className="leading-none">{item.label}</span>
        </span>
      )}
    </NavLink>
  );
}

/** Fixed white sidebar: Itaú mark, product name, navigation (as in the approved design). */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--spacing-sidebar)] flex-col border-r border-line bg-card lg:flex">
      <div className="mx-4 border-b border-line px-2 pt-6 pb-4">
        <img alt="Itaú" className="h-[60px] w-[60px]" height={60} src="/itau-logo.png" width={60} />
        <p className="mt-6 text-lg leading-tight font-bold text-brand-navy">BFP - PJ</p>
        <p className="mt-1.5 text-[13px] text-ink-soft">Plataforma analítica</p>
      </div>
      <nav aria-label="Navegação principal" className="mx-4 mt-6 border-b border-line pb-4">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {PRIMARY_NAVIGATION.map((item) => (
            <li key={item.path}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>
      </nav>
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
