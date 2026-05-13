import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@argus/core': resolve(__dirname, '../core/src/index.ts'),
      'bun:sqlite': resolve(__dirname, 'src/__mocks__/bun-sqlite.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
