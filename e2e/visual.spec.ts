import { expect, test } from '@playwright/test';
import { login, selectAllChatBases } from './helpers';

const CHANNEL_SPEC = {
  datasets: ['customer_360'],
  metrics: [{ id: 'account_conversion_rate' }],
  dimensions: [{ id: 'acquisition_channel' }],
  filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
  dateRange: { type: 'LAST_N_DAYS', value: 90 },
  visualization: { type: 'BAR' },
};
const HEATMAP_SPEC = {
  ...CHANNEL_SPEC,
  dimensions: [{ id: 'acquisition_channel' }, { id: 'company_size' }],
  visualization: { type: 'HEATMAP' },
};

/** 1440 × 1024 screenshots of the reference screens, saved to artifacts/screens. */
test('visual: telas de referência em 1440 × 1024', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const shot = async (name: string) => {
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `artifacts/screens/${name}.png` });
  };

  await page.goto('/explorar');
  await expect(page.getByText('Comece sua análise')).toBeVisible();
  await shot('01-explorar-vazio');

  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(CHANNEL_SPEC))}`);
  await expect(page.getByText('Insights da análise')).toBeVisible();
  await shot('02-explorar-conversao-por-canal');

  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(HEATMAP_SPEC))}`);
  await expect(page.locator('[data-level="max"]').first()).toBeVisible();
  await shot('03-explorar-canal-e-porte');

  await page.goto('/audiencias/nova?modelo=capital-de-giro');
  await expect(page.getByText('empresas elegíveis')).toBeVisible();
  await shot('04-audiencias-capital-de-giro');

  await page.goto('/clientes?q=Atlas%20Tecnologia');
  await page.getByRole('link', { name: 'Atlas Tecnologia Ltda.' }).click();
  await expect(page.getByText('DNA do cliente')).toBeVisible();
  await shot('05-cliente-360-atlas');

  await page.goto('/catalogo/metricas/account_conversion_rate');
  await expect(page.getByText('Da origem à decisão')).toBeVisible();
  await shot('06-catalogo-conversao-de-abertura');

  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(CHANNEL_SPEC))}`);
  await expect(page.getByText('Insights da análise')).toBeVisible();
  await page.goto('/inteligencia');
  await selectAllChatBases(page);
  const input = page.getByLabel('Pergunte aos seus dados');
  await input.fill('Qual canal combina melhor conversão com menor CAC?');
  await input.press('Enter');
  await expect(page.getByText(/melhor equilíbrio/)).toBeVisible();
  await input.fill('Agora separa por porte.');
  await input.press('Enter');
  await expect(page.getByText('Porte da empresa adicionado à análise.')).toBeVisible();
  await shot('07-inteligencia-pj');

  await page.goto('/explorar/adicionar');
  await expect(page.getByText('Qual métrica você quer analisar?')).toBeVisible();
  await shot('08-adicionar-analise');

  await page.goto('/dashboards');
  await expect(page.getByRole('heading', { name: 'Aquisição por canal' })).toBeVisible();
  await shot('09-dashboards');

  for (const [path, name, text] of [
    ['/analises', '10-minhas-analises', 'Minhas análises'],
    ['/audiencias', '11-audiencias', 'Minhas audiências'],
    ['/clientes', '12-clientes', 'Clientes PJ'],
    ['/catalogo', '13-catalogo', 'Catálogo'],
    ['/governanca', '14-governanca', 'Governança'],
    ['/dashboards/demo-dashboard-acquisition', '15-dashboard-aquisicao', 'Aquisição por canal'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: text, level: 1 })).toBeVisible();
    await shot(name);
  }

  await login(page, 'admin@example.local');
  await page.goto('/admin');
  await expect(page.getByRole('tab', { name: 'Usuários' })).toBeVisible();
  await shot('16-administracao');
});
