/**
 * Canonical transition GLSL — the curated CORE set, inlined (zero fetch, always
 * available). Each is written in the vixel/gl-transitions convention: a single
 * `vec4 transition(vec2 uv)` reading the outgoing/incoming clips via
 * `getFromColor(uv)`/`getToColor(uv)` over `progress` 0→1, with `ratio` (aspect)
 * available. The wrappers in ./shader-wrap turn these into a Pixi fragment (the
 * preview + export executor in vixel-ui) — ONE source, every render context.
 *
 * Sources are faithful adaptations of the MIT-licensed gl-transitions library
 * (gl-transitions.com); the full ~120-shader library is intended to ship as an
 * opt-in pack so the core bundle stays small. Keyed by the `gl.shader` id used in
 * {@link BUILTIN_TRANSITIONS}.
 */

/**
 * SLIDE / push (gl-transitions "directional"): BOTH frames translate — the
 * outgoing slides out along `direction` while the incoming pushes in behind it.
 */
const slide = (dx: number, dy: number): string => `vec4 transition(vec2 uv) {
  vec2 direction = vec2(${dx.toFixed(1)}, ${dy.toFixed(1)});
  vec2 p = uv + progress * sign(direction);
  vec2 f = fract(p);
  return mix(getToColor(f), getFromColor(f),
    step(0.0, p.y) * step(p.y, 1.0) * step(0.0, p.x) * step(p.x, 1.0));
}`;

/**
 * WIPE: a moving hard edge reveals the incoming over a STATIONARY outgoing —
 * neither frame moves (this is what makes it read differently from a slide).
 * `c` is the per-pixel coordinate along the sweep axis (0 = revealed first);
 * the boundary sits at `progress`, with a hairline feather to avoid aliasing.
 */
const wipe = (dx: number, dy: number): string => {
  const c = dx > 0 ? 'uv.x' : dx < 0 ? '1.0 - uv.x' : dy > 0 ? '1.0 - uv.y' : 'uv.y';
  return `vec4 transition(vec2 uv) {
  float c = ${c};
  return mix(getFromColor(uv), getToColor(uv), smoothstep(c - 0.012, c + 0.012, progress));
}`;
};

/** Curated core: `gl.shader` id (and a few transition ids) → canonical source. */
export const TRANSITION_SOURCES: Record<string, string> = {
  // ── simple ────────────────────────────────────────────────────────────────
  crossfade: `vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}`,

  // SLIDE family (push — both frames move) and WIPE family (hard edge over a
  // stationary frame) are DISTINCT shaders, keyed by transition id so the
  // executor finds them. ffmpeg renders the precise versions on the fast tier.
  slideleft: slide(-1, 0),
  slideright: slide(1, 0),
  slideup: slide(0, 1),
  slidedown: slide(0, -1),
  wipeleft: wipe(-1, 0),
  wiperight: wipe(1, 0),
  wipeup: wipe(0, 1),
  wipedown: wipe(0, -1),

  // ── shape / dip ─────────────────────────────────────────────────────────────
  // dissolve — per-pixel noise threshold (a true dissolve, not a flat crossfade).
  dissolve: `float ds_rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), step(ds_rand(uv), progress));
}`,

  // fadeblack — dip OUT to black over the first half, IN from black over the second.
  fadeblack: `vec4 transition(vec2 uv) {
  vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
  if (progress < 0.5) return mix(getFromColor(uv), black, clamp(progress * 2.0, 0.0, 1.0));
  return mix(black, getToColor(uv), clamp(progress * 2.0 - 1.0, 0.0, 1.0));
}`,

  // radial (gl-transitions, gre) — an angular sweep around the centre.
  radial: `const float PI = 3.141592653589793;
vec4 transition(vec2 uv) {
  vec2 rp = uv * 2.0 - 1.0;
  return mix(getToColor(uv), getFromColor(uv),
    smoothstep(0.0, 1.0, atan(rp.y, rp.x) - (progress - 0.5) * PI * 2.5));
}`,

  // iris (circleopen) — a growing circle reveals the incoming, aspect-corrected.
  iris: `vec4 transition(vec2 uv) {
  vec2 c = (uv - 0.5) * vec2(ratio, 1.0);
  float maxr = length(vec2(0.5 * ratio, 0.5));
  float d = length(c) / maxr;
  return mix(getToColor(uv), getFromColor(uv), smoothstep(progress - 0.03, progress + 0.03, d));
}`,

  // zoomin — the incoming punches in from a magnified frame and settles to 1×,
  // crossfading over the outgoing.
  zoomin: `vec4 transition(vec2 uv) {
  vec2 toUV = (uv - 0.5) * mix(2.0, 1.0, progress) + 0.5;
  return mix(getFromColor(uv), getToColor(toUV), smoothstep(0.0, 1.0, progress));
}`,

  // squeeze (squeezeh) — the outgoing collapses vertically to a line, revealing
  // the incoming behind it.
  squeeze: `vec4 transition(vec2 uv) {
  float h = 1.0 - progress;
  float top = 0.5 - h * 0.5;
  if (h > 0.001 && uv.y >= top && uv.y <= top + h) {
    return getFromColor(vec2(uv.x, (uv.y - top) / h));
  }
  return getToColor(uv);
}`,

  // blur — a real defocus dissolve: a box blur whose radius peaks mid-transition
  // while crossfading. (Keyed by id so it wins over the `crosswarp` fallback —
  // distinct from `whip-pan`'s directional warp, which only LOOKED similar when
  // both were warps.)
  blur: `vec4 transition(vec2 uv) {
  float r = 0.025 * sin(progress * 3.141592653589793);
  vec4 a = vec4(0.0);
  vec4 b = vec4(0.0);
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 o = vec2(float(i), float(j)) * (r / 2.0);
      a += getFromColor(uv + o);
      b += getToColor(uv + o);
    }
  }
  return mix(a, b, progress) / 25.0;
}`,

  // ── warps ───────────────────────────────────────────────────────────────────
  // crosswarp (gl-transitions, Eke Péter) — generic horizontal warp/melt.
  crosswarp: `vec4 transition(vec2 p) {
  float x = progress;
  x = smoothstep(0.0, 1.0, (x * 2.0 + p.x - 1.0));
  return mix(getFromColor((p - 0.5) * (1.0 - x) + 0.5), getToColor((p - 0.5) * x + 0.5), x);
}`,

  // directionalwarp (gl-transitions, pschroen) — used by `whip-pan`.
  directionalwarp: `const float dw_smoothness = 0.5;
const vec2 dw_center = vec2(0.5, 0.5);
vec4 transition(vec2 uv) {
  vec2 v = normalize(vec2(-1.0, 1.0));
  v /= abs(v.x) + abs(v.y);
  float d = v.x * dw_center.x + v.y * dw_center.y;
  float m = 1.0 - smoothstep(-dw_smoothness, 0.0,
    v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + dw_smoothness)));
  return mix(getFromColor((uv - 0.5) * (1.0 - m) + 0.5), getToColor((uv - 0.5) * m + 0.5), m);
}`,

  // CrossZoom (gl-transitions, rectalogic) — used by `zoom-blur`.
  CrossZoom: `const float cz_strength = 0.4;
float cz_rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 cz_fade(vec2 uv, float d) { return mix(getFromColor(uv).rgb, getToColor(uv).rgb, d); }
vec4 transition(vec2 uv) {
  vec2 center = vec2(0.25 * progress, 0.5);
  float t = progress / (1.0 / 2.0);
  float dissolve = t < 1.0
    ? 0.5 * pow(2.0, 10.0 * (t - 1.0))
    : 0.5 * (-pow(2.0, -10.0 * (t - 1.0)) + 2.0);
  float strength = -cz_strength / 2.0 * (cos(3.14159265 * min(progress / 0.5, 1.0)) - 1.0);
  vec3 color = vec3(0.0);
  float total = 0.0;
  vec2 toCenter = center - uv;
  float offset = cz_rand(uv);
  for (float i = 0.0; i <= 40.0; i++) {
    float percent = (i + offset) / 40.0;
    float weight = 4.0 * (percent - percent * percent);
    color += cz_fade(uv + toCenter * percent * strength, dissolve) * weight;
    total += weight;
  }
  return vec4(color / total, 1.0);
}`,

  // GlitchMemories (gl-transitions, Gunnar Roth) — used by `glitch`.
  GlitchMemories: `vec4 transition(vec2 p) {
  vec2 block = floor(p.xy / vec2(16.0));
  vec2 uv_noise = block / vec2(64.0);
  uv_noise += floor(vec2(progress) * vec2(1200.0, 3500.0)) / vec2(64.0);
  vec2 dist = progress > 0.0 ? (fract(uv_noise) - 0.5) * 0.3 * (1.0 - progress) : vec2(0.0);
  vec2 red = p + dist * 0.2;
  vec2 green = p + dist * 0.3;
  vec2 blue = p + dist * 0.5;
  return vec4(
    mix(getFromColor(red), getToColor(red), progress).r,
    mix(getFromColor(green), getToColor(green), progress).g,
    mix(getFromColor(blue), getToColor(blue), progress).b, 1.0);
}`,

  // ripple (gl-transitions, gre).
  ripple: `const float rp_amplitude = 100.0;
const float rp_speed = 50.0;
vec4 transition(vec2 uv) {
  vec2 dir = uv - vec2(0.5);
  float dist = length(dir);
  vec2 offset = dir * (sin(progress * dist * rp_amplitude - progress * rp_speed) + 0.5) / 30.0;
  return mix(getFromColor(uv + offset), getToColor(uv), smoothstep(0.2, 1.0, progress));
}`,

  // ── 3D ────────────────────────────────────────────────────────────────────
  // cube (gl-transitions, gre).
  cube: `const float cb_persp = 0.7;
const float cb_unzoom = 0.3;
const float cb_reflection = 0.4;
const float cb_floating = 3.0;
vec2 cb_project(vec2 p) { return p * vec2(1.0, -1.2) + vec2(0.0, -cb_floating / 100.0); }
bool cb_inBounds(vec2 p) { return all(lessThan(vec2(0.0), p)) && all(lessThan(p, vec2(1.0))); }
vec4 cb_bg(vec2 p, vec2 pfr, vec2 pto) {
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  pfr = cb_project(pfr);
  if (cb_inBounds(pfr)) c += mix(vec4(0.0), getFromColor(pfr), cb_reflection * mix(1.0, 0.0, pfr.y));
  pto = cb_project(pto);
  if (cb_inBounds(pto)) c += mix(vec4(0.0), getToColor(pto), cb_reflection * mix(1.0, 0.0, pto.y));
  return c;
}
vec2 cb_xskew(vec2 p, float persp, float center) {
  float x = mix(p.x, 1.0 - p.x, center);
  return (vec2(x, (p.y - 0.5 * (1.0 - persp) * x) / (1.0 + (persp - 1.0) * x))
    - vec2(0.5 - distance(center, 0.5), 0.0))
    * vec2(0.5 / distance(center, 0.5) * (center < 0.5 ? 1.0 : -1.0), 1.0)
    + vec2(center < 0.5 ? 0.0 : 1.0, 0.0);
}
vec4 transition(vec2 op) {
  float uz = cb_unzoom * 2.0 * (0.5 - distance(0.5, progress));
  vec2 p = -uz * 0.5 + (1.0 + uz) * op;
  vec2 fromP = cb_xskew((p - vec2(progress, 0.0)) / vec2(1.0 - progress, 1.0),
    1.0 - mix(progress, 0.0, cb_persp), 0.0);
  vec2 toP = cb_xskew(p / vec2(progress, 1.0), mix(pow(progress, 2.0), 1.0, cb_persp), 1.0);
  if (cb_inBounds(fromP)) return getFromColor(fromP);
  else if (cb_inBounds(toP)) return getToColor(toP);
  return cb_bg(op, fromP, toP);
}`,

  // doorway (gl-transitions, gre).
  doorway: `const float dr_reflection = 0.4;
const float dr_perspective = 0.4;
const float dr_depth = 3.0;
bool dr_inBounds(vec2 p) { return all(lessThan(vec2(0.0), p)) && all(lessThan(p, vec2(1.0))); }
vec2 dr_project(vec2 p) { return p * vec2(1.0, -1.2) + vec2(0.0, -0.02); }
vec4 dr_bg(vec2 p, vec2 pto) {
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  pto = dr_project(pto);
  if (dr_inBounds(pto)) c += mix(vec4(0.0, 0.0, 0.0, 1.0), getToColor(pto), dr_reflection * mix(1.0, 0.0, pto.y));
  return c;
}
vec4 transition(vec2 p) {
  vec2 pfr = vec2(-1.0), pto = vec2(-1.0);
  float middleSlit = 2.0 * abs(p.x - 0.5) - progress;
  if (middleSlit > 0.0) {
    pfr = p + (p.x > 0.5 ? -1.0 : 1.0) * vec2(0.5 * progress, 0.0);
    float d = 1.0 / (1.0 + dr_perspective * progress * (1.0 - middleSlit));
    pfr.y -= d / 2.0;
    pfr.y *= d;
    pfr.y += d / 2.0;
  }
  float size = mix(1.0, dr_depth, 1.0 - progress);
  pto = (p + vec2(-0.5, -0.5)) * vec2(size, size) + vec2(0.5, 0.5);
  if (dr_inBounds(pfr)) return getFromColor(pfr);
  else if (dr_inBounds(pto)) return getToColor(pto);
  return dr_bg(p, pto);
}`,

  // ── PREMIUM (motion-blurred / multi-layer) — the "not cheap" tier ────────────
  // zoom-punch: the incoming PUNCHES in from 1.3× with a 16-tap RADIAL MOTION BLUR
  // while the outgoing pushes out — the CapCut "zoom transition" feel. Motion blur
  // is what separates a premium zoom from a flat scale.
  'zoom-punch': `vec4 transition(vec2 uv) {
  vec2 c = uv - 0.5;
  float pr = smoothstep(0.0, 1.0, progress);
  vec3 col = vec3(0.0); float total = 0.0;
  for (float i = 0.0; i < 16.0; i++) {
    float s = i / 15.0;
    float zf = mix(1.3, 1.0, pr) + s * 0.07 * (1.0 - pr); // sample along the zoom axis
    float w = 1.0 - s;
    col += getToColor(c / zf + 0.5).rgb * w;
    total += w;
  }
  vec3 toC = col / total;
  vec4 fromC = getFromColor(c * mix(1.0, 1.14, pr) + 0.5);
  return vec4(mix(fromC.rgb, toC, pr), 1.0);
}`,

  // rgb-glitch: a hard cut MASKED by per-slice horizontal jitter + chromatic RGB
  // split that peaks mid-transition — the "digital glitch" trend.
  'rgb-glitch': `float rgb_rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 transition(vec2 uv) {
  float pr = progress;
  float intensity = sin(pr * 3.14159265); // 0 at ends, 1 mid
  float slice = floor(uv.y * 24.0);
  float jitter = (rgb_rand(vec2(slice, floor(pr * 30.0))) - 0.5) * 0.12 * intensity;
  float ca = 0.03 * intensity;
  vec2 ruv = uv + vec2(jitter + ca, 0.0);
  vec2 guv = uv + vec2(jitter, 0.0);
  vec2 buv = uv + vec2(jitter - ca, 0.0);
  vec4 from = vec4(getFromColor(ruv).r, getFromColor(guv).g, getFromColor(buv).b, 1.0);
  vec4 to = vec4(getToColor(ruv).r, getToColor(guv).g, getToColor(buv).b, 1.0);
  return mix(from, to, step(0.5, pr));
}`,

  // light-leak-film: a smooth dissolve that SCREENS a real overlay TEXTURE (a
  // film-leak / lens-flare clip, sampled via getOverlayColor — needs overlay:true)
  // over the blend, brightest mid-transition. The shader is core + reusable; a pack
  // supplies its own leak texture via the transition's `overlay.source`.
  'light-leak-film': `vec4 transition(vec2 uv) {
  float pr = smoothstep(0.0, 1.0, progress);
  vec3 base = mix(getFromColor(uv).rgb, getToColor(uv).rgb, pr);
  vec3 ov = getOverlayColor(uv).rgb * sin(progress * 3.14159265);
  vec3 screen = 1.0 - (1.0 - base) * (1.0 - clamp(ov, 0.0, 1.0));
  return vec4(screen, 1.0);
}`,

  // light-leak: a smooth dissolve with a warm bloom band sweeping across — the
  // film-leak / lens-flare wash that reads as "premium" over a plain crossfade.
  'light-leak': `vec4 transition(vec2 uv) {
  float pr = smoothstep(0.0, 1.0, progress);
  vec3 base = mix(getFromColor(uv).rgb, getToColor(uv).rgb, pr);
  float band = exp(-pow((uv.x - progress) * 3.0, 2.0)) * sin(progress * 3.14159265);
  vec3 leak = vec3(1.0, 0.82, 0.55) * band * 0.9;
  return vec4(base + leak, 1.0);
}`,
};

/**
 * BYO transition GLSL — the public extension point (mirrors `registerEffect` /
 * `registerPixiEffect`). A pack registers a `gl-transitions`-convention source
 * (a `vec4 transition(vec2 uv)` reading `getFromColor`/`getToColor` over
 * `progress`, with `ratio` + `{{param}}` tokens) keyed by a transition `id`
 * (or `gl.shader` id). Because BOTH renderers resolve GLSL through {@link
 * getTransitionSource} — the Pixi preview, the premium headless-Pixi export, and
 * (later) the engine GL hook — ONE registration makes a custom transition render
 * everywhere, WYSIWYG. Registered ids override the built-in core (so a pack can
 * also upgrade a stock transition). Pair with `registerPack({ transitions })` to
 * add the catalog descriptor the editor + agent pick from.
 */
const REGISTERED_SOURCES = new Map<string, string>();

/** Register (or override) a transition's GLSL source so it renders in every GL context. */
export function registerTransitionSource(id: string, glsl: string): void {
  REGISTERED_SOURCES.set(id, glsl);
}

/** Has a (registered or built-in core) GLSL source for this transition id / gl.shader? */
export function hasTransitionSource(id: string, glShader?: string): boolean {
  return getTransitionSource(id, glShader) !== undefined;
}

/**
 * Resolve a transition's canonical GLSL source. Order: a BYO-registered source
 * (by id, then `gl.shader` id) → the inlined core (by id, then `gl.shader` id).
 * Returns `undefined` when no GL source exists (caller falls back to a crossfade,
 * the honest preview for an ffmpeg-only transition).
 */
export function getTransitionSource(id: string, glShader?: string): string | undefined {
  return (
    REGISTERED_SOURCES.get(id) ??
    TRANSITION_SOURCES[id] ??
    (glShader ? REGISTERED_SOURCES.get(glShader) ?? TRANSITION_SOURCES[glShader] : undefined)
  );
}
