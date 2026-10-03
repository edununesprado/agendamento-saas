import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
  ],

  test: {
    globals: true,

    root: './',

    include: [
      '**/*.e2e-spec.ts',
    ],

    setupFiles: [
      './test/setup-e2e.ts',
    ],

    fileParallelism: false,

    testTimeout: 30000,
    hookTimeout: 30000,
  },
});