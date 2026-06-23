/**
 * Shader wrapping — the ONE place that turns a canonical vixel shader source into
 * a concrete GLSL fragment. Pure string transforms, zero deps, so BOTH renderers
 * share it: the Pixi preview/export (vixel-ui) and the engine's libplacebo hook
 * (vixel) import from here instead of each carrying a private copy. This is what
 * keeps "what the editor shows" and "what the server renders" the SAME shader.
 *
 * Two canonical conventions:
 *  • EFFECT (single-texture): a pack ships `vec4 vixelEffect(vec2 uv)` reading
 *    pixels via `vixelSample(uv)`, optionally animated by `uTime`.
 *  • TRANSITION (two-texture): a pack ships `vec4 transition(vec2 uv)` reading the
 *    outgoing/incoming clips via `getFromColor(uv)`/`getToColor(uv)` over
 *    `progress` 0→1 (the gl-transitions convention), with `ratio` (aspect) and
 *    named `{{param}}` tokens available.
 *
 * Time-varying scalars (`uTime`, `progress`) are dual-mode:
 *  • LIVE  — declared as a PLAIN default-block uniform (`uniform float progress;`),
 *    cheap to update per-frame. Pixi v8 auto-packs default-block uniforms into a
 *    generated UBO and binds it from the matching `resources` group — the SAME way
 *    its own `uInputSize`/`uOutputFrame` (see VIXEL_FILTER_VERT) are wired. (A
 *    hand-written `uniform vixelUniforms { … }` interface block is NOT managed by
 *    Pixi → no buffer is ever bound → "used but unbound uniform buffer" at draw.)
 *  • BAKED — substituted as a GLSL literal (no uniform at all). Export renders
 *    frame-by-frame offline, so the per-frame recompile is free and this is what
 *    lets a GPU-less server (Chromium → SwiftShader, which rejects UBOs) render
 *    premium shaders/transitions at all.
 */

import type { EffectParam, EffectDescriptor } from './effects/index.js';

/** A float literal GLSL will accept (integers need a trailing `.0`). */
export function glFloat(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : `${v}`;
}

/** True for a `#RGB`/`#RRGGBB`(`AA`) hex color string. */
export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

/** Parse a hex color to normalized [r, g, b] (0..1). `#abc` shorthand expands. */
export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A live uniform a wrapped shader declares — bound by the renderer's executor. */
export interface ShaderUniformSpec {
  name: string;
  /** Pixi uniform type: scalar `f32` (number/boolean) or `vec3<f32>` (color). */
  type: 'f32' | 'vec3<f32>';
  /** Initial value: a number (f32) or normalized rgb triple (vec3). */
  value: number | [number, number, number];
}

/** A texture INPUT a wrapped shader declares (`uniform sampler2D <name>`) — the
 *  renderer's executor loads `url` and binds the texture source to `name`. */
export interface ShaderTextureSpec {
  name: string;
  /** Resolved image URL (the EffectRef value, else the param default). */
  url: string | undefined;
}

/**
 * Resolve a shader source's `{{name}}` tokens against its param contract — the
 * heart of live-vs-baked binding. Returns the rewritten `body`, the GLSL `decls`
 * for any LIVE uniforms, and their {@link ShaderUniformSpec}s (for the executor to
 * bind). A token is a LIVE uniform when its param def is number/color/boolean and
 * `bind !== 'literal'` and we're not baking; otherwise it's substituted as a GLSL
 * literal. A token with NO matching def degrades to the legacy behaviour (numbers
 * floatified, everything else `0.0`) — byte-identical to {@link substituteParams},
 * so callers that pass no `paramDefs` (e.g. the engine) are unaffected.
 */
function bindShaderParams(
  source: string,
  params: Record<string, number | string | boolean> | undefined,
  paramDefs: readonly EffectParam[] | undefined,
  bake: boolean,
): { body: string; decls: string[]; uniforms: ShaderUniformSpec[]; textures: ShaderTextureSpec[] } {
  const defByName = new Map((paramDefs ?? []).map((p) => [p.name, p]));
  const uniforms: ShaderUniformSpec[] = [];
  const textures: ShaderTextureSpec[] = [];
  const decls: string[] = [];
  const seen = new Set<string>();
  const body = source.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const def = defByName.get(k);
    const v = params?.[k];
    // No declared param → legacy substituteParams behaviour (back-compat).
    if (!def) return typeof v === 'number' ? glFloat(v) : '0.0';
    const live = !bake && def.bind !== 'literal' && def.type !== 'enum';
    if (live && (def.type === 'number' || def.type === 'boolean')) {
      if (!seen.has(k)) {
        seen.add(k);
        decls.push(`uniform float ${k};`);
        uniforms.push({ name: k, type: 'f32', value: typeof v === 'number' ? v : v ? 1 : 0 });
      }
      return k;
    }
    if (live && def.type === 'color' && isHexColor(v)) {
      if (!seen.has(k)) {
        seen.add(k);
        decls.push(`uniform vec3 ${k};`);
        uniforms.push({ name: k, type: 'vec3<f32>', value: hexToRgb01(v) });
      }
      return k;
    }
    // Baked literal (enum / bind:'literal' / export / color-as-vec3 / boolean).
    if (typeof v === 'number') return glFloat(v);
    if (typeof v === 'boolean') return v ? '1.0' : '0.0';
    if (isHexColor(v)) {
      const [r, g, b] = hexToRgb01(v);
      return `vec3(${glFloat(r)}, ${glFloat(g)}, ${glFloat(b)})`;
    }
    return '0.0';
  });
  // Texture INPUTS aren't `{{token}}` values — declare a sampler per texture param
  // (the author samples it directly) and resolve its URL (ref value → param default).
  for (const p of paramDefs ?? []) {
    if (p.type !== 'texture' || seen.has(p.name)) continue;
    seen.add(p.name);
    decls.push(`uniform sampler2D ${p.name};`);
    const v = params?.[p.name] ?? p.default;
    textures.push({ name: p.name, url: typeof v === 'string' && v ? v : undefined });
  }
  return { body, decls, uniforms, textures };
}

/** Substitute `{{name}}` param tokens into shader source (numbers floatified). */
export function substituteParams(
  source: string,
  params: Record<string, number | string | boolean> | undefined,
): string {
  return source.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = params?.[k];
    return typeof v === 'number' ? glFloat(v) : '0.0';
  });
}

/** The Pixi v8 standard filter vertex (shared by every vixel fragment). */
export const VIXEL_FILTER_VERT = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord() { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main() { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }`;

export interface EffectWrapOptions {
  params?: Record<string, number | string | boolean>;
  /** Param contract — enables LIVE typed uniforms for number/color/boolean tokens
   *  (no recompile on value change). Omit → legacy literal substitution (back-compat). */
  paramDefs?: readonly EffectParam[];
  /** Bake `uTime` as this literal (export mode) instead of a uniform (live). */
  bakeTime?: number;
  /** Export mode: bake ALL params as GLSL literals (no live uniforms) — for a
   *  GPU-less server (SwiftShader rejects UBOs). Defaults to `bakeTime !== undefined`. */
  bakeParams?: boolean;
}

/**
 * Wrap a canonical `vixelEffect` source into a Pixi WebGL fragment. Returns the
 * fragment, whether it declares a `uTime` uniform, and the LIVE param uniforms it
 * declares (number/color/boolean — empty unless `paramDefs` is given and not baking),
 * so the caller wires + updates the uniform groups without recompiling.
 */
export function wrapEffectFragment(
  source: string,
  opts: EffectWrapOptions = {},
): { fragment: string; usesTimeUniform: boolean; uniforms: ShaderUniformSpec[]; textures: ShaderTextureSpec[]; usesOriginal: boolean } {
  const bake = opts.bakeParams ?? opts.bakeTime !== undefined;
  const { body, decls, uniforms, textures } = bindShaderParams(source, opts.params, opts.paramDefs, bake);
  const animated = /\buTime\b/.test(body);
  // A multi-pass composite pass can read the ORIGINAL clip (not just the previous
  // pass) via `vixelOriginal(uv)` — declare the sampler + helper when referenced.
  const usesOriginal = /\bvixelOriginal\b/.test(body);
  const originalDecl = usesOriginal
    ? 'uniform sampler2D uOriginal;\nvec4 vixelOriginal(vec2 uv) { return texture(uOriginal, uv); }'
    : '';
  const baked = opts.bakeTime !== undefined;
  const usesTimeUniform = animated && !baked;
  const timeDecl = !animated
    ? ''
    : baked
      ? `float uTime = ${glFloat(opts.bakeTime!)};`
      : 'uniform float uTime;';
  // `#version 300 es` is REQUIRED as the first line: Pixi v8's GlProgram only runs
  // its version/precision preprocessing (and supports `in`/`out`) when it detects
  // this directive — otherwise it compiles as GLSL ES 1.00. Live `uTime` + the param
  // uniforms are PLAIN default-block uniforms; Pixi reflects them and binds them from
  // the caller's resource groups (a hand-written interface block would not bind).
  const fragment = `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
${timeDecl}
${originalDecl}
${decls.join('\n')}
vec4 vixelSample(vec2 uv) { return texture(uTexture, uv); }
${body}
void main() { finalColor = vixelEffect(vTextureCoord); }`;
  return { fragment, usesTimeUniform, uniforms, textures, usesOriginal };
}

/**
 * Static validation of a `shader`-kind {@link EffectDescriptor} — structural checks
 * that catch BYO authoring mistakes BEFORE render (where a GLSL error would just make
 * the effect silently not apply). Returns human-readable problems (empty = ok).
 * Inline source only (URL sources are fetched + checked at load). Pure + dependency-free.
 */
export function validateShaderDescriptor(d: EffectDescriptor): string[] {
  const errors: string[] = [];
  if (d.kind !== 'shader') return errors;
  const inline = d.source && /\bvixelEffect\b|\btransition\b/.test(d.source) ? d.source : undefined;
  if (inline) {
    if (!/\bvixelEffect\b/.test(inline) && !/\btransition\b/.test(inline)) {
      errors.push(`shader "${d.id}": source must define \`vec4 vixelEffect(vec2 uv)\` (effect) or \`vec4 transition(vec2 uv)\` (transition).`);
    }
    const declared = new Set((d.params ?? []).map((p) => p.name));
    for (const m of inline.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!declared.has(m[1])) errors.push(`shader "${d.id}": token {{${m[1]}}} has no matching param in \`params\`.`);
    }
  }
  for (const p of d.params ?? []) {
    if (p.type === 'enum' && (!p.options || p.options.length === 0)) {
      errors.push(`shader "${d.id}": enum param "${p.name}" needs \`options\`.`);
    }
    if (p.bind === 'uniform' && p.type === 'enum') {
      errors.push(`shader "${d.id}": enum param "${p.name}" cannot be bind:'uniform' (enums select code paths → always literal).`);
    }
  }
  return errors;
}

export interface TransitionWrapOptions {
  params?: Record<string, number | string | boolean>;
  /** Output aspect (width / height) — exposed to the shader as `ratio`. */
  ratio: number;
  /** Bake `progress` as this literal (export mode) instead of a uniform (live). */
  bakeProgress?: number;
  /**
   * Bind a third sampler `uOverlay` (a light-leak / film-burn / particle texture)
   * and expose `vec4 getOverlayColor(vec2 uv)` to the source — for premium
   * overlay-texture transitions that composite real footage over the blend. The
   * executor binds the texture; when absent the helper is omitted (no extra cost).
   */
  overlay?: boolean;
  /**
   * Camera SHAKE intensity (fraction of frame, ~0.004–0.02). When >0 the wrapped
   * coordinate is jittered (and slightly zoomed-in to hide the edge gap) on a
   * progress-driven envelope that peaks mid-transition — the handheld "impact"
   * energy on whip/zoom/glitch cuts. Deterministic (a function of `progress`), so
   * preview and export shake identically. 0 = no shake (zero cost).
   */
  shake?: number;
}

/**
 * Wrap a canonical `transition` source (gl-transitions convention) into a Pixi
 * two-texture fragment. The sprite's own texture is the OUTGOING clip (`uTexture`
 * → `getFromColor`); the INCOMING clip is bound as `uTo` (`getToColor`). Returns
 * the fragment plus whether it declares a `progress` uniform.
 */
export function wrapTransitionFragment(
  source: string,
  opts: TransitionWrapOptions,
): { fragment: string; usesProgressUniform: boolean } {
  const body = substituteParams(source, opts.params);
  const baked = opts.bakeProgress !== undefined;
  const usesProgressUniform = !baked;
  const progDecl = baked
    ? `float progress = ${glFloat(opts.bakeProgress!)};`
    : 'uniform float progress;';
  // `#version 300 es` first — see wrapEffectFragment: Pixi v8 needs it to enable
  // ES-3.00 (`in`/`out`). Live `progress` is a PLAIN default-block uniform that
  // Pixi packs+binds from the caller's `vixelUniforms` resource group.
  const overlayDecl = opts.overlay
    ? 'uniform sampler2D uOverlay;\nvec4 getOverlayColor(vec2 uv) { return texture(uOverlay, uv); }'
    : '';
  // Camera shake: jitter (+ slight zoom-in to hide edge gaps) on a mid-peak
  // envelope, baked from `progress` so it's deterministic across preview/export.
  const shake = opts.shake && opts.shake > 0 ? opts.shake : 0;
  const shakeDecl = shake
    ? `vec2 vixelShake(vec2 uv) {
  float amp = ${glFloat(shake)} * sin(progress * 3.14159265);
  vec2 j = vec2(sin(progress * 113.0), cos(progress * 79.0)) * amp;
  return (uv - 0.5) / (1.0 + 2.0 * amp) + 0.5 + j;
}`
    : '';
  const coord = shake ? 'vixelShake(vTextureCoord)' : 'vTextureCoord';
  const fragment = `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uTo;
${progDecl}
const float ratio = ${glFloat(opts.ratio)};
${overlayDecl}
vec4 getFromColor(vec2 uv) { return texture(uTexture, uv); }
vec4 getToColor(vec2 uv) { return texture(uTo, uv); }
${shakeDecl}
${body}
void main() { finalColor = transition(${coord}); }`;
  return { fragment, usesProgressUniform };
}
