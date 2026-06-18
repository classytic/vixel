import { defineConfig } from 'tsdown';

export default defineConfig({
  // Two entries: the zero-dependency core, and the OPT-IN zod-backed validator. Keeping
  // `validate` separate is what lets `import '@classytic/vixel-schema'` stay zod-free.
  entry: { index: 'src/index.ts', validate: 'src/validate.ts' },
  format: 'esm',
  platform: 'neutral',
  dts: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  // Bundle NOTHING from node_modules — zod (the only, optional, peer) stays external,
  // never inlined into the core or the validate chunk.
  deps: { skipNodeModulesBundle: true },
});
