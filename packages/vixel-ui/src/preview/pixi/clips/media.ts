/**
 * Image / video clip reconciler — fit a texture into the clip box, clip to it,
 * apply ken-burns (unframed), enter/exit motion, BoxStyle, blend, and effects.
 */
import type * as PIXINS from 'pixi.js';
import type { VisualClip, Fit } from '@classytic/vixel-schema';
import { sampleClipMotion, resolveTransformAt } from '@classytic/vixel-schema';
import { clamp } from '../../../shared/utils/time.js';
import type { Pixi, MediaCache, ElementLayout, RetainedScene } from '../types.js';
import { fitScale, gifFrameIndexAt } from '../calc.js';
import { ensureNode, boxOf, setSpriteMask, applyNodeRotation, applyClipMask, kenBurns, setZ } from '../node.js';
import { sourceUrl, mediaCacheKey } from '../media/cache.js';
import { updateFilters } from '../filters/registry.js';
import { pixiBlendMode } from '../filters/blend.js';
import { applyBoxStyle } from '../graphics/boxstyle.js';
import { reconcilePlaceholder } from './shape.js';

/**
 * Reconcile an image / video clip — fit its texture into the clip box, clip to it,
 * apply ken-burns (unframed), enter/exit motion, BoxStyle, blend, and effects.
 * Returns the rendered box (normalized) for the transform gizmo.
 */
export function reconcileMediaClip(
  PIXI: Pixi,
  scene: RetainedScene,
  stage: PIXINS.Container,
  key: string,
  z: number,
  clip: VisualClip,
  W: number,
  H: number,
  localT: number,
  dur: number,
  cache: MediaCache,
  alphaMul: number,
): ElementLayout | null {
  const media = clip.media;
  if (media.kind !== 'image' && media.kind !== 'video') return null;
  const url = sourceUrl(media.source);
  if (!url) return reconcilePlaceholder(PIXI, scene, stage, key, z, clip, W, H, alphaMul);

  const asset = cache.get(mediaCacheKey(url, key));
  if (!asset || asset.kind === 'failed') return null;

  let texture: PIXINS.Texture;
  if (asset.kind === 'image') {
    texture = asset.texture;
  } else if (asset.kind === 'gif') {
    // Playhead-driven GIF: show the frame whose window contains localT (loops).
    const idx = gifFrameIndexAt(asset.frameEndsMs, localT * 1000);
    texture = asset.textures[idx] ?? asset.textures[0]!;
  } else {
    const el = asset.el;
    if (el.readyState >= 2) {
      const trimStart = media.kind === 'video' ? media.trimStart ?? 0 : 0;
      const loop = media.kind === 'video' && media.loop === true;
      let want: number;
      if (Number.isFinite(el.duration)) {
        const srcEnd = Math.max(0, el.duration - 0.05);
        if (loop) {
          // Wrap clip-local time around the trimmed source so it repeats to fill `duration`.
          const loopLen = srcEnd - trimStart;
          want = loopLen > 0 ? trimStart + (((localT % loopLen) + loopLen) % loopLen) : trimStart;
        } else {
          want = Math.min(trimStart + localT, srcEnd); // freeze last frame past source end
        }
      } else {
        want = trimStart + localT;
      }
      // Only re-seek + re-upload the GPU texture when the target frame actually
      // changed — a paused re-render (another clip edited) must not re-upload the
      // same video frame every coalesced draw.
      if (asset.lastTime === undefined || Math.abs(want - asset.lastTime) > 1e-3) {
        el.currentTime = want;
        asset.lastTime = want;
        asset.texture.source.update(); // immediate (may still be the pre-seek frame)
        // `currentTime =` is async: the new frame isn't decoded yet, so the upload
        // above can be blank. When PLAYING the next frame re-uploads anyway, but a
        // PAUSED preview renders once and would keep that blank frame (the "video
        // stays white" bug). So re-upload + redraw once the seek lands. One pending
        // listener at a time; a newer seek is picked up by the same handler.
        if (!asset.seekPending) {
          asset.seekPending = true;
          const onSeeked = () => {
            el.removeEventListener('seeked', onSeeked);
            asset.seekPending = false;
            asset.texture.source.update();
            scene.requestRender?.();
          };
          el.addEventListener('seeked', onSeeked);
        }
      }
    }
    texture = asset.texture;
  }
  if (!texture) return null;

  const node = ensureNode(PIXI, scene, stage, key, 'sprite');
  setZ(node, z);
  const sprite = node.content as PIXINS.Sprite;
  if (sprite.texture !== texture) sprite.texture = texture;
  // Size from the SOURCE's intrinsic dimensions — for video, the element's
  // `videoWidth/Height` (reliable once `loadeddata` fired, which preloadAssets
  // awaits), since `texture.width` can briefly read 0 before the first
  // `source.update()` propagates. If dims aren't known yet, HIDE the sprite
  // instead of guessing canvas dims — that guess is what made a clip paint at the
  // wrong fit and then "pop" to the right size once the real dimensions arrived.
  const tw = asset.kind === 'video' ? asset.el.videoWidth : texture.width;
  const th = asset.kind === 'video' ? asset.el.videoHeight : texture.height;
  if (!tw || !th) {
    node.container.visible = false;
    return null;
  }
  node.container.visible = true;

  // Resolve animated channels (x/y/w/h/rotation/opacity) at the clip-local time —
  // one shared sampler with the export + ffmpeg engine. No keyframes ⇒ same object.
  const transform = resolveTransformAt(clip.transform, localT);
  const frame = transform?.frame;
  const { bx, by, bw, bh } = boxOf(transform, W, H);
  const cxp = bx + bw / 2;
  const cyp = by + bh / 2;
  // Default to COVER (fill the box/canvas) — the expected look for a full-frame
  // background and a framed PiP alike; an explicit `fit` overrides. (Matches the
  // engine's default so preview ≈ export.)
  const fmode: Fit = transform?.fit ?? 'cover';

  // Ken-burns / zoom-pan only animates an UNFRAMED clip (matches the engine).
  let kbScale = 1;
  let kbdx = 0;
  let kbdy = 0;
  if (!frame) {
    const p = dur > 0 ? clamp(localT / dur, 0, 1) : 0;
    const kb = kenBurns(clip.animation, p);
    kbScale = kb.scale;
    kbdx = kb.dx;
    kbdy = kb.dy;
  }

  // Whole-element motion (enter/exit + continuous loop) — the SAME fold every clip
  // kind uses, so a `clip.loop` (pulse/float/wiggle) now animates images/video/shapes
  // too, not just text. Ken Burns (above) composes ON TOP (both scales multiply).
  const m = sampleClipMotion(clip, localT, dur);
  const ex = m.dx * W;
  const ey = m.dy * H;

  const baseScale = fitScale(fmode, bw, bh, tw, th);
  if (baseScale == null) {
    // stretch (or unknown dims, already guarded above) → size to the box directly.
    sprite.width = bw * kbScale * m.scale;
    sprite.height = bh * kbScale * m.scale;
  } else {
    const s = baseScale * kbScale * m.scale;
    sprite.width = tw * s;
    sprite.height = th * s;
  }
  sprite.x = cxp + kbdx * W + ex;
  sprite.y = cyp + kbdy * H + ey;
  sprite.rotation = 0;
  // Cover-fit clips to the box with a rect mask — UNLESS a BoxStyle radius applies,
  // in which case applyBoxStyle owns a ROUNDED clip mask (which also clips the cover
  // overflow). They must not both drive `content.mask`: applyBoxStyle only rebuilds
  // on a style/geometry change, so a rect mask re-created here every frame would
  // steal the mask back and leave the rounded styleMask orphaned + VISIBLE (the
  // "video shows as a solid white box" bug). One owner per mask.
  const roundedMask = !!transform?.style?.radius;
  setSpriteMask(PIXI, node, fmode === 'cover' && !roundedMask ? { x: bx, y: by, w: bw, h: bh } : null);
  // Effects FIRST (so the shadow filter, if any, can prepend), then BoxStyle.
  updateFilters(PIXI, node, clip.effects);
  applyBoxStyle(PIXI, node, transform?.style, { bx, by, bw, bh });
  // Base rotation (deg) + loop rotation (rad→deg, e.g. wiggle); gizmo uses base only.
  applyNodeRotation(node, cxp, cyp, (transform?.rotation ?? 0) + (m.rotation * 180) / Math.PI);
  // User clip mask (rect/ellipse/path) — masks the container, after rotation.
  applyClipMask(PIXI, node, clip.mask, localT, W, H);
  sprite.alpha = (transform?.opacity ?? 1) * m.opacity * alphaMul;
  const bm = pixiBlendMode(media.blend);
  if (bm) sprite.blendMode = bm;

  return { x: bx / W, y: by / H, w: bw / W, h: bh / H, rotation: transform?.rotation ?? 0 };
}
