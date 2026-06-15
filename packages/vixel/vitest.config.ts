import { defineConfig } from 'vitest/config';

/**
 * Shared base config. Tier definitions live in `vitest.workspace.ts`:
 *
 *  - unit: ffmpeg-free. Pure functions, command-building, dry-run, errors,
 *          concurrency, temp-files. Parallel-safe, fast, deterministic.
 *          Runs on every commit (`pnpm test`). Tight 10s timeout.
 *  - e2e:  spawns the real ffmpeg binary against the committed test.mp4
 *          fixture. Needs an external dependency (ffmpeg), so per the guide
 *          it is NOT in the default `pnpm test`. Runs single-fork — multiple
 *          real ffmpeg processes contend for CPU/IO and flake under parallel
 *          forks, so we serialize them rather than raise timeouts.
 *
 * The boundary that matters: `pnpm test` (unit) must pass with no ffmpeg
 * binary present and finish well under 30s.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['test/**', 'dist/**', '**/*.d.ts', '**/*.config.ts'],
    },
  },
});
