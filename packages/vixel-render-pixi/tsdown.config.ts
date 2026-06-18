import { defineConfig } from 'tsdown';

/**
 * Build: one ESM entry, tree-shaken. Types are emitted separately by
 * `tsc --emitDeclarationOnly` (see package.json `build`). `platform: 'neutral'` keeps
 * `node:` builtins external (this is a Node-only package) and yields `.js` output.
 *
 * Bundles NOTHING from node_modules (`skipNodeModulesBundle`) — every heavy/optional
 * runtime (playwright-core, puppeteer-core, pixi.js…) stays external; the consumer
 * owns versions via peer deps. `neverBundle` covers the `@classytic/*` workspace deps
 * symlinked outside node_modules in dev. No maps.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'neutral',
  dts: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  deps: { skipNodeModulesBundle: true, neverBundle: [/^@classytic\//] },
});
