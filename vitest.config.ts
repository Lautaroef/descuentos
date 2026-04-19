// Vitest config for UI unit + component tests. Node-side (scripts/) tests remain
// on `node:test` and are driven by the existing `pnpm test` script.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror Next's tsconfig path alias so component imports work unmodified.
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // scripts/** and the legacy node:test file in src/lib/ are owned by the
    // node:test runner (`pnpm test`); never pick those up here.
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'scripts/**',
      'tests/e2e/**',
      'src/lib/queries.test.ts',
      'src/lib/logos.test.ts',
    ],
  },
});
