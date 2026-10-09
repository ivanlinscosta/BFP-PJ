import { apiRequest } from '@/services/apiClient';

export type ProductEvent =
  | 'VISUALIZATION_DROPDOWN_OPENED'
  | 'VISUALIZATION_SELECTED'
  | 'AUTO_VISUALIZATION_SELECTED'
  | 'VISUALIZATION_RECOMMENDATION_ACCEPTED'
  | 'VISUALIZATION_INCOMPATIBLE_ATTEMPT';

export interface ProductEventProperties {
  previousType?: string;
  type?: string;
  mode?: 'AUTO' | 'MANUAL';
  surface?: 'explorer' | 'dashboard' | 'chat';
  /** Analysis shape without values (semantic types and category counts only). */
  shape?: { metrics: string[]; dimensions: string[] };
  rank?: number;
}

/** Records a product event (fire and forget: telemetry never blocks or breaks the UI). */
export function trackEvent(name: ProductEvent, properties: ProductEventProperties = {}) {
  void apiRequest<void, { name: ProductEvent; properties: ProductEventProperties }>('/telemetry', {
    method: 'POST',
    body: { name, properties },
  }).catch(() => undefined);
}
