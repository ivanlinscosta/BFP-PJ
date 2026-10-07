import { DEMO_PASSWORD } from '../packages/domain/src/index';
import { expect, type Page } from '@playwright/test';

/** Signs in with a local demo profile (test credentials of the local dev environment). */
export async function login(page: Page, email = 'analyst@example.local') {
  await page.goto('/login');
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('E-mail corporativo').fill(email);
  await page.getByLabel('Senha').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
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
