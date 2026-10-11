import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

test('Explorar: busca nos menus de métricas, dimensões e filtros', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  const spec = {
    datasets: ['customer_360', 'media_touchpoints'],
    metrics: [{ id: 'account_conversion_rate' }],
    dimensions: [],
    filters: [],
    dateRange: { type: 'LAST_N_DAYS', value: 365 },
    visualization: { type: 'AUTO' },
  };
  await page.goto(`/explorar?spec=${encodeURIComponent(JSON.stringify(spec))}`);

  // Métricas: the search field takes focus; Enter adds the first match.
  await page.getByRole('button', { name: 'Adicionar métrica' }).click();
  await expect(page.getByLabel('Buscar métrica', { exact: true })).toBeFocused();
  await page.keyboard.type('cac');
  await expect(
    page.getByRole('listbox', { name: 'Métricas disponíveis' }).getByRole('option'),
  ).toHaveText(['CAC']);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remover CAC' })).toBeVisible();

  // Dimensões
  await page.getByRole('button', { name: 'Dimensões: Arraste uma dimensão' }).click();
  await page.getByLabel('Buscar dimensão', { exact: true }).fill('porte');
  await expect(
    page.getByRole('listbox', { name: 'Dimensões disponíveis' }).getByRole('option'),
  ).toHaveText(['Porte da empresa']);
  await page.getByLabel('Buscar dimensão', { exact: true }).fill('xyz');
  await expect(page.getByText('Nenhuma dimensão encontrada para “xyz”.')).toBeVisible();
  await page.keyboard.press('Escape');

  // Filtros: dimension and values
  await page.getByRole('button', { name: 'Adicionar filtro' }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar filtro' });
  await dialog.getByLabel('Buscar dimensão').fill('campanha');
  await expect(dialog.getByLabel('Dimensão', { exact: true })).toHaveValue('acquisition_campaign');
  await dialog.getByLabel('Buscar valor').fill('linkedin');
  const values = dialog.locator('input[name="filter-value"]');
  await expect(values.first()).toBeVisible();
  for (const label of await dialog
    .locator('label:has(input[name="filter-value"])')
    .allTextContents()) {
    expect(label.toLowerCase()).toContain('linkedin');
  }
  expect(errors).toEqual([]);
});
