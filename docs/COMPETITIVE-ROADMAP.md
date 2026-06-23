# Vixel — Competitive Audit & Roadmap (vs Shotcut / pro NLEs)

> Generated from a multi-agent audit (2026-06): deep-read of all four vixel packages,
> the Shotcut source (Qt/C++/QML on MLT), and pro web-editor/color/audio/DX best
> practices. Goal: make the vixel packages the best foundation for third parties to
> build pro, web-native, **agent-first** video editors — "Mac, powered by Anthropic"
> while Adobe/Shotcut feel like Windows.

## Verdict

We are **"Mac" at the system level and "Windows" at the feature/media-engine level** — both halves are real.

- **Ahead of Shotcut _and_ every desktop NLE on architecture:** ONE zero-dependency JSON contract (`vixel-schema`) shared verbatim by the Pixi client, the ffmpeg server, and the AI agent, with **pure shared resolvers** (`sampleChannel`, `easeExpr`, `duckEnvelope`, `resolveTransformAt`) and a **numeric parity test** — so `preview == export` is *engineered, not hoped for*. OTIO is only an interchange format, not a renderer-bound, agent-emittable contract. The agent loop (`describeCatalog`/`authoringManifest`/semantic validate/themes/templates) is a moat no desktop editor can copy.
- **Behind on features/media-engine:** missing speed/time-remap, markers, nested sequences, J/L cuts, color management, pro audio (buses/LUFS), and the entire timeline-visualization layer (waveforms/thumbnails/scopes) Shotcut ships natively.

**The #1 structural liability is not a missing feature — it's the positional editing model.** Selections, transitions (`[i, i+1]`), undo, and actions all reference `(trackIndex, clipIndex)`. Any insert/move/ripple silently invalidates in-flight refs (`validSelection()` already defensively nulls dangling selections). This is what makes multi-step gestures and **human + agent concurrent editing** feel broken, and it blocks markers, J/L, compound clips, and a clean command layer. Everything else is downstream.

**Encouraging:** almost every gap closes as a *small optional schema addition + pure timeline functions* — not a contract rewrite. The "Mac" architecture absorbs them without bloat, **if** we keep the intent/derived discipline: scopes, waveforms, LUFS meters, proxies = client/render-metadata, **never** schema.

## Capability matrix

| Capability | Vixel | Note |
|---|---|---|
| Single shared contract; preview==export by construction | **ahead** | Defining advantage; nobody else has it |
| Agent authoring (manifest, semantic validate, templates, design tokens) | **ahead** | The moat |
| Extensibility-as-data (effect/transition/theme registries, inline packs) | **ahead** | Cleaner than OS-plugin model for web |
| Unified transform + one keyframe primitive | **ahead** | Tighter than MLT per-filter keyframes |
| Text design + kinetic typography + ASR caption hygiene | **ahead** | Deeper than Shotcut's text filters |
| In-browser export (WebCodecs→MP4, OPFS, quality ladder) | **ahead** | Desktop structurally can't do client-side |
| Headless/whitelabel SDK shape, undo, determinism observability | **ahead** | Needs React-free core + id model to fully land |
| On-canvas transform gizmo | par | Polished CapCut-style; fine for common case |
| Keyframe interpolation depth | par | Lacks Bezier tangent handles (deliberate) |
| Timeline grammar (ripple/roll/slip/slide, multi-select, magnetic) | **behind** | Where it feels Windows |
| Selection/command model (id vs positional) | **behind** | Biggest correctness gap |
| Masks / roto | behind | Static polygon path; one mask/clip |
| Frame-accurate source seek | behind | `currentTime=` + 250ms timeout; stale-frame risk |
| Hardware encode / codec breadth (compose) | behind | Hardcoded libx264 SW, H.264/AAC MP4 only |
| Pro audio (buses/pan/EQ/LUFS, multi-bed) | behind | Creator-grade; auto-duck is the bright spot |
| Render/delivery settings + caption sidecar in contract | behind | output is w/h/fps/bg only; burn-in captions only |
| Speed / time remapping | **missing** | Hard "pro" blocker |
| Markers / chapters / regions | **missing** | Also the natural agent "cut here" anchor |
| Nested sequences / compound clips | **missing** | Blocks reuse/multicam/template instancing |
| J/L cuts / split edits / A-V link | **missing** | Source audio coupled to video clip |
| Color management / HDR / 10-bit | **missing** | Grades run in undefined space → preview≠export |
| Waveforms / thumbnails / scopes | **missing** | Pro timeline/monitor is visually blind |
| Proxy / preview-resolution tier | **missing** | Multi-track 4K scrub will bottleneck |

## Where we're genuinely "Mac" (press these)

1. **The contract IS the product** — publish parity as a guarantee (golden test: speed ramp + 50% dissolve + screen-blend) and market *"the agent can trust the preview."*
2. **Best-in-class agent loop** — ship an official **MCP server** + an "AI fills the timeline, human refines" reference app.
3. **Extensibility as data** — generalize the registry philosophy to edit-commands and UI panels so third parties build pro editors without forking.
4. **Disciplined unification** — new features (audio buses, time-remap curves) should **reuse `Keyframe`/`sampleChannel`**, not invent new engines. That's how we add capability without bloating the contract.
5. **Honest degrade strategy** — surface the documented degrades (pop→fade, positional loops→static) as a typed fidelity report the editor can show users.
6. **Intent/derived split** — codify it as law: scopes/LUFS/waveforms/legal-range = render-metadata, never schema. Then full color management + a real mixer add only ~3 optional blocks + ~3 optional fields.
7. **Determinism observability** (dryRun, onCommand, onProgress, AbortSignal, SSRF-guarded ingest) — exactly what an agentic/MCP host needs and most NLEs never expose.

## Prioritized gaps

| Sev | Layer | Gap | Recommendation | Effort |
|---|---|---|---|---|
| **critical** | cross-cutting | Positional refs (trackIndex/clipIndex, `[i,i+1]`) | Required stable ids on clip/item/track minted in normalize; references → ids; internal `Map<id,pos>` rebuilt per spec | L |
| **critical** | schema | No speed/time-remap | Optional `VideoMedia.timeRemap` (scalar rate or keyframed warp curve) reusing `Keyframe`/`sampleChannel`; Pixi samples source-time, ffmpeg `setpts/atempo/minterpolate` | L |
| **high** | cross-cutting | No color management; grades in undefined space | Optional `output.color {working,primaries,transfer,range,peakNits?,tonemap?}` + `lut.expects`; **linear compositing as documented invariant**; parity test | L |
| **high** | cross-cutting | No ripple/roll/slip/slide; no multi-select | 4 pure functions in `vixel-schema/timeline`; `timeline:'magnetic'\|'free'`; multi-select in store | L |
| **high** | vixel-ui | No waveforms/thumbnails/scopes/LUFS | Build as **client-derived data**, not schema (worker peaks, WebCodecs filmstrip, GPU histogram readback, AudioWorklet BS.1770); cache by source hash | XL |
| **high** | cross-cutting | Flat audio (no buses/pan/EQ, single bed, no LUFS) | Optional `AudioBus` + `audio.buses` + `AudioItem.bus?`; duck → bus sidechain; `output.audio {loudnessTarget,truePeakMax,normalize}`; reuse `Keyframe` | L |
| **high** | vixel-render-pixi | No proxy/preview-res tier; one `<video>` per instance | Media asset abstraction (original/proxy/intrinsic dims); `PipelineController` w/ WebCodecs `VideoDecoder`, keyframe-index seek, byte-budgeted FrameCache + FrameLease | XL |
| medium | schema | No nested sequences/compound clips | `CompoundMedia {kind:'compound', spec}`; renderers recurse; gate behind validate+version | L |
| medium | schema | No markers/chapters/regions | `VixelSpec.markers?` + `VisualClip.markers?` (`Marker={id,atSec,label?,color?,kind?}`); agent anchor + chapter/EDL export | **S** |
| medium | cross-cutting | No J/L cuts (audio coupled to video) | LINK relationship (`linkId`) + "detach audio" command → independent `AudioItem`; keep coupled fast path; depends on id model | M |
| medium | vixel | Hardcoded libx264; no delivery settings/sidecar | Optional `output.delivery {codec,container,bitrate/crf,hwAccel,colorTag}` wiring existing HW-accel detection; emit SRT/VTT/ASS sidecars | M |
| medium | cross-cutting | Opaque setSpec snapshots; controller in React pkg | `dispatch(command={type,...,label})` over existing pure reducers; extract `@classytic/vixel-core` (React-free) | L |
| medium | cross-cutting | Frame-accuracy via `currentTime`+250ms; float time | Rational/frame-exact timestamps; pair with WebCodecs keyframe-index seek | M |
| medium | schema | Shallow structural validation (`.loose()`) | Semantic checks for new constructs (markers/compound/link/magnetic-overlap/time-remap/bus refs) + timing/overlap/trim-vs-source | M |
| medium | vixel-render-pixi | Module-global singletons assume one editor/page | Per-editor scoping (layout store, SCENES WeakMap, registries, shader bake-time) | M |
| low | cross-cutting | Masks: static polygon, one/clip, no blend modes | Keyframed per-vertex path, multiple masks + combine mode, scoped adjustment mask | L |
| low | vixel-render-pixi | Server export: base64 PNG/frame; jsDelivr CDN default | Raw RGBA/transferable transport; self-host `pixiUrl` for prod | M |
| low | cross-cutting | Font resolves by family-name only | Explicit face/weight binding + fallback chain through libass fontsdir + Pixi text | M |

## Roadmap (ordered so each phase unblocks the next)

### Phase 0 — Foundation: id model + React-free core (unblocks everything)
- Mint **required stable ids** on `VisualClip`/`AudioItem`/`VisualTrack` in `normalizeSpec`; build internal `Map<id,{trackIdx,clipIdx}>` resolver.
- Migrate `SelectionRef`/`SeamRef`/`EditorActions` + transition refs to ids (`between:[idA,idB]`); delete the defensive `validSelection()` null-out.
- Add typed command layer `dispatch({type,...,label})` over existing pure reducers; record undo labels.
- Extract store + actions + history + pure timeline ops into a framework-agnostic `@classytic/vixel-core`; make `vixel-ui` a thin React binding.
- Adopt OTIO-style version tiering: `migrateSpec`/`downgradeSpec`, frozen core / `x_` experimental namespace, JSON-shape snapshot test in CI.

### Phase 1 — Pro editing grammar (close the "feels Windows" gap)
- Pure `rippleTrim`/`rollEdit`/`slip`/`slide` in `vixel-schema/timeline`; replace `VisualTrack.sequential` with `timeline:'magnetic'|'free'` + explicit gap rules.
- Multi-select + standard trim-tool keymap in `vixel-ui`; host-tunable snapping (playhead/edges/markers).
- `VixelSpec.markers?` + `VisualClip.markers?` (S effort, high leverage as agent anchors).
- A/V link relationship + "detach audio" → J/L cuts; keep coupled-volume fast path.
- Semantic validation for markers/links/magnetic no-overlap.

### Phase 2 — Time + the missing pro primitive
- `VideoMedia.timeRemap` (rate or keyframed warp) reusing `Keyframe`/`sampleChannel`; Pixi+ffmpeg parity test; documented reverse/freeze degrades.
- Rational/frame-exact timeline timestamps.
- `CompoundMedia {kind:'compound', spec}` with recursive render + validate.

### Phase 3 — Preview perf + media engine (Apple-grade feel)
- Media asset abstraction (original/proxy/intrinsic dims+duration) + render-context `previewScale`/`targetResolution`.
- `PipelineController`: WebCodecs `VideoDecoder`, keyframe-index floor+decode-forward seek, byte-budgeted FrameCache + FrameLease, decode/encode backpressure.
- Move compositor toward zero-copy `GPUExternalTexture`; decode/composite/mux in a worker over OffscreenCanvas.
- Proxy transcode (decode→downscale→dense-keyframe→OPFS); Resolve-style "playback quality / use proxies" toggle.
- Finish per-editor scoping; raw-RGBA frame transport + self-hosted `pixiUrl` for the server tier.

### Phase 4 — Color management + pro audio (broadcast credibility)
- Optional `output.color`; linear compositing invariant in both renderers; ramp+dissolve+screen-blend parity test; HDR (RGBA16F preview, PQ/HLG + MaxCLL/MaxFALL) behind a capability check.
- `AudioBus` + `audio.buses` + `AudioItem.bus?`; duck → bus sidechain (keep baked `duckEnvelope` as export source of truth).
- `output.audio {loudnessTarget,truePeakMax,normalize}` + platform presets (tiktok/youtube/broadcast); client BS.1770 meter, ffmpeg two-pass loudnorm + true-peak limiter; lift single-bed assertion.
- Scopes + waveforms + thumbnails + LUFS meters in `vixel-ui` as derived data (worker/GPU), cached by source hash — never in the schema.

### Phase 5 — Delivery, extensibility surface, whitelabel polish
- Optional `output.delivery` wiring existing HW-accel detection; SRT/VTT/ASS caption sidecars.
- Generalize the registry to three axes: `registerCommand`, `registerInspector`/`registerTimelineTool` (FeatureConfig-gated), plus existing effect/transition packs.
- CSS custom-property design-token theming (`<VixelEditor theme={tokens}>`) + 2-3 reference themes; Tailwind internal-only; density + motion-reduce tokens.
- Official **MCP server** + "AI fills timeline, human refines" reference app; publish the typed fidelity/degrade report and the preview==export parity guarantee as marketing.
- Mask/roto depth + font face/weight/fallback as fast-follows.

## Appendix — per-package snapshot

**`vixel-schema` (the contract):** strong on transform/keyframes/effects/transitions/text/layout/themes/templates/validation; **missing** time-remap, markers, color management, nested sequences; audio + media-refs partial. The metadata bag is today the only sanctioned extension point — design editor state to layer new concepts on without forking.

**`vixel-ui` + `vixel-render-pixi` (toolkit + renderer):** standout determinism (one `renderScene` for preview + both exports), mature WebCodecs export (glFinish, OPFS, backpressure, quality ladder), polished gizmo + keyframe rail, solid undo. **Missing** waveforms/thumbnails/scopes, proxy/preview-res tier, ripple/roll/slip/slide + multi-select; module-global singletons assume one editor/page.

**`vixel` (server ffmpeg engine):** two-phase pure compiler (planTimeline + buildComposeGraph, golden-testable), rigorous Pixi parity (easeExpr numeric test, documented degrades), production-grade ASS/libass captions, careful SSRF/safety, great dryRun/onCommand observability. **Missing** color management; compose hardcoded to libx264 SW (HW accel only in the HLS VariantEncoder); single music bed; xfade-only transitions.

**Shotcut (reference, MLT/Qt/QML):** MLT-XML document model, tractor-of-playlists timeline, ~154 native filters + VST2/OpenFX hosting, full color toolkit (wheels/HSL/3D LUT/HDR10), complete audio chain + EBU R128, broadcast scopes suite, full HW-encoder matrix, proxy workflow, markers, on-device Whisper, time remapping + motion tracking, out-of-process resumable `melt` render queue. The breadth bar a "pro" editor is measured against.
