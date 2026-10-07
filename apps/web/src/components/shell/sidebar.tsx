import { NavLink } from 'react-router';
import { PRIMARY_NAVIGATION, SECONDARY_NAVIGATION, type NavigationItem } from '@/app/navigation';
import { cn } from '@/lib/utils';

function SidebarLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.path}>
      {({ isActive }) => (
        <span
          className={cn(
            'flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-4 text-sm transition-colors',
            isActive
              ? 'bg-cream font-semibold text-brand-navy'
              : 'text-ink-soft hover:bg-muted hover:text-ink',
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              isActive ? 'text-brand-orange' : 'text-ink-faint',
            )}
            strokeWidth={1.75}
          />
          {item.label}
        </span>
      )}
    </NavLink>
  );
}

/** Fixed white sidebar with the Itaú mark, product name and navigation. */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--spacing-sidebar)] flex-col border-r border-line bg-card lg:flex">
      <div className="px-6 pt-11">
        <img alt="Itaú" className="h-[60px] w-[60px]" height={60} src="/itau-logo.png" width={60} />
        <p className="mt-8 text-[28px] leading-none font-bold tracking-[-0.01em] text-brand-navy">
          BFP - PJ
        </p>
        <p className="mt-3 text-[13px] whitespace-nowrap text-ink-soft">
          Business Friendly Platform
        </p>
      </div>
      <nav aria-label="Navegação principal" className="mt-6 flex flex-1 flex-col px-4">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {PRIMARY_NAVIGATION.map((item) => (
            <li key={item.path}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>
        <div className="my-4 border-t border-line" />
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {SECONDARY_NAVIGATION.map((item) => (
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
      {[...PRIMARY_NAVIGATION, ...SECONDARY_NAVIGATION].map((item) => (
        <NavLink
          className={({ isActive }) =>
            cn(
              'rounded px-3 py-1.5 text-[13px] whitespace-nowrap',
              isActive ? 'bg-cream font-semibold text-brand-navy' : 'text-ink-soft',
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
