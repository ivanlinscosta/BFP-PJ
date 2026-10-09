import { relativeChange } from './features';
import type { CustomerChange, CustomerFeatureSet, CustomerRawData } from './types';

function change(input: {
  metric: string;
  label: string;
  current: number;
  previous: number;
  window: string;
  unit: CustomerChange['unit'];
  display: CustomerChange['display'];
  weight: number;
}): CustomerChange {
  const absoluteChange = input.current - input.previous;
  const percentageChange =
    input.previous === 0
      ? null
      : Math.round(relativeChange(input.current, input.previous) * 1000) / 1000;
  const magnitude =
    input.display === 'ABSOLUTE'
      ? Math.min(1, Math.abs(absoluteChange) / 4)
      : Math.min(1, Math.abs(percentageChange ?? 0) / 0.3);
  return {
    metric: input.metric,
    label: input.label,
    currentValue: Math.round(input.current * 100) / 100,
    previousValue: Math.round(input.previous * 100) / 100,
    absoluteChange: Math.round(absoluteChange * 100) / 100,
    percentageChange,
    direction: absoluteChange > 0 ? 'UP' : absoluteChange < 0 ? 'DOWN' : 'FLAT',
    relevance: Math.round(magnitude * input.weight * 100) / 100,
    window: input.window,
    unit: input.unit,
    display: input.display,
  };
}

/**
 * Change detector: compares the last window with the previous one for the metrics that move
 * the customer reading. Changes below 5% (or no absolute change) are not reported.
 */
export function detectChanges(
  raw: CustomerRawData,
  features: CustomerFeatureSet,
): CustomerChange[] {
  const candidates = [
    change({
      metric: 'transaction_volume_30d',
      label: 'Volume transacional',
      current: features.transaction_volume_30d,
      previous: features.transaction_volume_prev_30d,
      window: '30 dias vs. 30 anteriores',
      unit: 'BRL',
      display: 'PERCENT',
      weight: 1,
    }),
    change({
      metric: 'digital_sessions_30d',
      label: 'Acessos digitais',
      current: features.digital_sessions_30d,
      previous: features.digital_sessions_prev_30d,
      window: '30 dias vs. 30 anteriores',
      unit: 'COUNT',
      display: 'PERCENT',
      weight: 0.95,
    }),
    change({
      metric: 'credit_content_views_14d',
      label: 'Interações com conteúdo de crédito',
      current: features.credit_page_views_14d,
      previous: features.credit_page_views_prev_14d,
      window: '14 dias vs. 14 anteriores',
      unit: 'COUNT',
      display: 'ABSOLUTE',
      weight: 0.9,
    }),
    change({
      metric: 'card_volume_30d',
      label: 'Uso do cartão empresarial',
      current: features.card_volume_30d,
      previous: features.card_volume_prev_30d,
      window: '30 dias vs. 30 anteriores',
      unit: 'BRL',
      display: 'PERCENT',
      weight: 0.85,
    }),
    change({
      metric: 'payments_volume_60d',
      label: 'Volume de pagamentos',
      current: features.payments_volume_60d,
      previous: features.payments_volume_prev_60d,
      window: '60 dias vs. 60 anteriores',
      unit: 'BRL',
      display: 'PERCENT',
      weight: 0.5,
    }),
    change({
      metric: 'crm_interactions_30d',
      label: 'Interações com o banco',
      current: features.crm_interactions_30d,
      previous: Math.max(0, features.crm_interactions_90d - features.crm_interactions_30d) / 2,
      window: '30 dias vs. média dos 60 anteriores',
      unit: 'COUNT',
      display: 'ABSOLUTE',
      weight: 0.3,
    }),
  ];
  return candidates
    .filter((item) =>
      item.display === 'ABSOLUTE'
        ? Math.abs(item.absoluteChange) >= 1
        : Math.abs(item.percentageChange ?? 0) >= 0.05,
    )
    .sort((left, right) => right.relevance - left.relevance);
}
