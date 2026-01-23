import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'generators/index': 'src/generators/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'node18',
  platform: 'node',
  // External dependencies (peer deps)
  external: ['@aws-sdk/client-s3', 'fluent-ffmpeg'],
  // No bundling - tree-shakeable
  bundle: true,
  // Modern ESM only
  esbuildOptions(options) {
    options.conditions = ['node', 'import'];
  },
});
