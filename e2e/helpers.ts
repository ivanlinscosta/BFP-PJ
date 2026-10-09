import { DEMO_PASSWORD } from '../packages/domain/src/index';
import { expect, type Page } from '@playwright/test';

/** Signs in with a local demo profile (test credentials of the local dev environment). */
export async function login(page: Page, email = 'analyst@example.local') {
  await page.goto('/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('E-mail corporativo').fill(email);
  await page.getByLabel('Senha').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/explorar/);
  await page.evaluate(() => window.sessionStorage.clear());
}

/** Collects console errors so every golden path also asserts a clean console. */
export function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Inteligência PJ: selects every base the profile can read as the conversation scope. */
export async function selectAllChatBases(page: Page) {
  await page
    .getByRole('button', { name: /Selecionar bases/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  const boxes = dialog.getByRole('checkbox');
  for (let index = 0; index < (await boxes.count()); index += 1) {
    const box = boxes.nth(index);
    if (await box.isEnabled()) await box.check();
  }
  await dialog.getByRole('button', { name: /^Usar \d+ bases?$/ }).click();
  await expect(dialog).toBeHidden();
}
