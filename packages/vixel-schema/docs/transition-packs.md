# Building & sharing transition packs

A transition pack is **pure data + GLSL** — no compiled code — so anyone can author
one, drop it in an app, and (optionally) publish it. This is the gl-transitions /
CapCut-pack model. One registration makes a transition render **everywhere**: the
editor preview, the premium headless-Pixi export, and the agent's picker.

## The contract

A transition shader follows the **gl-transitions convention**: a single function

```glsl
vec4 transition(vec2 uv) {
  // read the outgoing/incoming clips:
  //   getFromColor(uv)  → the clip leaving
  //   getToColor(uv)    → the clip arriving
  // animate over `progress` (0 → 1). `ratio` = output aspect (w/h).
  // `{{name}}` tokens are substituted from the TransitionRef params.
  return mix(getFromColor(uv), getToColor(uv), progress);
}
```

You write ONLY the `transition()` body. `wrapTransitionFragment` (schema) adds the
`#version 300 es` header, the `progress`/`ratio` uniforms, `getFromColor`/
`getToColor`, and the `main()`. The same wrap feeds the Pixi preview, the Pixi
export, and (later) the engine GL hook — so what you see is what renders.

## Register it (the public API)

```ts
import {
  registerTransitionSource,   // the GLSL, so it RENDERS
  registerPack,               // the descriptor, so the editor/agent can PICK it
} from '@classytic/vixel-schema';

const SWIRL = `vec4 transition(vec2 uv) {
  vec2 c = uv - 0.5;
  float a = 6.2831 * (1.0 - progress) * smoothstep(0.5, 0.0, length(c));
  float s = sin(a), co = cos(a);
  vec2 p = vec2(c.x*co - c.y*s, c.x*s + c.y*co) + 0.5;
  return mix(getFromColor(p), getToColor(uv), smoothstep(0.0, 1.0, progress));
}`;

// 1) Make it render (preview + export). Keyed by transition id (or gl.shader id).
registerTransitionSource('swirl', SWIRL);

// 2) Make it selectable in the browser + emittable by the agent.
registerPack({
  id: 'my-pack',
  transitions: [{
    id: 'swirl', name: 'Swirl', family: 'move',
    gl: { shader: 'swirl' },
    ffmpeg: { xfade: 'fade' },   // fast-tier fallback when GL isn't used
    defaultDuration: 0.5,
  }],
});
```

Call these once at app startup (in the **browser** for the live editor). Registered
ids **override** the built-in core, so a pack can also upgrade a stock transition.

## Server / headless export

The schema runs *inside* the headless browser during export, so a host-process
registration doesn't reach it. Forward your sources when you render:

```ts
await renderSpecWithPixi(spec, out, {
  executablePath: chrome,
  transitionSources: { swirl: SWIRL },   // injected + registered in the page
});
```

(For the ffmpeg fast tier, only the descriptor's `ffmpeg.xfade` fallback applies —
custom GLSL needs the Pixi/GL tier.)

## Tiers — why a transition can look different

| Tier | Used by | Transition source |
|------|---------|--------------------|
| **GL / Pixi** | editor preview, premium export (`renderSpecWithPixi`) | the real `gl.shader` GLSL (`registerTransitionSource` / core) |
| **ffmpeg fast** | `compose()` quick export | `ffmpeg.xfade` only — premium GL transitions **degrade** (e.g. `cube`→`slideleft`) |

So author + review premium transitions on the **GL tier**. The fast tier is a
speed/compat fallback, not the showcase.

## Overlay-texture transitions (light leaks / film burn / particles)

The premium "leak" look = compositing a real texture (or video) over the blend.
A transition can declare an `overlay` asset; the shader samples it via
`getOverlayColor(uv)`:

```ts
import { registerPack } from '@classytic/vixel-schema';

registerPack({
  id: 'leaks', baseUrl: 'https://cdn.example.com/leaks',
  transitions: [{
    id: 'film-leak', name: 'Film Leak', family: 'fade',
    gl: { shader: 'light-leak-film' },        // reusable CORE shader that screens the overlay
    overlay: { source: 'warm-leak.jpg' },      // YOUR texture (resolved against baseUrl)
    ffmpeg: { xfade: 'fadewhite' },
    defaultDuration: 0.6,
  }],
});
```

`light-leak-film` is a built-in shader that **screens** `getOverlayColor` over the
from→to blend (brightest mid-transition) — so you only supply the texture. To write
your own overlay shader, author a source that calls `getOverlayColor(uv)` and
register it with `registerTransitionSource`; the executor declares `uOverlay`
automatically whenever the transition has an `overlay.source`.

**Headless export:** forward the texture like the GLSL —
`renderSpecWithPixi(spec, out, { overlaySources: { 'film-leak': url } })`.

Overlay textures are warmed by `preloadAssets` (preview + export), so they're bound
synchronously and never pop in.

## Camera shake & transition sound

Two more premium levers, both pack/ref-level:

- **Camera shake** — set `shake` on the `TransitionRef` (≈0.004–0.02, fraction of
  frame). The wrap jitters the sampled coordinate on a mid-peak envelope (zooming in
  slightly to hide edges), deterministic from `progress` so preview == export.
  ```ts
  transitions: [{ between: [0, 1], transition: { id: 'zoom-punch', duration: 0.4, shake: 0.012 } }]
  ```
- **Transition sound** — declare `sound` on the descriptor (whoosh / impact). It's
  just positioned audio: `collectTransitionSounds(spec)` resolves the cut time and
  the SAME audio pipeline that plays any clip mixes it (live preview + export).
  `registerPack` **merges** by id, so a tiny entry ATTACHES a sound to a built-in
  transition without redefining it:
  ```ts
  registerPack({ id: 'my-sfx', baseUrl: 'https://cdn…/sfx', transitions: [
    { id: 'zoom-punch', name: 'Zoom Punch', family: 'zoom', sound: { source: 'whoosh.mp3', gain: -3 } },
  ]});
  ```
  Any ffmpeg-decodable audio works (mp3/m4a/wav). The headless export muxes it in
  the host process, so the kit just needs to be registered there (absolute URLs).

## Tips for premium-feeling transitions

- **Ease `progress`** inside the shader (`smoothstep`, or an overshoot curve) — linear
  motion is what reads as "cheap".
- **Add motion** to both frames (warp/zoom/translate), not just a cross-dissolve.
- **Layer**: RGB-split, light-leak tints, directional blur sampled along the motion
  vector — a few cheap samples go a long way.
- Keep durations short (0.3–0.5s) for snappy, trendy cuts.
