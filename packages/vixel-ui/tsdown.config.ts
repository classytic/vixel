import { defineConfig } from 'tsdown';

/**
 * Build: tree-shaken ESM output. Types are emitted separately by
 * `tsc --emitDeclarationOnly` (see package.json `build`). One entry per subpath export.
 *
 * Bundles NOTHING from node_modules (`skipNodeModulesBundle`) — react, pixi.js,
 * mp4-muxer, the optional `gifenc` GIF path, etc. all stay external (the host owns
 * versions), so the package honors its zero-bloat / optional-deps contract and a
 * transitive (e.g. eventemitter3) can't leak into the bundle. `neverBundle` covers
 * the `@classytic/*` workspace deps symlinked outside node_modules in dev. No maps.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'editor/index': 'src/editor/index.ts',
    'timeline/index': 'src/timeline/index.ts',
    'transport/index': 'src/transport/index.ts',
    'shared/index': 'src/shared/index.ts',
    'preview/index': 'src/preview/index.ts',
    'preview/pixi/index': 'src/preview/pixi/index.ts',
    'export/index': 'src/export/index.ts',
  },
  format: 'esm',
  platform: 'browser',
  dts: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  deps: { skipNodeModulesBundle: true, neverBundle: [/^@classytic\//] },
  outputOptions: {
    banner: '"use client";',
  },
});
