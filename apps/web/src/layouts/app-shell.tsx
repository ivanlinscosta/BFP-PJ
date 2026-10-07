import { Outlet } from 'react-router';
import { MobileNavigation, Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';

/** Global shell: fixed sidebar, sticky topbar and the light gray canvas. */
export function AppShell() {
  return (
    <div className="min-h-screen bg-page">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-2"
        href="#conteudo"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-[var(--spacing-sidebar)]">
        <Topbar />
        <MobileNavigation />
        <main className="flex-1 px-4 pt-7 pb-6 sm:px-6" id="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
