import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'generators/index': 'src/generators/index.ts',
    'profiles/index': 'src/profiles/index.ts',
    'captions/index': 'src/captions/index.ts',
    'compose/index': 'src/compose/index.ts',
    'compositing/index': 'src/compositing/index.ts',
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
