# Vixel Architecture

Agent-first video stack, owned by Classytic. Three packages + a client:

- **`@classytic/vixel-schema`** — the zero-dep `VixelSpec` contract. The single
  source of truth an **agent emits**, an **editor edits**, and the **engine
  renders**. No ffmpeg, no React.
- **`@classytic/vixel`** — the ffmpeg render engine (`VixelSpec → filter_complex`).
- **`@classytic/vixel-ui`** — headless React editor primitives (timeline, preview,
  drag) over the contract.
- **vidra-web** — the client app; consumes the registry schema + vendored vixel-ui.

Principles: the schema is the **lean, expanded model** an agent emits; higher-level
templates expand into it (no bloat). Effects and transitions are **registries**
(data in the schema, resolvers in the engine). The FE preview (Pixi) **mirrors** the
BE render (ffmpeg). Everything is client-overridable.

## Schema modules (`vixel-schema/src`)

`index.ts` is a barrel — the public import surface is stable. Cohesive modules:
`media`, `captions`, `keyframes`, `transform`, `animation`, `effects`,
`transitions`, `clip`, `overlay`, `audio`, `track`, `spec`, `normalize`.

## Core models

### Unified transform (`VisualTransform`)
One spatial model on **every** visual element (clip/text/image/video): a
normalized `frame` rect `{x,y,w,h}` + `rotation`/`fit`/`opacity` + per-channel
`keyframes`. Canvas drag/resize handles and numeric X/Y/W/H fields both write
`frame` — one representation, no per-type branching. Modeled on OpenShot's single
clip transform and kdenlive's qtblend rect.

Legacy spatial fields (`OverlayBase.position/scale/box`, `width/height`, `motion`)
are `@deprecated`, still readable, and folded into `frame` by `normalizeSpec`.
`ClipAnimation` (kenBurns/zoom/pan) stays as a high-level preset that the engine
expands into transform keyframes.

### First-class transitions (registry)
A transition is a thing **between** two scenes, chosen from a registry — not a clip
property. `TransitionDescriptor` (pure data: family, params, `ffmpeg.xfade`,
`gl.shader`, `preview`) + `TransitionRef` ({id, duration, params, easing,
direction}) + `BUILTIN_TRANSITIONS`. Placement lives in
`VideoTrack.transitions: SequenceTransition[]` where `between: [i, i+1]` keys the
clip pair. Mixed hard-cuts + transitions are trivial (only listed gaps transition).

Render tiers: `ffmpeg.xfade` now (fast); a `gl.shader` (gl-transitions) path later
for cube/3D/whip — **the same shader feeds BE render and FE preview** for parity.

Legacy `Clip.transition` is `@deprecated`; `normalizeSpec` lifts it into the
per-track list (ids map 1:1).

### Tracks
Lean discriminated `Track[]`. `VideoTrack` = sequential clip lane; multiple video
tracks composite in array order (low index = background). `OverlayTrack` =
free-floating absolutely-timed layer (z-ordered). All audio items mix.

### `normalizeSpec` — the one upgrade path
Pure, zero-dep, idempotent. Both the engine and the editor call it on load, so the
wire format stays back-compatible while internal consumers see one shape (frame +
per-track transitions). It folds the purely-computable legacy cases (`box`→`frame`,
`position`+`width`+`height`→`frame`) and lifts `clip.transition`; aspect-dependent
sizing is completed by the engine's transform resolver (it has canvas + media
probe). Legacy fields are preserved untouched.

## Migration

Additive-first, deprecate-never-delete (spec stays `version: 1`). Old specs render
identically. New emissions (agent, editor save) write the new shape. A future
`version: 2` drops the deprecated fields once all emitters are migrated.

## Phased plan

- **P0 ✅ Schema: unified transform** — `Rect`/`VisualTransform`/`TransformKeyframes`,
  `transform?` on `Clip` + `OverlayBase`, legacy fields deprecated, `normalizeSpec`
  + tests. *(additive; no behavior change)*
- **P1 ✅ Schema: transitions registry** — `TransitionDescriptor`/`TransitionRef`/
  `BUILTIN_TRANSITIONS`, `VideoTrack.transitions[]` (`SequenceTransition`),
  `Clip.transition` deprecated + lifted by `normalizeSpec`.
- **P2 ✅ Engine: unified transform** — overlays read `transform.frame/fit/rotation/
  opacity` first (legacy box/position/scale/etc. as fallback); a `framePx` helper +
  clips can render into a sub-region (split-screen/slide) via `transform.frame`;
  transform-less clips stay byte-identical. *(ClipAnimation→keyframes deferred — kenBurns
  still via clipAnimationFilter; aspect-`h` for legacy width-only resolved at render.)*
- **P3 ✅ Engine: per-gap transitions** — removed the all-or-none policy; a pairwise
  left-fold makes each gap independently a hard cut (`concat=n=2`) or a transition
  (`xfade`/`acrossfade`) using the plan's per-gap offsets. `planTimeline` reads
  first-class `VideoTrack.transitions[]` (legacy `clip.transition` as fallback). New
  transition resolver registry (`registerTransition`/`resolveTransitionXfade`, seeded
  from `BUILTIN_TRANSITIONS`). GL/shader tier is P6.
- **P4 ✅ vixel-ui: transform inspector + on-canvas handles** — Pixi preview reads
  `transform.frame/fit/rotation/opacity` (clips + overlays); ONE inspector Transform
  section (Frame presets + X/Y/W/H + Fit + Rotate + Opacity) writes `transform` for
  clip/image/video; `CanvasTransformLayer` overlays the preview with 8 resize handles
  + body-move that write the same `transform.frame`. *(canvas math is in vidra for
  now — extract to a vixel-ui `useTransformDrag` hook as cleanup; text canvas-drag +
  rotate-knob are follow-ups; `ClipPatch` gained `transform`.)*
- **P5 ✅ (mostly) vixel-ui: transitions panel + seam editing** — store gained
  `selectedSeam` + `selectSeam` + `setTransition` (writes `VideoTrack.transitions[]`
  via `withTransition`); timeline shows clickable **seam markers** (⇄ badge / +)
  between base clips; a **Transitions panel** browses `BUILTIN_TRANSITIONS` and
  applies to the selected seam with a duration slider + remove; selecting a seam
  auto-opens the panel. *(Remaining: drag a transition CARD onto a seam + panel→
  timeline media drop via `DataTransfer` — click-to-apply ships now.)*
- **P6 Engine+UI: multi video-lane compositing + GL transition pass.**
- **P7 vidra wiring** — adopt the new primitives; agent emits `transform.frame` +
  track `transitions[]`.

## Text styling (registry-backed, like effects/transitions)

The engine already renders the full `TextStyle` via libass; the gaps were on the
edges. Shipped:
- **P-text-1 ✅ schema** — added `glow {color,sigma,intensity}`, `underline`,
  horizontal `align` to `TextStyle`; new `text-presets` module
  (`TextStylePreset`, `BUILTIN_TEXT_PRESETS`, `registerTextPreset`/`getTextPreset`/
  `listTextPresets`) — presets are DATA the editor INLINES (no `presetId` persisted).
- **P-text-2 ✅ engine** — wired `underline` + horizontal `align` into `buildStyleLine`
  (defaults unchanged → golden snapshots hold). `fontFile`/`shadow.blur` marked
  `@engine-resolved` (follow-ups). **Glow renders** via `glowOverride` — a blurred
  colored libass layer emitted behind the sharp text (so glow exports, not just
  previews; both tiers are approximate by design, like the transition preview hints).
- **P-text-3 ✅ preview parity** — Pixi text branch derives EVERY field from the style
  (fixed the bold/center hardcode bug); renders stroke, shadow, background box,
  letter-spacing, and glow (≈ Pixi `dropShadow` blur, distance 0) — no new dep.
- **P-text-4 ✅ inspector** — `TextStyleEditor`: presets grid + per-property controls
  (font + B/I/U, fill, stroke, shadow, glow, background, both align axes, animation).

Out of scope until a GL text renderer: gradient fill (no libass mapping).

## Export — Pixi is the common engine (preview = export)

In-browser MP4 export reuses the SAME `scene.ts` renderer as the live preview →
WYSIWYG by construction, zero server cost for shorts. `@classytic/vixel-ui/export`
(`exportToMp4`) steps the spec frame-by-frame: Pixi render → `VideoFrame` →
WebCodecs `VideoEncoder` (`avc1.640028`) → `mp4-muxer` → MP4 `Blob`. `pixi.js` +
`mp4-muxer` are dynamically imported (optional deps). `awaitVideoSeeks` makes
source-video frames frame-accurate (the live preview doesn't wait).

- **P-export-1 ✅** — video export MVP. Verified: the ~8s sample (clips + text + PiP
  + transitions + effects) → a valid 5.5 MB `isom/avc1/mp41` MP4, all client-side,
  ~20s, 0 errors. Wired to the Export button with a progress overlay; `canExportInBrowser()`
  gates a (future) server fallback. **Runs on the main thread for the MVP** (reuses
  the preview's HTMLVideoElement seeking) — Worker + `VideoDecoder` is the next step.
- **P-export-2 ✅** — audio: `renderAudioMix` mixes the VixelSpec audio lane (clip +
  PiP source audio + `AudioItem`s, with gain/trim/loop/fades) on an
  `OfflineAudioContext` → `AudioEncoder` (`mp4a.40.2`) → muxed alongside video.
  Verified: export now carries `mp4a`+`soun`+`avc1` (AAC + H.264). Ducking is
  approximated as gain for now (sidechain follow-up; ffmpeg keeps the precise duck).
- **P-export-3 ◑** — client-side **gating shipped**: `canExportInBrowser()` +
  `withinBrowserBudget()` (≤3 min, ≤1440p) route shorts to the browser; the editor
  has the server-fallback **seam** (alerts until the endpoint exists).
  *Infra-gated remainder:* the Web Worker (OffscreenCanvas + `VideoDecoder`/demux,
  no UI block) and the real server-ffmpeg call need a demux subsystem + a backend
  endpoint — built as isolated next steps, not stubbed.
- **P-export-4 ◷** — headless Pixi on the server (single compositor) + effects/
  transitions as shared GLSL. Infra-gated (server GL host); the export engine is
  already pure (`exportToMp4(spec)`) so it's reuse-ready when that host exists.

The division: **Pixi composites** (browser preview + export, later headless server);
**ffmpeg owns codec/IO** (source decode, mux, HLS, transcode) + the agent/batch path.

## Drag architecture (vixel-ui, no DnD library)

All on Pointer Events + `setPointerCapture`, RAF-batched CSS transform during the
gesture, single store commit on release (the LTX hot-path discipline):
1. **time-axis** (existing): move / trim / reorder / vertical lane restack + magnetic snap.
2. **panel→timeline** drop (`DataTransfer` keys).
3. **transition drop-on-seam** between adjacent clips.
4. **on-canvas transform handles** (`useTransformDrag`) — resize/rotate/move the
   selected element's `frame`, mirrored by numeric inspector fields.
