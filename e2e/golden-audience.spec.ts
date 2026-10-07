import { expect, test } from '@playwright/test';
import { login, trackConsoleErrors } from './helpers';

test('Golden path 3: audiência SP · Pequena/Média · onboarding · D30 · sem Capital de Giro → CRM', async ({
  page,
}) => {
  const errors = trackConsoleErrors(page);
  await login(page);
  await page.goto('/audiencias/nova?modelo=capital-de-giro');

  await expect(page.getByLabel('Nome da audiência')).toHaveValue(
    'Oportunidade Capital de Giro — SP',
  );
  for (const text of ['Estado', 'Porte da empresa', 'Onboarding', 'Ativação D30', 'Produto']) {
    await expect(page.getByRole('button', { name: new RegExp(`^Campo: ${text}`) })).toBeVisible();
  }
  await expect(page.getByText('empresas elegíveis')).toBeVisible();
  await expect(page.getByText(/da base analisável/)).toBeVisible();

  await page.getByRole('button', { name: 'Salvar audiência' }).click();
  await expect(page.getByText('Audiência salva.')).toBeVisible();

  await page.getByRole('button', { name: 'Enviar para CRM' }).click();
  await expect(page.getByText(/Envio para CRM · (Na fila|Processando)/)).toBeVisible();
  await expect(page.getByText('Envio para CRM · Concluído')).toBeVisible({ timeout: 15_000 });

  await page.goto('/audiencias');
  await expect(
    page.getByRole('link', { name: 'Oportunidade Capital de Giro — SP' }).first(),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
