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
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'components/**/*.test.tsx', 'hooks/**/*.test.ts', '*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/api/**/*.ts', 'hooks/**/*.ts', 'proxy.ts'],
      exclude: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'hooks/**/*.test.ts', 'lib/db/prisma.ts', 'lib/auth.ts', 'lib/sketchgit/createSketchGitApp.ts', 'lib/server/wsConnectionHandler.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
