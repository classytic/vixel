/**
 * PixiJS scene renderer — draws a {@link VixelSpec} at a given time to a Pixi
 * stage. This is the browser-side compositor for the editor preview: it renders
 * the ACTUAL composition (background · active clip with fit + ken-burns ·
 * text/image overlays with fade), so preview ≈ export.
 *
 * v1 scope (honest): images + video frames, cover/contain fit, ken-burns/zoom/
 * pan, overlay fade. NOT yet: clip-to-clip transitions, karaoke caption cues,
 * slide/pop overlay entrances, blend modes — these approximate to a hard cut /
 * plain opacity for now (parity with vixel's ffmpeg output comes incrementally).
 *
 * The Pixi runtime is passed in (dynamically imported by the caller) so the
 * package never hard-depends on `pixi.js`.
 */
import type * as PIXINS from 'pixi.js';
import type { VixelSpec, Clip, Overlay, Anchor } from '@classytic/vixel-schema';
import { layoutVideoTrack } from '../../shared/utils/spec.js';
import { clamp } from '../../shared/utils/time.js';

type Pixi = typeof import('pixi.js');

export type MediaAsset =
  | { kind: 'image'; texture: PIXINS.Texture }
  | { kind: 'video'; el: HTMLVideoElement; texture: PIXINS.Texture }
  | { kind: 'failed' };

export type MediaCache = Map<string, MediaAsset>;

/** Best-effort resolve a vixel `SourceRef` (string or object) to a URL. */
export function sourceUrl(source: unknown): string | null {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object') {
    const o = source as Record<string, unknown>;
    for (const k of ['url', 'src', 'path', 'href']) {
      if (typeof o[k] === 'string') return o[k] as string;
    }
  }
  return null;
}

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url);

/** Preload every clip/overlay source into the cache (textures + video els). */
export async function preloadAssets(PIXI: Pixi, spec: VixelSpec, cache: MediaCache): Promise<void> {
  const urls = new Set<string>();
  for (const track of spec.tracks) {
    if (track.type === 'video') {
      for (const c of track.clips) {
        const u = sourceUrl(c.source);
        if (u) urls.add(u);
      }
    } else if (track.type === 'overlay') {
      for (const it of track.items) {
        if (it.kind === 'image') {
          const u = sourceUrl(it.source);
          if (u) urls.add(u);
        }
      }
    }
  }

  await Promise.all(
    [...urls].map(async (url) => {
      if (cache.has(url)) return;
      try {
        if (isVideoUrl(url)) {
          const el = document.createElement('video');
          el.src = url;
          el.crossOrigin = 'anonymous';
          el.muted = true;
          el.playsInline = true;
          el.preload = 'auto';
          await new Promise<void>((res, rej) => {
            el.onloadeddata = () => res();
            el.onerror = () => rej(new Error(`video load failed: ${url}`));
          });
          const texture = PIXI.Texture.from(el);
          cache.set(url, { kind: 'video', el, texture });
        } else {
          // Load via an <img> (not Assets.load) so extension-less URLs work and
          // we control CORS for WebGL upload.
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          await img.decode();
          const texture = PIXI.Texture.from(img);
          cache.set(url, { kind: 'image', texture });
        }
      } catch {
        cache.set(url, { kind: 'failed' });
      }
    }),
  );
}

interface Fitted {
  w: number;
  h: number;
}

function fit(tw: number, th: number, W: number, H: number, mode: Clip['fit']): Fitted {
  if (mode === 'stretch') return { w: W, h: H };
  const scale = mode === 'contain' ? Math.min(W / tw, H / th) : Math.max(W / tw, H / th);
  return { w: tw * scale, h: th * scale };
}

interface KenBurns {
  scale: number;
  dx: number;
  dy: number;
}

function kenBurns(animation: Clip['animation'], p: number): KenBurns {
  if (!animation) return { scale: 1, dx: 0, dy: 0 };
  const amount = animation.amount ?? 0.12;
  const dir = animation.direction;
  let scale = 1;
  let dx = 0;
  let dy = 0;
  if (animation.preset === 'zoom' || animation.preset === 'kenBurns') {
    scale = dir === 'out' ? 1 + amount * (1 - p) : 1 + amount * p;
  }
  if (animation.preset === 'pan' || animation.preset === 'kenBurns') {
    const s = (p - 0.5) * amount;
    if (dir === 'left') dx = -s;
    else if (dir === 'right') dx = s;
    else if (dir === 'up') dy = -s;
    else if (dir === 'down') dy = s;
    else dx = s;
    if (animation.preset === 'kenBurns' && scale === 1) scale = 1 + amount * p;
  }
  return { scale, dx, dy };
}

const ANCHORS: Record<Anchor, { x: number; y: number }> = {
  top: { x: 0.5, y: 0.12 },
  'top-left': { x: 0.18, y: 0.12 },
  'top-right': { x: 0.82, y: 0.12 },
  center: { x: 0.5, y: 0.5 },
  'center-left': { x: 0.18, y: 0.5 },
  'center-right': { x: 0.82, y: 0.5 },
  bottom: { x: 0.5, y: 0.88 },
  'bottom-left': { x: 0.18, y: 0.88 },
  'bottom-right': { x: 0.82, y: 0.88 },
};

function posToCenter(position: Overlay['position'], W: number, H: number): { x: number; y: number } {
  if (!position) return { x: W / 2, y: H / 2 };
  if (typeof position === 'object') return { x: position.x * W, y: position.y * H };
  const a = ANCHORS[position] ?? ANCHORS.center;
  return { x: a.x * W, y: a.y * H };
}

function overlayAlpha(item: Overlay, localT: number, dur: number): number {
  let alpha = item.opacity ?? 1;
  if (item.in === 'fadeIn') alpha *= clamp(localT / 0.3, 0, 1);
  if (item.out === 'fadeOut') alpha *= clamp((dur - localT) / 0.3, 0, 1);
  return alpha;
}

function drawClip(
  PIXI: Pixi,
  stage: PIXINS.Container,
  clip: Clip,
  W: number,
  H: number,
  localT: number,
  dur: number,
  cache: MediaCache,
): void {
  const url = sourceUrl(clip.source);
  if (!url) return;
  const asset = cache.get(url);
  if (!asset || asset.kind === 'failed') return;

  let texture: PIXINS.Texture;
  if (asset.kind === 'image') {
    texture = asset.texture;
  } else {
    const el = asset.el;
    if (el.readyState >= 2) {
      const want = (clip.in ?? 0) + localT;
      el.currentTime = Number.isFinite(el.duration)
        ? Math.min(want, Math.max(0, el.duration - 0.05))
        : want;
      asset.texture.source.update();
    }
    texture = asset.texture;
  }

  if (!texture) return;
  const tw = texture.width || W;
  const th = texture.height || H;
  const p = dur > 0 ? clamp(localT / dur, 0, 1) : 0;
  const kb = kenBurns(clip.animation, p);
  const base = fit(tw, th, W, H, clip.fit ?? 'cover');

  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = base.w * kb.scale;
  sprite.height = base.h * kb.scale;
  sprite.x = W / 2 + kb.dx * W;
  sprite.y = H / 2 + kb.dy * H;
  stage.addChild(sprite);
}

function drawOverlay(
  PIXI: Pixi,
  stage: PIXINS.Container,
  item: Overlay,
  W: number,
  H: number,
  localT: number,
  dur: number,
  cache: MediaCache,
): void {
  const center = posToCenter(item.position, W, H);
  const scale = item.scale ?? 1;
  const alpha = overlayAlpha(item, localT, dur);

  if (item.kind === 'text') {
    const style = (item.style ?? {}) as Record<string, unknown>;
    const text = new PIXI.Text({
      text: item.text,
      style: {
        fill: typeof style.color === 'string' ? style.color : '#ffffff',
        fontSize: typeof style.fontSize === 'number' ? style.fontSize : Math.round(W * 0.05),
        fontFamily: typeof style.font === 'string' ? style.font : 'sans-serif',
        fontWeight: 'bold',
        align: 'center',
      },
    });
    text.anchor.set(0.5);
    text.x = center.x;
    text.y = center.y;
    text.alpha = alpha;
    text.scale.set(scale);
    stage.addChild(text);
    return;
  }

  const url = sourceUrl(item.source);
  const asset = url ? cache.get(url) : undefined;
  if (!asset || asset.kind === 'failed') return;
  const texture = asset.kind === 'image' ? asset.texture : (asset.texture.source.update(), asset.texture);
  if (!texture) return;

  const wFrac = item.width ?? 0.25;
  const w = wFrac * W;
  const aspect = (texture.height || 1) / (texture.width || 1);
  const h = item.height != null ? item.height * H : w * aspect;

  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.width = w * scale;
  sprite.height = h * scale;
  sprite.x = center.x;
  sprite.y = center.y;
  sprite.alpha = alpha;
  stage.addChild(sprite);
}

/** Render the whole spec at `timeSec` onto the app's stage, then present. */
export function renderScene(
  PIXI: Pixi,
  app: PIXINS.Application,
  spec: VixelSpec,
  timeSec: number,
  cache: MediaCache,
): void {
  const W = spec.output.width;
  const H = spec.output.height;
  const stage = app.stage;

  for (const child of stage.removeChildren()) child.destroy({ children: true });

  const bg = new PIXI.Graphics();
  bg.rect(0, 0, W, H).fill(spec.output.background ?? '#000000');
  stage.addChild(bg);

  for (const track of spec.tracks) {
    if (track.type !== 'video') continue;
    const layout = layoutVideoTrack(track);
    const active =
      layout.find((l) => timeSec >= l.startSec && timeSec < l.endSec) ??
      (layout.length && timeSec >= layout[layout.length - 1]!.endSec
        ? layout[layout.length - 1]
        : undefined);
    if (active) {
      drawClip(PIXI, stage, active.clip, W, H, timeSec - active.startSec, active.durationSec, cache);
    }
  }

  for (const track of spec.tracks) {
    if (track.type !== 'overlay') continue;
    for (const it of track.items) {
      if (timeSec >= it.at && timeSec < it.at + it.duration) {
        drawOverlay(PIXI, stage, it, W, H, timeSec - it.at, it.duration, cache);
      }
    }
  }

  app.render();
}
