# Vixel → Enterprise Video Engine — Architecture & Roadmap

> Goal: make vixel the **clean, composable, primitive video engine** — the
> "Mux of libraries." Smarter than the hand-rolled doc-portal-be stack by
> *absorbing its generic IP in library-grade form*, while staying small, DRY,
> single-source-of-truth, fully typed, and fully tested. No bloat.

This plan is grounded in two audits (doc-portal-be video stack; vixel current
state) — see §1.

---

## 0. Principles (the rules everything else obeys)

1. **One primitive contract.** Every operation is the same shape:
   `(source, output, config) => Promise<Result>`, with a *pure* filter-builder
   separated from the *io* runner. A conformance test enforces this across all
   operations — no special snowflakes.
2. **Single source of truth.** A given default/type/constant lives in exactly
   ONE place. Cross-cutting → central (`types/`, `constants/`). Feature-specific
   → co-located in the feature folder. **Never both.** No value duplicated.
3. **Pure core, io shell.** Filter graphs, math, escaping, validation are pure
   and unit-tested without ffmpeg. The ffmpeg spawn is the only side-effect
   boundary.
4. **Dry-run everything.** Every operation/profile can emit its exact ffmpeg
   command without executing — the basis of golden-command tests + cost preview.
5. **Typed errors, typed results.** No throw-strings; coded errors + result
   objects.
6. **No bloat budget.** Zero runtime deps; bundle-size ceiling enforced in CI
   (~110 KB today — hold it). A capability earns its place or it doesn't ship.
7. **Library, not a service.** The pure engine never touches a DB, S3, or queue.
   Orchestration (jobs/lifecycle) is an *optional, separate subpath export*, so
   the core stays pure and tree-shakeable.

---

## 1. Research findings (what we're building on)

### Mux's primitive model → vixel's primitive model
Mux organizes around a few orthogonal nouns (Assets, Uploads, Playback IDs,
Tracks, Live). The lesson for a *library* isn't the hosted service — it's the
**small set of orthogonal, predictable primitives**. Vixel's equivalents:

| Mux | Vixel primitive |
|---|---|
| Asset | `Source` (local / remote / buffer; lazily probed; immutable metadata) |
| (encode settings) | `Profile` (named, validated encode recipe) |
| (transform) | `Operation` (one orthogonal transform — today's "generators") |
| (pipeline) | `Pipeline` (linear) + `Timeline` (multi-track) |
| Playback/output | `Output` (typed result: paths, probe, command, cost) |
| (async job) | `Job` (OPTIONAL lifecycle layer — separate subpath) |

### doc-portal-be IP worth absorbing (generic, library-grade — "Bucket A")
From the audit, these are *generic engine* techniques (not app/business logic),
and vixel lacks them:
- **Editor-proxy encode profile** — faststart mp4 **+ tight keyframes + sprite
  strip** for snappy editor scrub. (Vixel has faststart, not the pairing.)
- **4K downscale guard** — cap to 1080p, never upscale, even dims (OOM-safety).
- **Hardened process control** — timeout → SIGTERM → SIGKILL for hung decodes.
- **Remote-URL ingest** — fetch + SSRF re-validation + byte-count abort. (Vixel
  has **no remote ingest** today — local paths only.)
- **Broadcast-grade audio ducking defaults** + multi-track VO mixing.
- **Multi-track timeline compositing** — the big one; vixel's pipeline is
  strictly linear (single clip). doc-portal-be has trackIndex + PiP transforms.

### What stays OUT of vixel (app/orchestration — "Bucket B")
Media catalog/DB, attribution/licensing, stock visibility, the editor renderer,
per-step compose, avatar/HeyGen, vision frame-dedupe. These are application
concerns; they live in doc-portal-be/id-agent, not a library.

### Current vixel state (good base, specific debts)
- ✅ Feature co-location (each op owns `index/types/constants/filter`), pure
  filter builders, dry-run, typed errors, AbortSignal, ~110 KB, 30 test files.
- ⚠️ **Identity drift**: headers still say "@classytic/hls-processor";
  `HLSProcessor` is the *default* export → frames the lib as "HLS + bolt-ons."
- ⚠️ **Split source of truth**: sprite/codec/segment defaults exist in BOTH the
  top-level `constants.ts` grab-bag AND per-feature `constants.ts`.
- ⚠️ **Types boundary fuzzy**: central `types/generators.ts` + per-feature
  `types.ts` can overlap.
- ⚠️ Missing the Bucket-A primitives above.

---

## 2. Target architecture (the clean tree)

```
src/
  core/              # PURE engine — the only ffmpeg boundary
    ffmpeg-spawn.ts      process mgr: timeout→SIGTERM→SIGKILL, progress, abort
    ffmpeg-commands.ts   arg/filtergraph builders (shared)
    probe.ts             ffprobe → typed metadata
    concurrency.ts       bounded mapWithConcurrency
    dimensions.ts    NEW  aspect/scale/even-rounding math (de-dupe hotspot)
    escaping.ts      NEW  path/drawtext/filter escaping (de-dupe hotspot)
    errors.ts            coded errors + guards + tryCatch
    logger.ts
  primitives/        # NEW — the Mux-like nouns
    source.ts            local|remote|buffer, lazy probe, immutable metadata
    operation.ts         the Operation contract + registry
    output.ts            typed Result shape
  operations/        # RENAMED from generators/ — one folder per transform
    <name>/ { index.ts, filter.ts (pure), types.ts, constants.ts, *.test.ts }
  profiles/          # NEW — named, validated encode recipes ("the smarts")
    editor-proxy.ts      faststart mp4 + tight keyframes + sprite
    hls-ladder.ts        adaptive HLS (today's processor, generalized)
    web-mp4.ts           progressive delivery mp4
  pipeline/          # composition
    pipeline.ts          linear (exists)
    timeline.ts      NEW  multi-track (tracks, PiP transforms, overlays, audio)
  ingest/            # NEW — remote fetch + SSRF + byte cap → local Source
  jobs/              # OPTIONAL subpath — status lifecycle + idempotency (impure)
  types/             # ONLY cross-cutting shared types (single source of truth)
  constants/         # ONLY cross-cutting shared constants
  index.ts           # curated public API barrel
```

**Single-source-of-truth rules:**
- `types/` holds ONLY shared base types: `Source`, `BaseOperationConfig`,
  `Result`, and shared enums (`AspectRatio`, `Codec`, `Container`, `Hwaccel`).
  Feature-specific config types stay in `operations/<name>/types.ts`. No overlap.
- `constants/` holds ONLY cross-cutting constants: encode limits (MAX 1080p),
  codec compatibility lists, aspect-ratio map, default timeouts, bundle limits.
  Feature defaults stay in `operations/<name>/constants.ts`. **Sprite defaults
  live in exactly one place.**
- Shared *logic* (dimension math, even-rounding, escaping, filtergraph helpers)
  lives in `core/` and is imported — never re-implemented per operation.

**Cross-import rule (lint-enforced):** an `operations/<a>` may import from
`core/`, `primitives/`, `types/`, `constants/` — **never** from another
`operations/<b>`. Kills hidden coupling.

---

## 3. The primitive model (the public mental model)

```ts
// Source — one way to name input, three backings, lazily probed.
const src = await Source.from('clip.mp4');           // local
const src = await Source.fromUrl('https://…/x.mp4');  // remote (ingest+guard)
const src = await Source.fromBuffer(buf);

// Operation — one orthogonal transform, uniform contract.
await trim(src, out, { start, end });

// Profile — a named, validated recipe (the "smarts" packaged).
await profiles.editorProxy(src, outDir);   // faststart mp4 + sprite + poster
await profiles.hlsLadder(src, outDir, { renditions: [1080, 720, 480] });

// Pipeline — linear composition (exists).
await pipeline(src).trim(...).color(...).run(out);

// Timeline — multi-track composition (NEW).
await timeline()
  .track(0, [{ src: a, at: 0 }, { src: b, at: 5000, transition: 'xfade' }])
  .track(1, [{ src: logo, at: 0, transform: { x, y, scale }, blend: 'screen' }])
  .audio([{ src: vo }, { src: music, duck: true }])
  .render(out);
```

Every primitive: dry-runnable, abortable, typed result, coded errors.

---

## 4. Capability roadmap (prioritized from the audits)

**P0 — makes vixel an *editor-grade* engine (the gap that matters most):**
- `profiles/editor-proxy` — faststart mp4 + `-force_key_frames` interval +
  sprite strip + poster. (Generalize doc-portal-be's profile.)
- `core/dimensions` **4K downscale guard** used by every encode op.
- Harden `core/ffmpeg-spawn` timeout→SIGKILL (verify, add OS-level kill).
- `ingest/` remote-URL Source with SSRF + byte cap.

**P1 — the differentiators:**
- `pipeline/timeline` multi-track compositing (tracks, PiP transforms, overlays,
  per-clip audio). This is what separates "ffmpeg toolkit" from "editor engine."
- Broadcast-grade ducking defaults + optional VAD-driven ducking.
- Dedicated `poster` primitive (best-frame heuristic, not just frame-at-t).

**P2 — breadth / parity:**
- HLS captions sidecar (WebVTT, toggleable) + optional DASH.
- "MediaConvert-parity" recipe presets (platform ladders).
- Only-on-demand: chroma key, parametric EQ, etc. (ship when a consumer needs it).

**Explicitly deferred (keep the library pure):** catalog/DB, S3/CDN, stock
visibility, attribution. Consumers (doc-portal-be / id-agent) own these.

---

## 5. Hygiene refactor (single source of truth / DRY / no bloat)

1. **Kill identity drift.** Rename every "hls-processor" header/comment → vixel.
   Demote `HLSProcessor` from default export → `profiles.hlsLadder` /
   `vixel/profiles`. The default export becomes the curated primitive surface.
2. **Consolidate constants.** Apply the §2 rule; de-dupe sprite/codec/segment
   defaults to one home each; move cross-cutting ones to `constants/`.
3. **Consolidate types.** `types/` = shared base only; remove overlap between
   `generators.ts` and per-feature `types.ts`.
4. **Hoist duplicated logic** to `core/dimensions` + `core/escaping`
   (aspect-ratio map, even-dim rounding, drawtext/path escaping appear in
   crop-resize, reframe, sprites, watermark, captions — unify).
5. **Enforce the Operation contract** with a conformance test (every op:
   signature, dry-run, abort, coded errors, result shape).

These are pure hygiene — no behavior change — and unlock everything after.

---

## 6. Testing strategy (proper, layered)

| Layer | What | Speed / gate |
|---|---|---|
| **Unit (pure)** | filter-builders, dimension math, escaping, validation — no ffmpeg | fast; 100% on pure modules |
| **Golden-command** | dry-run command capture per op/profile → snapshot | any ffmpeg-arg change is reviewed in PR |
| **Integration** | real ffmpeg on tiny committed fixtures (1–2 s clips); assert probe-correct (dims, duration, audio, keyframe interval, faststart moov) | per-commit on CI w/ ffmpeg |
| **E2E** | representative pipelines/profiles → playable artifacts | nightly / pre-release |
| **Conformance** | every registered Operation obeys the contract | per-commit |

CI: matrix on **ffmpeg 6 + 7**, coverage gate, **bundle-size budget** check,
lint (incl. the no-cross-operation-import rule), typecheck.

---

## 7. Phased rollout (no big-bang)

- **Phase 0 — Hygiene & guardrails** (§5 + §6 harness). Identity cleanup,
  single-source-of-truth for const/types, conformance + golden-command tests,
  CI gates. *No behavior change.* Low risk, makes the rest safe.
- **Phase 1 — Primitives & P0 capabilities.** `primitives/`, `profiles/editor-
  proxy`, 4K guard, hardened process, `ingest/`. Vixel becomes an editor engine.
- **Phase 2 — Differentiators.** `pipeline/timeline` multi-track, ducking,
  poster primitive.
- **Phase 3 — Optional orchestration & breadth.** `jobs/` lifecycle subpath,
  HLS captions/DASH, parity recipes.
- **Phase 4 — 1.0.** Docs, benchmarks vs doc-portal-be + Mux, release.

Each phase ships independently, fully tested.

---

## 8. Success criteria
- One uniform primitive contract; conformance + golden-command tests green.
- Zero duplicated constants/types; lint enforces the boundaries.
- Editor-proxy + HLS + timeline + remote ingest all first-class.
- Bundle ≤ budget; zero runtime deps; ffmpeg 6/7 CI green.
- doc-portal-be can replace its hand-rolled `videoClipEncoderService` with a
  vixel `profiles.editorProxy` call (proof the IP was absorbed cleanly).
```

## Open decisions for you
1. **Rename scope** — OK to demote `HLSProcessor` from the default export
   (breaking for current importers) in Phase 0, or keep a back-compat alias?
2. **`jobs/` lifecycle** — include the optional async/idempotency subpath, or
   keep vixel 100% pure and leave all orchestration to consumers?
3. **Timeline depth** — full multi-track (tracks + PiP + overlays + audio) in
   Phase 2, or start with 2-track (main + overlay) and grow?
