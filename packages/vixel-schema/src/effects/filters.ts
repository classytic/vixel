/**
 * FILTERS catalog — colour LOOKS (the CapCut "Filters" panel). A filter is "one
 * grade per clip": black-&-white, warm/cool, vintage, and (the scalable path) `.cube`
 * 3D LUTs for film looks. Add a colour grade HERE; FX/stylize layers go in ./fx.
 *
 * To add a LUT film look (the way a hundred-strong filter pack scales): drop a
 * `{ id, name, kind: 'lut', source: '<name>.cube', category, params: [intensity] }`
 * — no renderer code, the shared LUT executor (ffmpeg `lut3d` / Pixi LUT) handles it.
 */
import type { EffectDescriptor } from './contract.js';

export const FILTER_EFFECTS: EffectDescriptor[] = [
  // ── Basic looks ─────────────────────────────────────────────────────────────
  { id: 'grayscale', name: 'Black & White', kind: 'filter', category: 'Basic', preview: { css: 'grayscale(1)' } },
  { id: 'sepia', name: 'Sepia', kind: 'filter', category: 'Basic', preview: { css: 'sepia(0.85)' } },
  { id: 'invert', name: 'Invert', kind: 'filter', category: 'Basic', preview: { css: 'invert(1)' } },
  // Pixi: a faded warm color matrix; ffmpeg: `curves` vintage preset. Both renderers.
  { id: 'vintage', name: 'Vintage', kind: 'filter', category: 'Basic', preview: { css: 'sepia(0.45) contrast(1.1) brightness(1.03) saturate(0.85)' } },

  // ── Light ─────────────────────────────────────────────────────────────────────
  {
    id: 'brightness',
    name: 'Brightness',
    kind: 'filter',
    category: 'Light',
    preview: { css: 'brightness(1.35)' },
    // Default is the VISIBLE one-click look (matches the swatch preview), not the
    // neutral 0 — clicking a filter must DO something; drag the slider toward 0 to soften.
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 0.35, min: -1, max: 1, step: 0.05 }],
  },
  {
    id: 'contrast',
    name: 'Contrast',
    kind: 'filter',
    category: 'Light',
    preview: { css: 'contrast(1.65)' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 1.65, min: 0, max: 3, step: 0.05 }],
  },

  // ── Color ───────────────────────────────────────────────────────────────────
  {
    id: 'saturation',
    name: 'Saturation',
    kind: 'filter',
    category: 'Color',
    preview: { css: 'saturate(2.3)' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 2.3, min: 0, max: 3, step: 0.05 }],
  },
  {
    id: 'warm',
    name: 'Warm',
    kind: 'filter',
    category: 'Color',
    preview: { css: 'saturate(1.3)', overlay: 'warm' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 0.5, min: 0, max: 1, step: 0.05 }],
  },
  {
    id: 'cool',
    name: 'Cool',
    kind: 'filter',
    category: 'Color',
    preview: { css: 'saturate(1.1)', overlay: 'cool' },
    params: [{ name: 'amount', type: 'number', label: 'Amount', default: 0.5, min: 0, max: 1, step: 0.05 }],
  },
  {
    id: 'hue',
    name: 'Hue Shift',
    kind: 'filter',
    category: 'Color',
    preview: { css: 'hue-rotate(90deg) saturate(1.2)' },
    params: [{ name: 'degrees', type: 'number', label: 'Degrees', default: 30, min: -180, max: 180, step: 5, unit: '°' }],
  },

  // ── Cinematic grades (kind:'shader' — PURE DATA, rendered by the shared GLSL
  // executor in both Pixi + the engine; no per-effect renderer code). This is the
  // scalable path: a film-look pack is just more of these (or `lut` .cube files).
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    kind: 'shader',
    category: 'Cinematic',
    preview: { css: 'contrast(1.08) saturate(1.25)' },
    params: [{ name: 'amount', type: 'number', label: 'Strength', default: 0.6, min: 0, max: 1, step: 0.05 }],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 tint = mix(vec3(0.10, 0.52, 0.62), vec3(1.05, 0.66, 0.32), smoothstep(0.18, 0.82, l));
  vec3 graded = clamp(c.rgb * tint * 1.45, 0.0, 1.0);
  return vec4(mix(c.rgb, graded, {{amount}}), c.a);
}`,
  },
  {
    id: 'noir',
    name: 'Noir',
    kind: 'shader',
    category: 'Cinematic',
    preview: { css: 'grayscale(1) contrast(1.5)' },
    params: [{ name: 'contrast', type: 'number', label: 'Contrast', default: 1.5, min: 1, max: 3, step: 0.05 }],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  l = clamp((l - 0.5) * {{contrast}} + 0.5, 0.0, 1.0);
  return vec4(vec3(l), c.a);
}`,
  },
  {
    id: 'duotone',
    name: 'Duotone',
    kind: 'shader',
    category: 'Cinematic',
    params: [{ name: 'amount', type: 'number', label: 'Strength', default: 0.85, min: 0, max: 1, step: 0.05 }],
    source: `vec4 vixelEffect(vec2 uv){
  vec4 c = vixelSample(uv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 duo = mix(vec3(0.10, 0.05, 0.27), vec3(1.0, 0.55, 0.36), l);
  return vec4(mix(c.rgb, duo, {{amount}}), c.a);
}`,
  },
];
