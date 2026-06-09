import { defineWorkspace } from 'vitest/config';

/** ffmpeg-free, parallel-safe, fast. The default `pnpm test` path. */
const UNIT = [
  'test/api-surface.test.ts',
  'test/time.test.ts',
  'test/keyframe.test.ts',
  'test/schema-durability.test.ts',
  'test/speed-ramp.test.ts',
  'test/motion-effects.test.ts',
  'test/errors.test.ts',
  'test/source.test.ts',
  'test/url-guard.test.ts',
  'test/fetch-remote.test.ts',
  'test/dimensions.test.ts',
  'test/editor-proxy.test.ts',
  'test/editor-package.test.ts',
  'test/captions.test.ts',
  'test/hls-ladder.test.ts',
  'test/compose-timeline.test.ts',
  'test/compose-graph.test.ts',
  'test/compose-layout.test.ts',
  'test/compose-text.test.ts',
  'test/compose-transitions.test.ts',
  'test/beat-sync.test.ts',
  'test/compositing.test.ts',
  'test/concurrency.test.ts',
  'test/temp-manager.test.ts',
  'test/ffmpeg-spawn.test.ts',
  'test/pipeline.test.ts',
  'test/post-production.test.ts',
  'test/faceless-primitives.test.ts',
  'test/glow-parallax.test.ts',
  'test/overlay.test.ts',
  'test/codec-copy.test.ts',
  'test/quality-presets.test.ts',
  'test/generators.test.ts',
  'test/gif-generator.test.ts',
  'test/thumbnail-generator.test.ts',
  'test/sprite-speed-config.test.ts',
];

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: UNIT,
      testTimeout: 10_000,
      hookTimeout: 10_000,
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'e2e',
      // Everything not in the unit list spawns the real ffmpeg binary.
      include: ['test/**/*.test.ts'],
      exclude: ['test/output/**', 'node_modules/**', 'dist/**', ...UNIT],
      testTimeout: 180_000, // real encoding can be slow
      hookTimeout: 30_000,
      teardownTimeout: 30_000,
      // Serialize: parallel real-ffmpeg processes contend for CPU/IO and flake.
      poolOptions: { forks: { singleFork: true } },
      fileParallelism: false,
    },
  },
]);
