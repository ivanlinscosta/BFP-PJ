import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

const SPEC = {
  datasets: ['customer_360'],
  metrics: [{ id: 'accounts_opened' }],
  dimensions: [{ id: 'acquisition_channel' }],
  filters: [],
  dateRange: { type: 'LAST_N_DAYS', value: 365 },
  visualization: { type: 'AUTO', mode: 'AUTO' },
};

test('Exportar: escolhe CSV, PDF ou PNG', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(SPEC))}`);
  await expect(page.getByRole('heading', { name: /Contas abertas por canal/i })).toBeVisible();

  const exportButton = page.getByRole('button', { name: 'Exportar' });
  await exportButton.click();
  const menu = page.getByRole('menu', { name: 'Formato do export' });
  await expect(menu.getByRole('menuitem')).toHaveCount(3);

  for (const [label, extension] of [
    ['CSV', 'csv'],
    ['Imagem PNG', 'png'],
    ['PDF', 'pdf'],
  ] as const) {
    if (!(await menu.isVisible())) await exportButton.click();
    const download = page.waitForEvent('download');
    await menu.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('Aprofundar na Inteligência PJ leva a análise para o chat', async ({ page }) => {
  await login(page);
  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(SPEC))}`);
  await expect(page.getByRole('heading', { name: /Contas abertas por canal/i })).toBeVisible();
  await page.getByRole('link', { name: 'Aprofundar na Inteligência PJ' }).click();

  await expect(page).toHaveURL(/\/inteligencia$/);
  await expect(
    page.getByText(/Trouxe a sua análise do Explorar: Contas abertas por canal/i),
  ).toBeVisible();
  await expect(page.getByText('Análise do Explorar', { exact: true })).toBeVisible();
  await expect(page.getByText(/Respondido com: Customer 360/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare com o período anterior' })).toBeVisible();
  // The composer is enabled: the bases of the analysis are selected.
  await expect(page.getByRole('textbox').last()).toBeEnabled();

  // A follow-up question is answered about this analysis.
  const request = page.waitForRequest((r) => r.url().includes('/api/ai/chat'));
  await page
    .getByRole('button', { name: 'Quais são os principais destaques desta análise?' })
    .click();
  const body = (await request).postDataJSON() as { analysisSpec?: { metrics: { id: string }[] } };
  expect(body.analysisSpec?.metrics).toEqual([{ id: 'accounts_opened' }]);
  await expect(page.locator('li[id^="chat-entry-"]')).toHaveCount(3, { timeout: 30_000 });
});
