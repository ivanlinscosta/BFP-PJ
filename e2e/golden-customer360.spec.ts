import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

test('Cliente PJ 360: Atlas → DNA → NBA Capital de Giro → entender → próximas ações → sinais → semelhantes', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto('/clientes');
  await page.getByLabel('Buscar por nome ou CNPJ').fill('Atlas Tecnologia');
  await page.getByRole('link', { name: 'Atlas Tecnologia Ltda.' }).click();

  await expect(page.getByRole('heading', { name: 'Atlas Tecnologia Ltda.' })).toBeVisible();
  // DNA computed by the pipeline (values come from the read model, not from the page).
  await expect(page.getByText('DNA do cliente')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Intenção comercial: \d+ de 100/ })).toBeVisible();
  await expect(page.getByText('Oferecer Capital de Giro').first()).toBeVisible();
  await expect(page.getByText('Por que agora?')).toBeVisible();
  await expect(page.getByText('O que mudou neste cliente?')).toBeVisible();

  await page.getByRole('button', { name: 'Entender recomendação' }).click();
  const drawer = page.getByRole('dialog', { name: 'Oferecer Capital de Giro' });
  await expect(drawer.getByText('Como o score foi calculado')).toBeVisible();
  await expect(drawer.getByText('Alternativas consideradas')).toBeVisible();
  await page.keyboard.press('Escape');

  const sections = page.getByRole('tablist', { name: 'Seções do cliente' });
  await sections.getByRole('tab', { name: 'Próximas ações' }).click();
  await expect(page.getByText('#1').first()).toBeVisible();
  await page.getByRole('button', { name: 'Comparar recomendações' }).click();
  await expect(page.getByRole('columnheader', { name: 'Relevância' })).toBeVisible();

  await sections.getByRole('tab', { name: 'Sinais' }).click();
  await expect(page.getByText(/Alta intenção em crédito/).first()).toBeVisible();

  await page.getByRole('link', { name: /Explorar empresas semelhantes/ }).click();
  await expect(page).toHaveURL(/\/explorar/);
  await expect(page.getByText(/Porte da empresa = /).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('Cluster: audiência → Analisar DNA do público', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto('/audiencias/nova?modelo=capital-de-giro');
  await expect(page.getByText('empresas elegíveis')).toBeVisible();
  await page.getByRole('button', { name: 'Analisar DNA do público' }).click();
  const drawer = page.getByRole('dialog', { name: 'DNA do público' });
  await expect(drawer.getByText(/DNA do grupo · /)).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Ação #1 mais frequente' })).toBeVisible();
  expect(errors).toEqual([]);
});
