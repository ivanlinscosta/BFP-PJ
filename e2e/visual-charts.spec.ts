import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

/**
 * One screenshot per chart family (1440 × 1024), drawn from real governed queries of the local
 * environment through the same POST /analytics/query. Saved to artifacts/charts.
 */
const CHARTS: Array<{ name: string; spec: Record<string, unknown> }> = [
  {
    name: '01-kpi',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [],
      visualization: { type: 'KPI', mode: 'MANUAL' },
    },
  },
  {
    name: '02-bar',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      visualization: { type: 'BAR_HORIZONTAL', mode: 'MANUAL' },
    },
  },
  {
    name: '03-line',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'account_opened_date', granularity: 'month' }],
      visualization: { type: 'LINE', mode: 'MANUAL' },
    },
  },
  {
    name: '04-grouped-bar',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }, { id: 'activation_d30' }],
      dimensions: [{ id: 'acquisition_channel' }],
      visualization: { type: 'COLUMN_GROUPED', mode: 'MANUAL' },
    },
  },
  {
    name: '05-stacked',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'company_size' }, { id: 'acquisition_channel' }],
      visualization: { type: 'COLUMN_STACKED', mode: 'MANUAL' },
    },
  },
  {
    name: '06-donut',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'company_size' }],
      visualization: { type: 'DONUT', mode: 'MANUAL' },
    },
  },
  {
    name: '07-heatmap',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }],
      visualization: { type: 'HEATMAP', mode: 'MANUAL' },
    },
  },
  {
    name: '08-funnel',
    spec: {
      datasets: ['customer_360'],
      metrics: [
        { id: 'leads' },
        { id: 'accounts_opened' },
        { id: 'onboarding_completed' },
        { id: 'activation_d30' },
      ],
      dimensions: [],
      visualization: { type: 'FUNNEL', mode: 'MANUAL' },
    },
  },
  {
    name: '09-scatter',
    spec: {
      datasets: ['media_touchpoints', 'customer_360'],
      metrics: [{ id: 'cac' }, { id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_campaign' }],
      visualization: { type: 'SCATTER', mode: 'MANUAL' },
    },
  },
  {
    name: '10-bubble',
    spec: {
      datasets: ['media_touchpoints', 'customer_360'],
      metrics: [{ id: 'cac' }, { id: 'account_conversion_rate' }, { id: 'new_companies' }],
      dimensions: [{ id: 'acquisition_campaign' }],
      visualization: { type: 'BUBBLE', mode: 'MANUAL' },
    },
  },
  {
    name: '11-treemap',
    spec: {
      datasets: ['transactions', 'customer_360'],
      metrics: [{ id: 'transaction_volume' }],
      dimensions: [{ id: 'industry' }],
      visualization: { type: 'TREEMAP', mode: 'MANUAL' },
    },
  },
  {
    name: '12-map',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'state' }],
      visualization: { type: 'MAP', mode: 'MANUAL' },
    },
  },
  {
    name: '13-cohort',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'activation_d30' }],
      dimensions: [
        { id: 'account_opened_date', granularity: 'month' },
        { id: 'activation_date', granularity: 'month' },
      ],
      visualization: { type: 'COHORT', mode: 'MANUAL' },
    },
  },
  {
    name: '14-sankey',
    spec: {
      datasets: ['company_products', 'customer_360'],
      metrics: [{ id: 'contracted_products' }],
      dimensions: [{ id: 'acquisition_channel' }, { id: 'product' }],
      visualization: { type: 'SANKEY', mode: 'MANUAL' },
    },
  },
  {
    name: '15-waterfall',
    spec: {
      datasets: ['transactions'],
      metrics: [{ id: 'transaction_volume' }],
      dimensions: [{ id: 'transaction_type' }],
      visualization: { type: 'WATERFALL', mode: 'MANUAL' },
    },
  },
  {
    name: '16-bar-grouped',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }, { id: 'activation_d30' }],
      dimensions: [{ id: 'acquisition_channel' }],
      visualization: { type: 'BAR_GROUPED', mode: 'MANUAL' },
    },
  },
  {
    name: '17-bar-100',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'company_size' }, { id: 'acquisition_channel' }],
      visualization: { type: 'BAR_100_STACKED', mode: 'MANUAL' },
    },
  },
  {
    name: '18-multi-line',
    spec: {
      datasets: ['transactions', 'customer_360'],
      metrics: [{ id: 'transaction_volume' }],
      dimensions: [{ id: 'transaction_date', granularity: 'month' }, { id: 'company_size' }],
      visualization: { type: 'MULTI_LINE', mode: 'MANUAL' },
    },
  },
  {
    name: '19-area-stacked',
    spec: {
      datasets: ['transactions'],
      metrics: [{ id: 'transaction_volume' }],
      dimensions: [{ id: 'transaction_date', granularity: 'month' }, { id: 'transaction_type' }],
      visualization: { type: 'AREA_STACKED', mode: 'MANUAL' },
    },
  },
  {
    name: '20-histogram',
    spec: {
      datasets: ['transactions', 'customer_360'],
      metrics: [{ id: 'transaction_volume' }],
      dimensions: [{ id: 'industry' }],
      visualization: { type: 'HISTOGRAM', mode: 'MANUAL' },
    },
  },
  {
    name: '21-box-plot',
    spec: {
      datasets: ['transactions', 'customer_360'],
      metrics: [{ id: 'transaction_volume' }],
      dimensions: [{ id: 'company_size' }, { id: 'industry' }],
      visualization: { type: 'BOX_PLOT', mode: 'MANUAL' },
    },
  },
  {
    name: '22-quadrant',
    spec: {
      datasets: ['media_touchpoints', 'customer_360'],
      metrics: [{ id: 'cac' }, { id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_campaign' }],
      visualization: { type: 'QUADRANT', mode: 'MANUAL' },
    },
  },
  {
    name: '23-retention',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'activation_d30' }],
      dimensions: [
        { id: 'account_opened_date', granularity: 'month' },
        { id: 'activation_date', granularity: 'month' },
      ],
      visualization: { type: 'RETENTION_CURVE', mode: 'MANUAL' },
    },
  },
  {
    name: '24-radar',
    spec: {
      datasets: ['customer_intelligence'],
      metrics: [
        { id: 'dna_relationship_strength_score' },
        { id: 'dna_digital_engagement_score' },
        { id: 'dna_product_depth_score' },
        { id: 'dna_transaction_activity_score' },
        { id: 'dna_business_momentum_score' },
        { id: 'dna_commercial_intent_score' },
      ],
      dimensions: [],
      visualization: { type: 'RADAR', mode: 'MANUAL' },
    },
  },
  {
    name: '25-calendar',
    spec: {
      datasets: ['transactions'],
      metrics: [{ id: 'transactions_count' }],
      dimensions: [{ id: 'transaction_date', granularity: 'date' }],
      visualization: { type: 'CALENDAR_HEATMAP', mode: 'MANUAL' },
    },
  },
  {
    name: '26-ranking',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'state' }],
      visualization: { type: 'RANKING', mode: 'MANUAL' },
    },
  },
  {
    name: '27-table',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'account_conversion_rate' }],
      dimensions: [{ id: 'acquisition_channel' }],
      visualization: { type: 'TABLE', mode: 'MANUAL' },
    },
  },
  {
    name: '28-timeline',
    spec: {
      datasets: ['app_navigation'],
      metrics: [{ id: 'app_interactions' }],
      dimensions: [{ id: 'app_event_date', granularity: 'date' }, { id: 'app_action' }],
      visualization: { type: 'TIMELINE', mode: 'MANUAL' },
    },
  },
  {
    name: '29-area',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'account_opened_date', granularity: 'month' }],
      visualization: { type: 'AREA', mode: 'MANUAL' },
    },
  },
  {
    name: '30-column',
    spec: {
      datasets: ['customer_360'],
      metrics: [{ id: 'accounts_opened' }],
      dimensions: [{ id: 'company_size' }],
      visualization: { type: 'COLUMN', mode: 'MANUAL' },
    },
  },
];

for (const chart of CHARTS) {
  test(`visual: gráfico ${chart.name}`, async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await login(page);
    const spec = {
      filters: [],
      dateRange: { type: 'LAST_N_DAYS', value: 365 },
      ...chart.spec,
    };
    await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(spec))}`);
    const figure = page.locator('[aria-busy] [role="group"]').first();
    await expect(figure).toBeVisible({ timeout: 20_000 });
    // The pinned chart is drawn (no "not compatible" notice).
    await expect(page.getByText('não é compatível com a análise atual')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    const card = page.locator('[aria-busy]').first();
    await card.screenshot({ path: `artifacts/charts/${chart.name}.png` });
    expect(errors).toEqual([]);
  });
}
