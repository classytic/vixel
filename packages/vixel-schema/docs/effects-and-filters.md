# Effects & Filters

Filters (colour grades) and Effects (stylize/FX) are ONE registry of pure-data
descriptors. The engine and the Pixi preview each hold ONE generic executor per
**kind**, so the catalog scales as DATA, not code — the way CapCut / DaVinci /
gl-transitions ship hundreds of looks. **We are not "blocked with simple effects":**
LUTs, GLSL shaders, and overlay footage are all first-class.

## Where things live (`src/effects/`)

| File          | Holds                                                        |
| ------------- | ------------------------------------------------------------ |
| `contract.ts` | the types (`EffectKind`, `EffectDescriptor`, `EffectRef`, `EffectParam`) + `defaultParams` |
| `filters.ts`  | `FILTER_EFFECTS` — colour LOOKS (CapCut "Filters" panel)     |
| `fx.ts`       | `FX_EFFECTS` — stylize/FX layers (CapCut "Effects" panel)    |
| `index.ts`    | assembles `BUILTIN_EFFECTS` + the `BUILTIN_FILTERS` / `BUILTIN_VISUAL_EFFECTS` splits |

`surface` (`'filter' | 'effect'`) decides the panel; `category` groups within it.
Add a colour grade → `filters.ts`; add an FX → `fx.ts`. Nothing else changes.

## The four kinds (how to add complex looks)

- **`filter`** — a parametric built-in. Needs renderer code (a Pixi `ColorMatrixFilter`
  / small GLSL in `vixel-ui` `filters/registry.ts`, an ffmpeg filter in the engine).
  Use for the handful of primitives (brightness, blur, vignette…).
- **`lut`** — a 3D `.cube` colour LUT. **This is how a 100-strong film-filter pack
  scales**: `{ id, name, kind:'lut', surface:'filter', source:'kodak-2383.cube', category:'Film', params:[intensity] }`. No renderer code — the shared LUT executor handles
  it (ffmpeg `lut3d` / Pixi LUT). LUTs are exactly what CapCut's "Filters" are.
- **`shader`** — a GLSL fragment (glitch, chromatic aberration, CRT, scanlines):
  `{ id, name, kind:'shader', surface:'effect', source:'<glsl or url>', params }`.
  Rendered by the shared GLSL executor in both renderers — pure data.
- **`overlay`** — transparent footage screened/blended over the frame (light leaks,
  bokeh, dust, film burn): `{ id, name, kind:'overlay', surface:'effect', source, blend }`.

Anything a renderer can't yet do declares `unsupported: ['pixi']` (or `['ffmpeg']`) —
the per-renderer coverage test allows the gap and the editor badges it "Export".

## BYO packs

`registerEffect(descriptor)` / `registerPack({ effects, baseUrl })` add looks at
runtime (LUT/shader/overlay sources resolve against `baseUrl`). The headless export
forwards pack sources the same way transitions do (see `transition-packs.md`).

## Expanding the FX library further

For advanced raster FX beyond hand-written GLSL — glow, bloom, CRT, RGB-split,
pixelate, motion-blur, godrays — the **`pixi-filters`** community package (v8:
`pixi-filters/{name}`) plugs straight into `vixel-ui`'s `registry.ts` as new `filter`
builders (it's not yet a dependency). Pair each with an ffmpeg fallback (or mark
`unsupported:['ffmpeg']`). `useBackBuffer:true` is already set for the blend-required
ones.
