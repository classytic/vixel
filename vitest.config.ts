import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 180000, // 3 minutes per test (encoding can be slow)
    hookTimeout: 30000,
    teardownTimeout: 30000,
    include: ['test/**/*.test.ts'],
    exclude: ['test/output/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'test/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.ts',
      ],
    },
  },
});
