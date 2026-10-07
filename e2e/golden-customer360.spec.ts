import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

test('Cliente PJ 360: busca → detalhe → jornada cronológica → explorar semelhantes', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto('/clientes');
  await page.getByLabel('Buscar por nome ou CNPJ').fill('Atlas Tecnologia');
  await page.getByRole('link', { name: 'Atlas Tecnologia Ltda.' }).click();

  await expect(page.getByRole('heading', { name: 'Atlas Tecnologia Ltda.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Uma jornada, todas as conexões' })).toBeVisible();
  const dates = await page
    .locator('section[aria-labelledby="journey-title"] time')
    .evaluateAll((items) => items.map((item) => item.getAttribute('datetime') ?? ''));
  expect(dates.length).toBeGreaterThan(3);
  expect([...dates].sort()).toEqual(dates);

  await page.getByRole('link', { name: /Explorar empresas semelhantes/ }).click();
  await expect(page).toHaveURL(/\/explorar/);
  await expect(page.getByText(/Porte da empresa = /).first()).toBeVisible();

  expect(errors).toEqual([]);
});
