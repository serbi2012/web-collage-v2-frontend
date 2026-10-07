import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __E2E__: 'false' },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
