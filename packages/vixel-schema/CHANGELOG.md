# @classytic/vixel-schema

## 0.5.2

Additive (backward-compatible) — new command only.

### Added
- **`applyTemplate` command** (`EditorCommand`) — instantiate a registered layout template
  as a themed SCENE: `buildScene(...)` → the clips are inserted as a NEW non-sequential
  visual lane on top (via `withSceneAppended`), keeping their own `at`/`transform`/`slot`
  (a layered composition, not a butted-in sequential clip). Unknown template ⇒ no-op. Ids
  are minted so the new slots are immediately addressable (fill them, or `generate_image`
  into them). Pairs with the agent's new `apply_template` tool.
- **`withSceneAppended(spec, clips)`** (`./edit`) — the underlying layered-lane insert.

## 0.5.1

Additive (backward-compatible).

### Changed
- **`describeCatalog()` now lists templates + themes** (new `templates` and `themes`
  fields, and both are appended to `full`). The agent's `describe_catalog` tool over-
  claimed before — registered layout templates (`registerTemplate`) and themes
  (`registerTheme`, incl. host brand themes) are now surfaced by MEANING alongside
  filters/effects/transitions, so a model picks a real `template`/`theme` id.

## 0.5.0

Additive (backward-compatible) — new exports only.

### Added
- **Edit core moved IN** (`./edit`, `./commands`): the id-addressed command reducer
  `applyCommand` + `commandLabel` + `EditorCommand` + `ClipPatch`, and the `with*()`
  spec primitives + layout helpers (`isVisualTrack`, `layoutLane`, `reflowSequential`,
  `laneSeams`, …) now live here. So the SAME reducer runs in the browser store, a Node
  agent, and a server pipeline — no React needed to apply an edit. (`@classytic/vixel-ui`
  re-exports these unchanged.)
- **Looping** — `VideoMedia.loop`, `AudioItem.loopDuration`; `audioItemDurationSec`,
  `loopAudioToFill`, `loopVideoToFill`. `totalDurationSec` is now loop-aware.
- **Link mutators** — `linkElements` / `unlinkElements` (alongside the existing link
  resolvers), for coupling A/V into one link group.
- **Marker editing + chapter export** — `updateMarker`; `markersToVtt` (WebVTT chapters
  sidecar) and `markersToFfmetadata` (ffmpeg chapter embed input). Pure, no ffmpeg.
