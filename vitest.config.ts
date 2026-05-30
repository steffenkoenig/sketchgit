import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['lib/test/setup.ts'],
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'lib/db/prisma.ts', 'lib/auth.ts', 'lib/sketchgit/createSketchGitApp.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 69,
        statements: 70,
      },
    },
  },
});
