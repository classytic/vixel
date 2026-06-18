/**
 * gl-transition executor (Pixi side) — the two-texture sibling of the single-
 * texture effect filter. During a clip-to-clip overlap we capture the OUTGOING
 * and INCOMING clips into two RenderTextures, then draw ONE full-frame sprite
 * whose fragment (built by the schema's {@link wrapTransitionFragment}) blends
 * them by `progress`. The GLSL itself lives in the schema ({@link getTransitionSource});
 * this module is just the Pixi binding (RenderTexture capture + filter wiring), so
 * the editor preview, the in-browser export, and the headless server export all
 * run the SAME transition from one source.
 *
 * `progress` is dual-mode (see ./shader-wrap): a uniform when LIVE (smooth, real
 * GPU) and a baked GLSL literal when `bake` (export) — the latter avoids the
 * uniform interface block that a GPU-less server (Chromium→SwiftShader) rejects.
 */
import type * as PIXINS from 'pixi.js';
import type { TransitionRef } from '@classytic/vixel-schema';
import { wrapTransitionFragment, VIXEL_FILTER_VERT, BUILTIN_TRANSITIONS, getTransitionSource } from '@classytic/vixel-schema';
import type { Pixi, RetainedScene, RetainedNode, TransitionGfx } from '../types.js';

type ParamMap = Record<string, number | string | boolean> | undefined;

// Transition id → its `gl.shader` key, so a ref resolves to canonical GLSL. Built
// once from the catalog; BYO transitions fall through to an exact-id source match.
const TRANSITION_GL: Map<string, string | undefined> = new Map(
  BUILTIN_TRANSITIONS.map((d) => [d.id, d.gl?.shader]),
);

/** Resolve a transition ref → its canonical GLSL source (or undefined → crossfade). */
export function transitionSourceFor(ref: TransitionRef): string | undefined {
  return getTransitionSource(ref.id, TRANSITION_GL.get(ref.id));
}

/** (Re)create the W×H capture RenderTextures, destroying any stale pair. */
function ensureTargets(PIXI: Pixi, scene: RetainedScene, W: number, H: number): TransitionGfx {
  const gfx = scene.transition;
  if (gfx && gfx.w === W && gfx.h === H) return gfx;
  gfx?.rtFrom.destroy(true);
  gfx?.rtTo.destroy(true);
  gfx?.filter?.destroy();
  const next: TransitionGfx = {
    rtFrom: PIXI.RenderTexture.create({ width: W, height: H }),
    rtTo: PIXI.RenderTexture.create({ width: W, height: H }),
    w: W,
    h: H,
  };
  scene.transition = next;
  return next;
}

/**
 * Render a gl-transition for this frame: capture `fromNode`/`toNode` to the two
 * RenderTextures, hide the raw clips, and wire `spriteNode` to the full-frame
 * blend. The caller is responsible for having reconciled both clip nodes (the
 * incoming one at full opacity) and for marking `spriteNode`'s key as seen.
 */
export function renderGlTransition(
  PIXI: Pixi,
  app: PIXINS.Application,
  scene: RetainedScene,
  fromNode: RetainedNode,
  toNode: RetainedNode,
  spriteNode: RetainedNode,
  source: string,
  params: ParamMap,
  progress: number,
  W: number,
  H: number,
  bake: boolean,
  /** Optional overlay-texture (light-leak/film-burn) for overlay transitions. */
  overlayTexture?: PIXINS.Texture,
  /** Camera-shake intensity (fraction of frame; 0 = none). */
  shake = 0,
): void {
  const gfx = ensureTargets(PIXI, scene, W, H);

  // Capture each clip's container subtree (its own effects bake in) to a target.
  fromNode.container.visible = true;
  toNode.container.visible = true;
  app.renderer.render({ container: fromNode.container, target: gfx.rtFrom, clear: true });
  app.renderer.render({ container: toNode.container, target: gfx.rtTo, clear: true });
  // The blended sprite stands in for both — hide the raw clips so they don't draw.
  fromNode.container.visible = false;
  toNode.container.visible = false;

  const ratio = W / H;
  const paramSig = params ? JSON.stringify(params) : '';
  const ov = overlayTexture ? '|ov' : '';
  const sk = shake ? `|s${shake}` : '';
  // In baked mode the literal `progress` is part of the fragment, so the filter is
  // rebuilt each frame; live mode rebuilds only when source/ratio/params change and
  // just updates the uniform per frame.
  const sig = bake
    ? `b|${ratio}|${paramSig}${ov}${sk}|${progress.toFixed(4)}|${source.length}`
    : `l|${ratio}|${paramSig}${ov}${sk}|${source.length}`;

  if (!gfx.filter || gfx.sig !== sig) {
    const { fragment, usesProgressUniform } = wrapTransitionFragment(source, {
      ratio,
      params,
      overlay: !!overlayTexture,
      shake,
      ...(bake ? { bakeProgress: progress } : {}),
    });
    const resources: Record<string, unknown> = { uTo: gfx.rtTo.source };
    if (overlayTexture) resources.uOverlay = overlayTexture.source;
    if (usesProgressUniform) resources.vixelUniforms = { progress: { value: progress, type: 'f32' } };
    gfx.filter?.destroy();
    gfx.filter = new PIXI.Filter({
      glProgram: PIXI.GlProgram.from({ vertex: VIXEL_FILTER_VERT, fragment, name: 'vixel-transition' }),
      resources,
    });
    gfx.sig = sig;
  } else if (!bake) {
    const u = (gfx.filter.resources as { vixelUniforms?: { uniforms: { progress: number } } }).vixelUniforms;
    if (u) u.uniforms.progress = progress;
  }

  // Full-frame sprite showing the FROM capture (= `uTexture` → getFromColor), with
  // the two-texture filter blending in the TO capture (`uTo` → getToColor).
  const sprite = spriteNode.content as PIXINS.Sprite;
  sprite.anchor.set(0);
  sprite.position.set(0, 0);
  sprite.texture = gfx.rtFrom;
  sprite.setSize(W, H);
  sprite.filters = [gfx.filter];
  spriteNode.container.visible = true;
  spriteNode.container.zIndex = 0.75; // above both clips (0 / 0.5), below overlays (≥1)
}
