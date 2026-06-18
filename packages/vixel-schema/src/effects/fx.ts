/**
 * EFFECTS catalog — stylize / FX layers (the CapCut "Effects" panel). Stackable,
 * often animated: vignette, blur, grain, and (the scalable path) `shader` GLSL FX
 * (glitch, chromatic aberration, CRT, scanlines) + `overlay` footage (light leaks,
 * bokeh, dust). Add an FX HERE; colour grades go in ./filters.
 *
 * To add a SHADER FX (data, not code — rendered by the shared GLSL executor): drop a
 * `{ id, name, kind: 'shader', surface: 'effect', source: '<glsl>', category, params }`.
 * To add OVERLAY footage: `{ id, name, kind: 'overlay', surface: 'effect', source, blend }`.
 * Effects with no faithful core-Pixi mapping declare `unsupported: ['pixi']` so the
 * parity test allows the gap and the editor badges them "Export".
 */
import type { EffectDescriptor } from './contract.js';

export const FX_EFFECTS: EffectDescriptor[] = [
  {
    id: 'blur',
    name: 'Blur',
    kind: 'filter',
    surface: 'effect',
    category: 'Stylize',
    preview: { css: 'blur(3px)' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 8, min: 1, max: 50, step: 1 }],
  },
  // Pixi: a radial edge-darkening fragment; ffmpeg: `vignette`. Both renderers.
  { id: 'vignette', name: 'Vignette', kind: 'filter', surface: 'effect', category: 'Stylize', preview: { overlay: 'vignette' } },
  // Film grain (ffmpeg `noise`, animated per-frame) and sharpen (ffmpeg `unsharp`,
  // a 3×3 convolution) have no faithful core-Pixi mapping — an animated/neighbor-
  // sampling preview would drift from the export, so they stay export-only (declared
  // unsupported so the parity test allows the gap, and the editor badges them).
  {
    id: 'grain',
    name: 'Film Grain',
    kind: 'filter',
    surface: 'effect',
    category: 'Stylize',
    preview: { overlay: 'grain' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 16, min: 0, max: 60, step: 1 }],
    unsupported: ['pixi'],
  },
  {
    id: 'sharpen',
    name: 'Sharpen',
    kind: 'filter',
    surface: 'effect',
    category: 'Stylize',
    preview: { css: 'contrast(1.3) saturate(1.1)' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 1, min: 0, max: 3, step: 0.1 }],
    unsupported: ['pixi'],
  },

  // ── Stylize FX (kind:'shader' — PURE DATA, shared GLSL executor, both renderers).
  // Static (no uTime) so the look is visible on a paused frame, not just on playback.
  {
    id: 'chromatic',
    name: 'Chromatic',
    kind: 'shader',
    surface: 'effect',
    category: 'Distort',
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 3, min: 0, max: 20, step: 0.5 }],
    source: `vec4 vixelEffect(vec2 uv){
  vec2 dir = uv - 0.5;
  float a = {{amount}} * 0.01;
  float r = vixelSample(uv + dir * a).r;
  float g = vixelSample(uv).g;
  float b = vixelSample(uv - dir * a).b;
  return vec4(r, g, b, vixelSample(uv).a);
}`,
  },
  {
    id: 'scanlines',
    name: 'Scanlines',
    kind: 'shader',
    surface: 'effect',
    category: 'Retro',
    params: [
      { name: 'density', type: 'number', label: 'Density', default: 420, min: 80, max: 1200, step: 20 },
      { name: 'strength', type: 'number', label: 'Strength', default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float s = sin(uv.y * {{density}}) * 0.5 + 0.5;
  float darken = mix(1.0, s, {{strength}});
  return vec4(c.rgb * darken, c.a);
}`,
  },
  {
    id: 'posterize',
    name: 'Posterize',
    kind: 'shader',
    surface: 'effect',
    category: 'Stylize',
    params: [{ name: 'levels', type: 'number', label: 'Levels', default: 6, min: 2, max: 16, step: 1 }],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float n = {{levels}};
  return vec4(floor(c.rgb * n) / n, c.a);
}`,
  },

  // ── ANIMATED FX (kind:'shader' with `uTime` = playhead seconds → deterministic +
  // frame-accurate in export; they animate during playback, scrub to any frame). Pure
  // data, driven by the shared uTime tick — no renderer code.
  {
    id: 'shake',
    name: 'Camera Shake',
    kind: 'shader',
    surface: 'effect',
    category: 'Motion',
    params: [
      { name: 'amount', type: 'number', label: 'Amount', default: 4, min: 0, max: 20, step: 0.5 },
      { name: 'speed', type: 'number', label: 'Speed', default: 6, min: 0.5, max: 20, step: 0.5 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  float t = uTime * {{speed}};
  vec2 o = vec2(sin(t * 12.9) + sin(t * 7.3), cos(t * 9.1) + sin(t * 5.7)) * {{amount}} * 0.004;
  return vixelSample(uv + o);
}`,
  },
  {
    id: 'pulse',
    name: 'Zoom Pulse',
    kind: 'shader',
    surface: 'effect',
    category: 'Motion',
    params: [
      { name: 'amount', type: 'number', label: 'Amount', default: 0.5, min: 0, max: 1, step: 0.05 },
      { name: 'speed', type: 'number', label: 'Speed', default: 1, min: 0.1, max: 6, step: 0.1 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  float s = 1.0 + sin(uTime * {{speed}} * 6.2831) * {{amount}} * 0.06;
  return vixelSample((uv - 0.5) / s + 0.5);
}`,
  },
  {
    id: 'flicker',
    name: 'Flicker',
    kind: 'shader',
    surface: 'effect',
    category: 'Retro',
    params: [
      { name: 'amount', type: 'number', label: 'Amount', default: 0.3, min: 0, max: 1, step: 0.05 },
      { name: 'speed', type: 'number', label: 'Speed', default: 8, min: 1, max: 30, step: 1 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float f = 1.0 - {{amount}} * 0.5 * (0.5 + 0.5 * sin(uTime * {{speed}} * 6.2831));
  return vec4(c.rgb * f, c.a);
}`,
  },
  {
    id: 'light-leak',
    name: 'Light Leak',
    kind: 'shader',
    surface: 'effect',
    category: 'Light',
    params: [
      { name: 'amount', type: 'number', label: 'Amount', default: 0.6, min: 0, max: 1, step: 0.05 },
      { name: 'speed', type: 'number', label: 'Speed', default: 1.5, min: 0.1, max: 6, step: 0.1 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float sweep = sin((uv.x + uv.y) * 2.0 + uTime * {{speed}});
  float m = smoothstep(0.3, 1.0, sweep) * {{amount}};
  vec3 leak = vec3(1.0, 0.55, 0.2) * m;
  return vec4(c.rgb + leak * (1.0 - c.rgb), c.a);
}`,
  },
  {
    id: 'vhs',
    name: 'VHS',
    kind: 'shader',
    surface: 'effect',
    category: 'Retro',
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 1, min: 0, max: 3, step: 0.1 }],
    source: `float vhs_rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 vixelEffect(vec2 uv){
  float jit = (vhs_rand(vec2(floor(uv.y * 120.0), floor(uTime * 15.0))) - 0.5) * {{amount}} * 0.02;
  vec2 p = vec2(uv.x + jit, uv.y);
  float ca = {{amount}} * 0.004;
  float r = vixelSample(p + vec2(ca, 0.0)).r;
  float g = vixelSample(p).g;
  float b = vixelSample(p - vec2(ca, 0.0)).b;
  float roll = sin((uv.y + uTime * 0.3) * 200.0) * 0.04;
  return vec4(vec3(r, g, b) * (1.0 - roll), vixelSample(p).a);
}`,
  },

  // ── Single-pass FX ported FROM pixi-filters to CORE inline shaders, so they're
  // portable DATA: they render in the editor, in-browser export, the headless-Pixi
  // server tier, AND the ffmpeg/libplacebo engine — no native dependency anywhere.
  // (Only genuinely MULTI-pass effects — glow/bloom — stay in the opt-in pixi-filters
  // pack; everything else lives here as data.)
  {
    id: 'crt',
    name: 'CRT',
    kind: 'shader',
    surface: 'effect',
    category: 'Retro',
    params: [
      { name: 'curvature', type: 'number', label: 'Curvature', default: 1.5, min: 0, max: 6, step: 0.25 },
      { name: 'lines', type: 'number', label: 'Lines', default: 720, min: 100, max: 1500, step: 20 },
      { name: 'vignette', type: 'number', label: 'Vignette', default: 0.6, min: 0, max: 1, step: 0.05 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  vec2 cc = uv - 0.5;
  vec2 buv = uv + cc * dot(cc, cc) * {{curvature}} * 0.35;
  if (buv.x < 0.0 || buv.x > 1.0 || buv.y < 0.0 || buv.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec4 col = vixelSample(buv);
  float scan = 0.82 + 0.18 * sin(buv.y * {{lines}});
  float vig = smoothstep(0.9, 0.35, length(cc));
  return vec4(col.rgb * scan * mix(1.0, vig, {{vignette}}), col.a);
}`,
  },
  {
    id: 'glitch',
    name: 'Glitch',
    kind: 'shader',
    surface: 'effect',
    category: 'Retro',
    params: [
      { name: 'slices', type: 'number', label: 'Slices', default: 12, min: 2, max: 40, step: 1 },
      { name: 'offset', type: 'number', label: 'Offset', default: 30, min: 0, max: 120, step: 5 },
    ],
    source: `float hash(float n){ return fract(sin(n * 78.233) * 43758.5453); }
vec4 vixelEffect(vec2 uv){
  float t = floor(uTime * 12.0);
  float slice = floor(uv.y * {{slices}});
  float jump = step(0.65, hash(slice * 1.7 + t));
  float jitter = (hash(slice + t) - 0.5) * {{offset}} * 0.01 * jump;
  vec2 p = vec2(uv.x + jitter, uv.y);
  float ca = {{offset}} * 0.0015 * (0.5 + jump);
  float r = vixelSample(p + vec2(ca, 0.0)).r;
  float g = vixelSample(p).g;
  float b = vixelSample(p - vec2(ca, 0.0)).b;
  return vec4(r, g, b, vixelSample(p).a);
}`,
  },
  {
    id: 'pixelate',
    name: 'Pixelate',
    kind: 'shader',
    surface: 'effect',
    category: 'Stylize',
    params: [{ name: 'amount', type: 'number', label: 'Cells', default: 80, min: 8, max: 400, step: 2 }],
    source: `vec4 vixelEffect(vec2 uv){
  float n = {{amount}};
  return vixelSample((floor(uv * n) + 0.5) / n);
}`,
  },
  {
    id: 'bulge',
    name: 'Bulge',
    kind: 'shader',
    surface: 'effect',
    category: 'Distort',
    params: [{ name: 'strength', type: 'number', label: 'Strength', default: 0.6, min: -1, max: 1, step: 0.05 }],
    source: `vec4 vixelEffect(vec2 uv){
  vec2 cc = uv - 0.5;
  float d = clamp(length(cc) * 2.0, 0.0, 1.0);
  float k = 1.0 + {{strength}} * (1.0 - d);
  return vixelSample(cc / k + 0.5);
}`,
  },
  {
    id: 'halftone',
    name: 'Halftone',
    kind: 'shader',
    surface: 'effect',
    category: 'Stylize',
    params: [
      { name: 'scale', type: 'number', label: 'Dot Density', default: 90, min: 20, max: 220, step: 5 },
      { name: 'angle', type: 'number', label: 'Angle', default: 15, min: 0, max: 90, step: 5 },
    ],
    source: `vec4 vixelEffect(vec2 uv){
  float a = radians({{angle}});
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 cell = fract(rot * uv * {{scale}}) - 0.5;
  vec4 col = vixelSample(uv);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  float radius = (1.0 - lum) * 0.75;
  float dotv = smoothstep(radius, radius - 0.08, length(cell));
  return vec4(col.rgb * mix(0.12, 1.0, dotv), col.a);
}`,
  },
];
