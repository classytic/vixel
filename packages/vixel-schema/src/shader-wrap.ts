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

/** A float literal GLSL will accept (integers need a trailing `.0`). */
export function glFloat(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : `${v}`;
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
  /** Bake `uTime` as this literal (export mode) instead of a uniform (live). */
  bakeTime?: number;
}

/**
 * Wrap a canonical `vixelEffect` source into a Pixi WebGL fragment. Returns the
 * fragment plus whether it declares a `uTime` uniform (so the caller wires the
 * uniform group only when live + animated).
 */
export function wrapEffectFragment(
  source: string,
  opts: EffectWrapOptions = {},
): { fragment: string; usesTimeUniform: boolean } {
  const body = substituteParams(source, opts.params);
  const animated = /\buTime\b/.test(body);
  const baked = opts.bakeTime !== undefined;
  const usesTimeUniform = animated && !baked;
  const timeDecl = !animated
    ? ''
    : baked
      ? `float uTime = ${glFloat(opts.bakeTime!)};`
      : 'uniform float uTime;';
  // `#version 300 es` is REQUIRED as the first line: Pixi v8's GlProgram only runs
  // its version/precision preprocessing (and supports `in`/`out`) when it detects
  // this directive — otherwise it compiles as GLSL ES 1.00. The live `uTime` is a
  // PLAIN default-block uniform; Pixi reflects it and binds it from the caller's
  // `vixelUniforms` resource group (a hand-written interface block would not bind).
  const fragment = `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
${timeDecl}
vec4 vixelSample(vec2 uv) { return texture(uTexture, uv); }
${body}
void main() { finalColor = vixelEffect(vTextureCoord); }`;
  return { fragment, usesTimeUniform };
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
