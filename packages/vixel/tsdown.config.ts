import { defineConfig } from 'tsdown';

/**
 * Build (tsdown / rolldown) — ESM-only, tree-shaken, types emitted by tsdown (the
 * arc convention). Output is `.mjs` / `.d.mts` (the package.json exports map points
 * there); no source maps, no declaration maps.
 *
 * Bundles NOTHING from node_modules (`skipNodeModulesBundle`): every dependency, peer,
 * and optional native addon (resvg, fluent-ffmpeg, the AWS SDK) stays external by
 * resolved path, so it can't silently drift into the published bundle. `neverBundle`
 * covers workspace deps symlinked OUTSIDE node_modules in dev.
 */
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
  format: 'esm',
  platform: 'node',
  target: 'node18',
  dts: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  deps: { skipNodeModulesBundle: true, neverBundle: [/^@classytic\//] },
});
