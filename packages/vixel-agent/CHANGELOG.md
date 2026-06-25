# @classytic/vixel-agent

## 0.1.0

Initial release — the host-mountable agent tool surface over a `VixelSpec`.

### Added
- **`AgentContext`** — the one seam a host implements (`getSpec` / `applyEdit` / `render`
  / injected `providers`). Framework-free: depends on `@classytic/vixel-schema` (≥ 0.5.0)
  + `zod` only — no `ai`, no `@classytic/arc`, no React.
- **12 tools** — perception (`get_timeline`, `describe_catalog`, `inspect_timeline`,
  `get_transcript`) + editing (`add_clip`, `set_clip_properties`, `split_clip`,
  `remove_clip`, `ripple_delete`, `link_clips`, `add_marker`, `remove_marker`). Edits are
  id-addressed `EditorCommand`s the host reduces.
- **`toAiSdkTools(ctx)`** → an AI-SDK ToolSet (in-process arc-ai) and **`toMcpBridges(buildCtx)`**
  → arc MCP bridges (external Claude/Cursor) — one definition, both transports.
- **`vixelAgentInstructions`** — the system prompt.

Generation / media-library / search are provider slots (`AgentProviders`) for a later release.
