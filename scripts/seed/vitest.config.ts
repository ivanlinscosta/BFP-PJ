import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['scripts/seed/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
