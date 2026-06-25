import { defineConfig } from 'tsdown';

export default defineConfig({
  // One entry: the agent tool surface. Tools are AI-SDK-SHAPED objects emitted WITHOUT
  // importing `ai` — the host (arc-ai / arc MCP) consumes them. Only `zod` (peer) and
  // `@classytic/vixel-schema` are referenced; the schema now owns the EditorCommand
  // reducer, so vixel-agent has NO dependency on the React editor package.
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'neutral',
  dts: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  deps: { skipNodeModulesBundle: true },
});
