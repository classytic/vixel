# @classytic/vixel-schema

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
