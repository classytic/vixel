import { defineConfig } from 'tsdown';

/**
 * Build: bundle + tree-shake the ESM output. Types are emitted separately by
 * `tsc --emitDeclarationOnly` (see package.json `build`) for fast, accurate
 * declaration maps. One entry per subpath export.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'editor/index': 'src/editor/index.ts',
    'timeline/index': 'src/timeline/index.ts',
    'transport/index': 'src/transport/index.ts',
    'shared/index': 'src/shared/index.ts',
    'preview/index': 'src/preview/index.ts',
  },
  format: 'esm',
  platform: 'browser',
  dts: false,
  clean: true,
  treeshake: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@classytic/vixel-schema',
    '@classytic/react-media',
    'class-variance-authority',
    'clsx',
    'pixi.js',
    'tailwind-merge',
  ],
  outputOptions: {
    banner: '"use client";',
  },
});
