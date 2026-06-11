# Vixel — Design & Architecture of Record

> The principles that decide what belongs in vixel and what does not.
> Grounded in a study of the systems the industry already trusts:
> **OpenTimelineIO** (ASWF/Pixar), **MLT** (Shotcut/Kdenlive), **OpenFX**
> (Nuke/Resolve/Natron), **frei0r**, and **movis**.

## The law

> **A capability belongs in vixel if, and only if, its output is a pure function
> of `(input pixels, time)` expressible as an ffmpeg filter graph. The moment it
> needs a retained-mode, per-frame compositor — animated effect parameters,
> arbitrary mattes, nested compositions, pivot transforms — it belongs to the
> host editor, not the engine.**

Every system we studied draws this same line:

- **OTIO** is deliberately *not a renderer* — it describes an edit; other tools
  render it. That description/render split is exactly why Adobe, Autodesk and
  Blackmagic all adopted it.
- **MLT** keeps its framework thin and delegates every pixel to ffmpeg/frei0r
  plugins.
- **movis** is a *great* compositor — 18 blend modes, alpha/luma mattes, effect
  stacks with animated radii, nested comps — and every bit of that is per-frame
  NumPy/cv2, none of it an ffmpeg filter graph. That is the editor tier, by
  construction.
- **OFX/frei0r** reduce "an effect" to a typed parameter schema + an input
  arity. Nothing more.

vixel is the engine and the contract. It is **not** an editor, a preview
runtime, or a compositor.

## What vixel is

1. **A primitive engine** — typed, dry-runnable, tree-shakeable ffmpeg
   primitives, each a pure filter-graph builder + a thin spawn wrapper.
2. **A declarative renderer** — `VixelSpec` → one `filter_complex` (`compose`).
3. **A set of contracts as data** — the spec schema, the transition catalog, and
   (this document's subject) the primitive descriptors — published so an agent
   or a host editor can drive vixel without importing a renderer.

## The four design moves

### 1. Frame-exact time — seconds at the edge, frames inside

OTIO stores `RationalTime{value, rate}` because float seconds compound rounding
across an edit (the cause of our trim-overflow guard firing, and the bound on
beat-sync precision). But forcing `{value, rate}` on callers is un-ergonomic for
an ffmpeg library where users — and ffmpeg — think in seconds.

**Decision:** the public API takes **seconds**; the planner **snaps every
boundary to the output frame grid** and carries frame-exact integers internally.
Cuts become exact; the caller still writes `duration: 2`.

### 2. Primitive descriptors + input arity — the keystone

Every primitive carries a machine-readable **descriptor**: typed parameters and
an input arity. Modeled on OFX/frei0r, minus the negotiation overkill
(RoD/RoI/clip-preference) that an ffmpeg backend can't use.

```ts
type ParamType = 'number' | 'boolean' | 'color' | 'position' | 'choice' | 'string';

interface VixelParam {
  name: string;
  type: ParamType;
  default: unknown;
  min?: number;            // clamp
  max?: number;
  displayMin?: number;     // UI slider range, independent of clamp (OFX)
  displayMax?: number;
  semantic?: 'plain' | 'angle' | 'scale' | 'time';  // UI hint (OFX doubleType)
  animatable?: boolean;    // can this attr be keyframed? (move #3)
  options?: string[];      // for 'choice'
  description?: string;
}

// frei0r's arity taxonomy — the cleanest model of effect topology there is.
type PrimitiveArity =
  | 'source'   // 0 inputs → 1 output  (generators: color, text, testsrc)
  | 'filter'   // 1 input  → 1 output  (blur, glow, mask-by-shape)
  | 'mixer2'   // 2 inputs → 1 output  (blend, chroma-key over bg, alpha matte)
  | 'mixer3';  // 3 inputs → 1 output  (3-way composite)

interface VixelPrimitiveDescriptor {
  id: string;              // 'vixel.compositing.chromaKey'
  name: string;
  arity: PrimitiveArity;
  params: VixelParam[];
  inputs?: { name: string; optional?: boolean; isMask?: boolean }[];
  description?: string;
}
```

This single move does three things at once:

1. **Introspection.** An agent (the MCP story) or an editor UI can *enumerate*
   primitives and their parameters and drive vixel without hardcoding — the
   "contract as data" principle, made real.
2. **Masks / keying / blend fall out for free.** They are not bespoke features;
   they are the **`mixer2`** arity. One abstraction, the whole family.
3. **OFX-grade consistency** that reads as pro-tier — without OFX's weight.

**Rollout status (honest):** the descriptor *contract* is established and ships on
the newest primitives — the `compositing/*` family (`COMPOSITING_DESCRIPTORS`)
and the generator `source`. The ~24 legacy single-op generators are not yet
descriptor-backed; their config shapes are already uniform, so adding descriptors
is mechanical and incremental. An introspecting host should treat the descriptor
catalog as *growing*, not yet exhaustive.

### 3. Keyframes — adopted, but scoped honestly

MLT's value model (`0=0;30~=0.8;60c=0.2`, an interpolation prefix per key) and
movis's fluent `Attribute`/`Motion` ergonomics are the reference. vixel adopts
the intent-level shape `[{ t, value, easing }]` → compiled to an ffmpeg
time-expression.

**Scope discipline:** keyframing is offered **only for attributes ffmpeg can
animate per-frame** — overlay `x/y`, `alpha`, `rotate` angle, `volume`
(`t`-expressions / `sendcmd` / `zoompan`). Animated *effect* parameters (a blur
radius changing over time, etc.) are **compositor-tier and refused** — a
descriptor's `animatable` flag is only set where ffmpeg can honor it.

### 4. Schema discipline

From OTIO: a `VIXEL_SCHEMA` version discriminator with registered
upgrade/downgrade functions; a `metadata` passthrough on every node (vendors and
agents stash their own data; vixel ignores unknown keys); and **media
references** — `source` resolves as `{ external | generator | missing }`, which
also yields generator *sources* (solid / text / testsrc) for free.

## What vixel deliberately refuses

Per movis's own architecture these are **per-frame compositor**, not filter
graph, and stay in the host editor (canvas / WebGL / Skia — the hyperframes
tier):

- arbitrary blend modes beyond ffmpeg's native set
- animated *effect* parameters
- luminance/alpha **roto** mattes (animated mask shapes / bézier paths)
- effect stacks with per-frame parameter animation
- nested compositions with independent caching
- anchor-pivot transform rigs
- particle systems, shape-layer motion graphics, 3D layers/cameras/lights

Refusing these is not a limitation — it is the same call OTIO made by not being
a renderer. It is *why* the design stays clean.

## Why this earns respect

It makes the same decisions the industry's own standards made: OTIO's
description/render split, OFX's typed-descriptor effect contract, MLT's
filter/transition/mixer arity, and an honest boundary that never pretends ffmpeg
is a compositor. A primitive library that is **introspectable, frame-exact,
versioned, and disciplined about its lane** is what a professional reaches for as
a building block.

## Validation — pressure-tested against Shotcut & Natron

Two shipping systems were studied specifically to confirm or break this design:
**Shotcut** (a production NLE built *on* the MLT engine) and **Natron** (a
node-based compositor / OFX host). Both **confirmed** the architecture:

- **Shotcut draws the same engine/editor line.** Its per-filter `meta.qml`
  (`Parameter { property, minimum, maximum, isCurve, units }`) *is* vixel's
  descriptor — and Shotcut buries it in the GUI layer, whereas vixel publishes it
  as first-class data. Shotcut also confirms keyframes are an engine-animated
  property (`isCurve`) surfaced to a UI, never the editor computing pixels.
- **Natron confirms the refuse-list.** Its node graph is a retained-mode,
  per-frame DAG ("a snapshot of the tree for each frame"), and roto is animated
  béziers with an internal compositing tree per shape — categorically *not* an
  ffmpeg-filter-string compiler. Refusing the graph/roto/animated-knob tier is
  correct.

**Adopted from the study** (the small set both systems converged on):
- `unit` and `step` on params (Shotcut's `units`; agent + UI reasoning).
- `semantic: 'spatial'` (Natron's normalized/0–1-maps-to-frame-size knobs).
- Two more render-verified blend modes (`divide`, `average`).

**Consciously refused** (Shotcut/Natron carry them; they are GUI-host concerns,
not the agentic-engine contract): decimal precision, secret/enabled visibility,
parent/group nesting, ganged properties, viewer-overlay labels, parameter
expressions. Both studies independently concluded vixel's **data-first**
descriptor is *cleaner* than burying these in a GUI — so the engine publishes
intent and the host owns presentation.

**The blend-mode boundary, made precise:** of Natron's 40 Merge operators, ~12
are pure 2-input pixel ops expressible by ffmpeg `blend` (the set vixel ships).
The other ~28 — alpha-matte (`in/out/atop/mask/stencil`) and HSL
(`hue/saturation/color/luminosity`) modes — need premultiplied-alpha or
channel-coupled math that is compositor-tier, and are refused.

## References

- OpenTimelineIO — https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- MLT Framework — https://github.com/mltframework/mlt
- OpenFX — https://github.com/AcademySoftwareFoundation/openfx
- frei0r — https://github.com/dyne/frei0r
- movis — https://github.com/rezoo/movis
