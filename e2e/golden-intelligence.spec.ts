import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

const SPEC = {
  datasets: ['customer_360'],
  metrics: [{ id: 'account_conversion_rate' }],
  dimensions: [{ id: 'acquisition_channel' }],
  filters: [{ field: 'state', operator: 'EQ', value: 'SP' }],
  dateRange: { type: 'LAST_N_DAYS', value: 90 },
  visualization: { type: 'BAR' },
};

test('Golden path 2: Inteligência PJ consulta dados e altera o AnalysisSpec', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(SPEC))}`);
  await expect(
    page.getByRole('heading', { name: 'Conversão de abertura por canal' }),
  ).toBeVisible();

  await page.goto('/inteligencia');
  const input = page.getByLabel('Pergunte aos seus dados');
  await input.fill('Qual canal combina melhor conversão com menor CAC?');
  await input.press('Enter');
  await expect(
    page.getByText(/apresenta o melhor equilíbrio no período selecionado/),
  ).toBeVisible();
  await expect(page.getByText(/R\$/).first()).toBeVisible();
  await expect(page.getByText('Base da resposta')).toBeVisible();

  await input.fill('Agora separa por porte.');
  await input.press('Enter');
  await expect(page.getByText('Porte da empresa adicionado à análise.')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir no playground' }).click();
  await expect(page).toHaveURL(/\/explorar$/);
  await expect(page.getByRole('button', { name: 'Remover Porte da empresa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /por Canal e Porte da empresa/ })).toBeVisible();

  expect(errors).toEqual([]);
});
