import { expect, test, type Page } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

const open = (page: Page, spec: Record<string, unknown>) =>
  page.goto(
    `/explorar?spec=${encodeURIComponent(
      JSON.stringify({
        filters: [],
        dateRange: { type: 'LAST_N_DAYS', value: 365 },
        visualization: { type: 'AUTO', mode: 'AUTO' },
        ...spec,
      }),
    )}`,
  );
const trigger = (page: Page) => page.locator('[aria-haspopup="listbox"]').first();
const library = (page: Page) => page.getByRole('complementary', { name: 'Biblioteca de dados' });
const option = (page: Page, name: RegExp) =>
  page.getByRole('listbox', { name: 'Tipos de visualização' }).getByRole('option', { name });

test('Golden path de visualização 1: AUTO acompanha a análise e MANUAL é respeitado', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await open(page, {
    datasets: ['customer_360'],
    metrics: [{ id: 'account_conversion_rate' }],
    dimensions: [],
  });
  await expect(trigger(page)).toHaveText('Automático · Indicador');

  await library(page).getByText('Canal', { exact: true }).click();
  await expect(trigger(page)).toHaveText('Automático · Barras horizontais');

  await trigger(page).click();
  const recommended = page.getByRole('option', { name: /Barras horizontais.*Recomendado/ });
  await expect(recommended).toBeVisible();
  await option(page, /^Tabela/)
    .first()
    .click();
  await expect(trigger(page)).toHaveText('Tabela');

  await library(page).getByText('Porte da empresa', { exact: true }).click();
  // MANUAL: adding a dimension keeps the table.
  await expect(trigger(page)).toHaveText('Tabela');

  await trigger(page).click();
  await option(page, /^Automático/).click();
  await expect(trigger(page)).toHaveText('Automático · Mapa de calor');

  await library(page).getByText('Mês', { exact: true }).click();
  // Three dimensions: the engine recomputes the options (table reads best).
  await expect(trigger(page)).toHaveText('Automático · Tabela');
  expect(errors).toEqual([]);
});

test('Golden path de visualização 2: dispersão e bolhas', async ({ page }) => {
  await login(page);
  await open(page, {
    datasets: ['media_touchpoints', 'customer_360'],
    metrics: [{ id: 'cac' }, { id: 'account_conversion_rate' }],
    dimensions: [{ id: 'acquisition_campaign' }],
  });
  await trigger(page).click();
  await expect(page.getByRole('option', { name: /Dispersão.*Recomendado/ })).toBeVisible();
  await page.getByRole('option', { name: /Dispersão.*Recomendado/ }).click();
  await expect(trigger(page)).toHaveText('Dispersão');

  await library(page).getByText('Novos clientes PJ', { exact: true }).click();
  await trigger(page).click();
  const bubble = option(page, /^Bolhas/).last();
  await expect(bubble).toHaveAttribute('aria-disabled', 'false');
  await bubble.click();
  await expect(trigger(page)).toHaveText('Bolhas');
  await expect(
    page.getByText(/Eixo X: CAC · Eixo Y: Conversão de abertura · Tamanho: Novos clientes PJ/),
  ).toBeVisible();
});

test('Golden path de visualização 3: mapa do Brasil por UF', async ({ page }) => {
  await login(page);
  await open(page, {
    datasets: ['customer_360'],
    metrics: [{ id: 'accounts_opened' }],
    dimensions: [{ id: 'state' }],
  });
  await trigger(page).click();
  const map = option(page, /^Mapa\b(?! de calor)/).last();
  await expect(map).toHaveAttribute('aria-disabled', 'false');
  await map.click();
  await expect(trigger(page)).toHaveText('Mapa');
  await expect(page.getByRole('figure', { name: /Mapa do Brasil/ })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /^SP/ }).first()).toBeVisible();
});

test('Golden path de visualização 4: jornada vira funil', async ({ page }) => {
  await login(page);
  await open(page, {
    datasets: ['customer_360'],
    metrics: [
      { id: 'leads' },
      { id: 'accounts_opened' },
      { id: 'onboarding_completed' },
      { id: 'activation_d30' },
    ],
    dimensions: [],
  });
  await expect(trigger(page)).toHaveText('Automático · Funil');
  await expect(page.getByRole('figure', { name: 'Funil da jornada' })).toBeVisible();
  await expect(page.getByText('Topo do funil')).toBeVisible();
});

test('Seletor mostra requisitos dos gráficos incompatíveis', async ({ page }) => {
  await login(page);
  await open(page, {
    datasets: ['customer_360'],
    metrics: [{ id: 'account_conversion_rate' }],
    dimensions: [{ id: 'acquisition_channel' }],
  });
  await trigger(page).click();
  await page.getByLabel('Buscar visualização').fill('sankey');
  await expect(option(page, /Sankey/)).toHaveAttribute('aria-disabled', 'true');
  await expect(option(page, /Sankey/)).toContainText('Adicione uma dimensão de origem');
  await page.getByLabel('Buscar visualização').fill('mapa');
  await expect(option(page, /^Mapa\b(?! de calor)/)).toContainText('Adicione Estado ou Região');
});
