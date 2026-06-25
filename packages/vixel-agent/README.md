# @classytic/vixel-agent

The host-mountable **agent tool surface** over a `VixelSpec`. A host implements one seam
(`AgentContext`) and gets a set of editing + perception tools an LLM drives — exposed as an
**AI-SDK ToolSet** (in-process [`@classytic/arc-ai`](https://npm.im/@classytic/arc-ai)) and
as **arc MCP bridges** (external Claude/Cursor) from the *same* definitions. Framework-free:
no `ai`, no `@classytic/arc`, no React imported — the shapes are structural.

## Install

```bash
npm i @classytic/vixel-agent
# deps: @classytic/vixel-schema · peer: zod. No `ai`, no `@classytic/arc`, no React.
```

## Use

```ts
import { createAgent } from '@classytic/arc-ai';
import { toAiSdkTools, vixelAgentInstructions, type AgentContext } from '@classytic/vixel-agent';

// 1. The host implements the one seam (server: spec store + headless renderer + providers).
const ctx: AgentContext = {
  getSpec: () => store.read(),
  applyEdit: (cmds, label) => store.applyCommands(cmds, label), // reduces via vixel-ui/shared applyCommand
  render: (frame, o) => renderer.frame(frame, o),
  renderRange: (a, b, n) => renderer.range(a, b, n),
  providers: { transcribe },
  capabilities: () => ({ canGenerate: false, canSearch: false, canTranscribe: true }),
};

// 2. In-process arc-ai agent — the tools are a plain AI-SDK ToolSet.
const agent = await createAgent({ model, instructions: vixelAgentInstructions, tools: toAiSdkTools(ctx) });

// 3. External MCP (arc) — the SAME specs, per-request tenant scope.
import { toMcpBridges } from '@classytic/vixel-agent';
app.register(mcpPlugin, { extraTools: buildMcpToolsFromBridges(toMcpBridges(mcpCtx => buildCtxFromAuth(mcpCtx))) });
```

## Tools (v1)

| Group | Tools |
|---|---|
| **Perception** | `get_timeline` · `describe_catalog` · `inspect_timeline` · `get_transcript` |
| **Editing** | `add_clip` · `set_clip_properties` · `split_clip` · `remove_clip` · `ripple_delete` · `link_clips` · `add_marker` · `remove_marker` |

Times are **seconds**. Edits are id-addressed `EditorCommand`s the host reduces (vixel-agent
never touches a store). All units/ids match `@classytic/vixel-schema`.

## The `AgentContext` seam

| Member | Server (vidra-agent) | Browser (vidra-web) |
|---|---|---|
| `getSpec` / `applyEdit` | Mongo-persisted spec + `applyCommand` | live editor store (instant preview + undo) |
| `render` / `renderRange` | headless Pixi renderer | mounted canvas |
| `providers` | stock / TTS / transcribe | host-provided |

## Status / follow-on

This is the v1 surface. The host's `applyEdit` reduces commands via
**`@classytic/vixel-schema`'s `applyCommand`** (the reducer now lives in the zero-dep schema,
so a React-free server depends only on the schema). Generation / media-library / search tools
are provider slots (`AgentProviders`) to fill next; wiring **vidra-agent** (arc-ai edit loop)
+ enabling the **vidra-web** composer is the remaining integration.
