import { Outlet } from 'react-router';
import { MobileNavigation, Sidebar } from '@/components/shell/sidebar';
import { useSidebarStore } from '@/components/shell/sidebar-store';
import { Topbar } from '@/components/shell/topbar';
import { cn } from '@/lib/utils';

/** Global shell: fixed sidebar, sticky topbar and the light gray canvas. */
export function AppShell() {
  const collapsed = useSidebarStore((state) => state.collapsed);
  return (
    <div className="min-h-screen bg-page">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2"
        href="#conteudo"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200',
          collapsed ? 'lg:pl-[var(--spacing-sidebar-collapsed)]' : 'lg:pl-[var(--spacing-sidebar)]',
        )}
      >
        <Topbar />
        <MobileNavigation />
        <main className="flex-1 px-4 pt-7 pb-6 sm:px-6" id="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
