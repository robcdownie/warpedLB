import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Separate from vite.config.ts so tests don't load the PWA/React plugins.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
