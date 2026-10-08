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
  // The answer brings its analysis: chart, findings, source and actions.
  const answer = page.getByRole('region', {
    name: /Análise: Conversão de abertura e CAC por Canal/,
  });
  await expect(answer).toBeVisible();
  await expect(answer.getByText(/Fonte:/)).toBeVisible();
  await answer.getByRole('button', { name: 'Tabela' }).click();
  await expect(answer.getByRole('columnheader', { name: 'CAC' })).toBeVisible();

  await input.fill('Agora separa por porte.');
  await input.press('Enter');
  await expect(page.getByText('Porte da empresa adicionado à análise.')).toBeVisible();
  await expect(page.getByText(/Contexto da conversa:/)).toContainText('Porte da empresa');

  await page.getByRole('button', { name: 'Abrir no Explorar' }).last().click();
  await expect(page).toHaveURL(/\/explorar$/);
  await expect(page.getByRole('button', { name: 'Remover Porte da empresa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /por Canal e Porte da empresa/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test('Inteligência PJ: estudo completo, salvar análise e exportar PDF', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto('/inteligencia');
  await page.evaluate(() => window.sessionStorage.removeItem('bfp-intelligence-chat'));
  await page.reload();

  await page.getByRole('button', { name: /Faça um estudo completo da jornada PJ/ }).click();
  const study = page.getByRole('region', { name: 'Estudo completo da jornada PJ' });
  await expect(study).toBeVisible({ timeout: 30_000 });
  await expect(study.getByRole('heading', { name: 'Recomendações' })).toBeVisible();

  // Each chapter can be saved on its own.
  await study.getByRole('button', { name: 'Salvar' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Salvar análise' });
  await dialog.getByRole('button', { name: 'Salvar análise' }).click();
  await expect(dialog).toBeHidden();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar estudo em PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('estudo-completo-da-jornada-pj.pdf');
  await file.saveAs('artifacts/estudo-completo-da-jornada-pj.pdf');

  expect(errors).toEqual([]);
});
