import type { DashboardCard, DashboardDefinition, SharingLevel } from '@bfp/domain';
import type { ObjectAccess, SavedAnalysis } from '@/features/explorer/api';
import { apiRequest } from '@/services/apiClient';

export interface DashboardCardSummary {
  cardId: string;
  analysisId: string;
  title: string;
  subtitle: string;
  available: boolean;
}

export interface DashboardView extends DashboardDefinition {
  access: ObjectAccess;
  isFavorite: boolean;
  cardSummaries: DashboardCardSummary[];
}

export interface DashboardInput {
  name: string;
  description?: string;
  cards: DashboardCard[];
  visibility?: SharingLevel;
  team?: string;
}

export async function listDashboards() {
  return (await apiRequest<{ items: DashboardView[] }>('/dashboards')).items;
}

export async function getDashboard(id: string) {
  return apiRequest<{ dashboard: DashboardView; analyses: Record<string, SavedAnalysis> }>(
    `/dashboards/${encodeURIComponent(id)}`,
  );
}

export async function createDashboard(input: DashboardInput) {
  return (
    await apiRequest<{ dashboard: DashboardView }, DashboardInput>('/dashboards', {
      method: 'POST',
      body: input,
    })
  ).dashboard;
}

export async function updateDashboard(id: string, input: DashboardInput) {
  return (
    await apiRequest<{ dashboard: DashboardView }, DashboardInput>(
      `/dashboards/${encodeURIComponent(id)}`,
      { method: 'PUT', body: input },
    )
  ).dashboard;
}

export async function deleteDashboard(id: string) {
  await apiRequest<void>(`/dashboards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setDashboardFavorite(id: string, favorite: boolean) {
  return apiRequest<{ isFavorite: boolean }, { favorite: boolean }>(
    `/dashboards/${encodeURIComponent(id)}/favorite`,
    { method: 'PUT', body: { favorite } },
  );
}

/** Appends an analysis as a new grid card. */
export function appendCard(
  cards: DashboardCard[],
  analysis: { id: string; name: string },
): DashboardCard[] {
  const index = cards.length;
  return [
    ...cards,
    {
      id: `card-${Date.now().toString(36)}-${index}`,
      title: analysis.name,
      analysisId: analysis.id,
      layout: { mode: 'GRID', x: (index % 2) * 6, y: Math.floor(index / 2) * 4, w: 6, h: 4 },
    },
  ];
}

/** Recomputes grid coordinates after a reorder, so the order persists. */
export function relayoutCards(cards: DashboardCard[]): DashboardCard[] {
  return cards.map((card, index) => ({
    ...card,
    layout: { ...card.layout, x: (index % 2) * 6, y: Math.floor(index / 2) * 4 },
  }));
}

/** Input payload from a view (drops server-computed fields). */
export function toDashboardInput(
  dashboard: DashboardView,
  cards = dashboard.cards,
): DashboardInput {
  return {
    name: dashboard.name,
    description: dashboard.description,
    cards,
    visibility: dashboard.visibility,
    team: dashboard.team,
  };
}
