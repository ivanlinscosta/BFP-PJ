import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/layouts/app-shell';
import { AddAnalysisPage } from '@/pages/add-analysis-page';
import { AdminPage } from '@/pages/admin-page';
import { AnalysesPage } from '@/pages/analyses-page';
import { AudienceBuilderPage } from '@/pages/audience-builder-page';
import { AudiencesPage } from '@/pages/audiences-page';
import { CatalogDatasetPage } from '@/pages/catalog-dataset-page';
import { CatalogPage } from '@/pages/catalog-page';
import { CatalogProductPage } from '@/pages/catalog-product-page';
import { CustomerDetailPage } from '@/pages/customer-detail-page';
import { CustomersPage } from '@/pages/customers-page';
import { DashboardDetailPage } from '@/pages/dashboard-detail-page';
import { DashboardEditorPage } from '@/pages/dashboard-editor-page';
import { DashboardsPage } from '@/pages/dashboards-page';
import { ExplorerPage } from '@/pages/explorer-page';
import { GovernancePage } from '@/pages/governance-page';
import { IntelligencePage } from '@/pages/intelligence-page';
import { LoginPage } from '@/pages/login-page';
import { MetricDetailPage } from '@/pages/metric-detail-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { SavedStudyPage } from '@/pages/saved-study-page';
import { SearchPage } from '@/pages/search-page';
import { hasAccessToken } from '@/services/auth';

function ProtectedAppShell() {
  if (!hasAccessToken()) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />;
  }

  return <AppShell />;
}

export const appChildRoutes: RouteObject[] = [
  { index: true, element: <Navigate replace to="/explorar" /> },
  { path: 'explorar', element: <ExplorerPage /> },
  { path: 'explorar/adicionar', element: <AddAnalysisPage /> },
  { path: 'inteligencia', element: <IntelligencePage /> },
  { path: 'analises', element: <AnalysesPage /> },
  { path: 'analises/estudos/:studyId', element: <SavedStudyPage /> },
  { path: 'dashboards', element: <DashboardsPage /> },
  { path: 'dashboards/novo', element: <DashboardEditorPage /> },
  { path: 'dashboards/:dashboardId', element: <DashboardDetailPage /> },
  { path: 'dashboards/:dashboardId/editar', element: <DashboardEditorPage /> },
  { path: 'audiencias', element: <AudiencesPage /> },
  { path: 'audiencias/nova', element: <AudienceBuilderPage /> },
  { path: 'audiencias/:audienceId', element: <AudienceBuilderPage /> },
  { path: 'clientes', element: <CustomersPage /> },
  { path: 'clientes/:companyId', element: <CustomerDetailPage /> },
  { path: 'catalogo', element: <CatalogPage /> },
  { path: 'catalogo/metricas/:metricId', element: <MetricDetailPage /> },
  { path: 'catalogo/bases/:datasetId', element: <CatalogDatasetPage /> },
  { path: 'catalogo/produtos/:productId', element: <CatalogProductPage /> },
  { path: 'governanca', element: <GovernancePage /> },
  { path: 'admin', element: <AdminPage /> },
  { path: 'busca', element: <SearchPage /> },
  { path: '*', element: <NotFoundPage /> },
];

export const appRoutes: RouteObject[] = [
  { path: '/', element: <ProtectedAppShell />, children: appChildRoutes },
  { path: '/login', element: <LoginPage /> },
];

export const router = createBrowserRouter(appRoutes);
