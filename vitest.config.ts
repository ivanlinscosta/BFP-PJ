import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      '@api': fileURLToPath(new URL('./apps/api/src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: [
      'apps/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.ts',
      'infra/test/**/*.test.ts',
    ],
    setupFiles: ['apps/web/src/test/setup.ts'],
    environmentMatchGlobs: [['apps/web/src/**/*.{test,spec}.{ts,tsx}', 'jsdom']],
  },
});
