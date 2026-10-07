import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

test('Golden path 1: Explorar → canal → SP → 90 dias → barras → porte → heatmap → salvar → dashboard', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto('/explorar');

  // The engine only runs after the user chooses the data mesh bases of the analysis.
  await page.getByRole('button', { name: 'Selecionar bases de dados' }).first().click();
  const picker = page.getByRole('dialog', { name: 'Bases de dados do data mesh' });
  await picker.getByRole('checkbox', { name: /Customer 360/ }).check();
  await picker.getByRole('button', { name: 'Usar 1 base' }).click();

  const library = page.getByRole('complementary', { name: 'Biblioteca de dados' });
  await library.getByRole('button', { name: /Conversão de abertura/ }).click();
  await library.getByRole('button', { name: /^Canal/ }).click();

  await page.getByRole('button', { name: 'Adicionar filtro' }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar filtro' });
  await dialog.getByLabel('Dimensão').selectOption('state');
  await dialog.getByLabel('SP', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Aplicar filtro' }).click();

  await expect(page.getByText('Estado = SP').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Período: Últimos 90 dias' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Conversão de abertura por canal' }),
  ).toBeVisible();
  await expect(page.getByRole('figure', { name: /Conversão de abertura por Canal/ })).toBeVisible();
  await expect(page.getByText('Insights da análise')).toBeVisible();

  await page.getByRole('button', { name: 'Segmentar por Porte da empresa' }).click();
  await expect(
    page.getByRole('heading', { name: 'Conversão de abertura por Canal e Porte da empresa' }),
  ).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Média' })).toBeVisible();
  await expect(page.locator('[data-level="max"]').first()).toBeVisible();

  await page.getByRole('button', { name: 'Salvar análise' }).click();
  const save = page.getByRole('dialog', { name: 'Salvar análise' });
  await save.getByLabel('Nome da análise').fill('E2E — Conversão por canal e porte (SP)');
  await save.getByRole('button', { name: 'Salvar análise' }).click();
  await expect(page.getByText('Análise salva')).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar ao dashboard' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Adicionar ao dashboard' });
  await addDialog.getByRole('button', { name: /Aquisição por canal/ }).click();
  await expect(addDialog.getByText(/Análise adicionada a “Aquisição por canal”/)).toBeVisible();
  await addDialog.getByRole('link', { name: 'Abrir dashboard' }).click();
  await expect(
    page.getByRole('heading', { name: 'E2E — Conversão por canal e porte (SP)' }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
