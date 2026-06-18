/**
 * Media sourcing for the preview: resolve `SourceRef`s to URLs, enumerate the
 * media a spec references, preload textures / per-instance video elements, and
 * (for export) frame-accurately seek source videos.
 *
 * Unified visual-lane model: every drawable lives on a {@link VisualTrack} as a
 * {@link VisualClip} whose media kind (`clip.media.kind`) decides whether it's an
 * image/video texture. A clip is keyed `vis:<trackIndex>:<clipIndex>`; the clip
 * that crossfades INTO its successor on a sequential lane also draws on a separate
 * `vis:<ti>:<ci>:in` node, so its source needs its own element too.
 */
import type { VixelSpec, VisualClip } from '@classytic/vixel-schema';
import { getTransitionOverlay } from '@classytic/vixel-schema';
import { layoutLane, isVisualTrack } from '../../../shared/utils/spec.js';
import type { Pixi, MediaCache, MediaAsset } from '../types.js';
import { isAnimatedImageUrl, decodeAnimatedImage } from './animated-image.js';

/** Cache key for a transition's overlay texture (light-leak/film-burn footage). */
const overlayKey = (url: string) => `overlay:${url}`;

/** Every overlay-texture URL a spec's transitions reference (deduped). */
export function collectOverlayUrls(spec: VixelSpec): string[] {
  const urls = new Set<string>();
  for (const track of spec.tracks) {
    if (!isVisualTrack(track)) continue;
    for (const seq of track.transitions ?? []) {
      const u = getTransitionOverlay(seq.transition.id);
      if (u) urls.add(u);
    }
  }
  return [...urls];
}

/** The preloaded overlay texture for a transition's overlay URL (or undefined). */
export function overlayTextureFromCache(cache: MediaCache, url: string) {
  const a = cache.get(overlayKey(url));
  return a && a.kind === 'image' ? a.texture : undefined;
}

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

/**
 * Load an `<img>` robustly via `onload`/`onerror` — NOT the stricter `img.decode()`,
 * which REJECTS on some valid sources (notably `data:image/svg+xml` URIs), where the
 * caller's catch then cached it as `failed` and the clip rendered null. The WebGL
 * texture upload still happens on the next Pixi render, so dropping `decode()` only
 * loses an early pre-decode, not correctness. `crossOrigin` is set for remote URLs
 * (taint-free WebGL upload) but skipped for `data:`/blob URIs that don't need it.
 */
function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

/** The media URL a clip references (image/video clips only), or null. */
function clipUrl(clip: VisualClip): string | null {
  const m = clip.media;
  if (m.kind === 'image' || m.kind === 'video') return sourceUrl(m.source);
  return null;
}

/**
 * Every media URL a spec references (image/video clips on visual lanes), deduped.
 * The preview keys its asset-preload effect on this SET — so transform/opacity
 * edits (which leave the URLs unchanged) never trigger a needless preload pass.
 */
export function collectSourceUrls(spec: VixelSpec): string[] {
  const urls = new Set<string>();
  for (const track of spec.tracks) {
    if (!isVisualTrack(track)) continue;
    for (const c of track.clips) {
      const u = clipUrl(c);
      if (u) urls.add(u);
    }
  }
  return [...urls];
}

/**
 * Cache key for a media source. Images are shared by URL (static), but each VIDEO
 * INSTANCE gets its own key (`url#instanceKey`) → its own `<video>` element +
 * texture. A video element shows ONE frame at a time, so two clips of the same
 * source MUST NOT share one — otherwise they fight over `currentTime` and flash
 * each other's frames. `instanceKey` is the element's render key
 * (`vis:<track>:<clip>` / `vis:<track>:<clip>:in`).
 */
export function mediaCacheKey(url: string, instanceKey: string): string {
  return isVideoUrl(url) ? `${url}#${instanceKey}` : url;
}

/** Every media the renderer will draw, with its per-instance cache key. */
function collectMedia(spec: VixelSpec): { url: string; cacheKey: string; isVideo: boolean }[] {
  const out: { url: string; cacheKey: string; isVideo: boolean }[] = [];
  const seen = new Set<string>();
  const push = (url: string | null, instanceKey: string) => {
    if (!url) return;
    const cacheKey = mediaCacheKey(url, instanceKey);
    if (seen.has(cacheKey)) return;
    seen.add(cacheKey);
    out.push({ url, cacheKey, isVideo: isVideoUrl(url) });
  };
  spec.tracks.forEach((t, ti) => {
    if (!isVisualTrack(t)) return;
    const layout = layoutLane(t);
    t.clips.forEach((c, ci) => push(clipUrl(c), `vis:${ti}:${ci}`));
    // A clip that crossfades INTO the next is drawn simultaneously on a separate
    // `vis:<ti>:<ci>:in` node, so its (video) source needs its own element too.
    for (const l of layout) {
      if (l.transitionSec > 0 && l.transitionRef) {
        const next = t.clips[l.index + 1];
        if (next) push(clipUrl(next), `vis:${ti}:${l.index + 1}:in`);
      }
    }
  });
  return out;
}

/** The cache keys the renderer needs — the preview re-preloads when this set changes. */
export function collectMediaKeys(spec: VixelSpec): string[] {
  return collectMedia(spec).map((m) => m.cacheKey);
}

/** Preload every clip source into the cache (textures + per-instance video els). */
export async function preloadAssets(PIXI: Pixi, spec: VixelSpec, cache: MediaCache): Promise<void> {
  await Promise.all(
    collectMedia(spec).map(async ({ url, cacheKey, isVideo }) => {
      if (cache.has(cacheKey)) return;
      try {
        if (isVideo) {
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
          cache.set(cacheKey, { kind: 'video', el, texture });
        } else if (isAnimatedImageUrl(url)) {
          // Animated image (GIF / animated WebP / APNG) → decode every frame; the
          // reconciler shows the playhead-driven frame. Falls back to a static image if
          // decode is unavailable (no ImageDecoder / CORS) or it's really single-frame.
          const anim = await decodeAnimatedImage(url);
          if (anim) {
            const textures = anim.frames.map((bmp) => PIXI.Texture.from(bmp));
            cache.set(cacheKey, { kind: 'gif', textures, frameEndsMs: anim.frameEndsMs, totalMs: anim.totalMs, width: anim.width, height: anim.height });
          } else {
            cache.set(cacheKey, { kind: 'image', texture: PIXI.Texture.from(await loadImageEl(url)) });
          }
        } else {
          // Load via an <img> (not Assets.load) so extension-less URLs work and
          // we control CORS for WebGL upload.
          cache.set(cacheKey, { kind: 'image', texture: PIXI.Texture.from(await loadImageEl(url)) });
        }
      } catch {
        cache.set(cacheKey, { kind: 'failed' });
      }
    }),
  );
  // Transition overlay textures (light-leak/film-burn footage) — warmed as images
  // keyed by `overlay:<url>` so renderGlTransition can bind them synchronously
  // (incl. the frame-accurate offline export).
  await Promise.all(
    collectOverlayUrls(spec).map(async (url) => {
      const key = overlayKey(url);
      if (cache.has(key)) return;
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        await img.decode();
        cache.set(key, { kind: 'image', texture: PIXI.Texture.from(img) });
      } catch {
        cache.set(key, { kind: 'failed' });
      }
    }),
  );
}

/**
 * Release one cached asset's GPU + decoder resources. `texture.destroy(true)` also
 * frees the underlying TextureSource/canvas; for video we additionally tear down
 * the `<video>` element so the browser drops its media decoder (not just the GPU
 * texture). The MediaCache is the SOLE owner of these textures — nothing else
 * should destroy them (see app.ts `destroyApp`, which deliberately does NOT pass
 * `texture/textureSource`).
 */
function disposeAsset(asset: MediaAsset): void {
  if (asset.kind === 'image') {
    asset.texture.destroy(true);
  } else if (asset.kind === 'video') {
    asset.texture.destroy(true);
    const el = asset.el;
    el.pause();
    el.onloadeddata = null;
    el.onerror = null;
    el.removeAttribute('src');
    el.load(); // drops the browser media decoder
  } else if (asset.kind === 'gif') {
    for (const t of asset.textures) t.destroy(true);
  }
}

/** Destroy + clear EVERY cached asset (call on preview unmount, before app teardown). */
export function disposeMediaCache(cache: MediaCache): void {
  for (const asset of cache.values()) disposeAsset(asset);
  cache.clear();
}

/**
 * Evict cached assets the current spec no longer references (e.g. after swapping a
 * background / B-roll). Without this, every replaced source's textures stay
 * GPU-resident for the whole session. Keyset mirrors {@link collectMediaKeys}.
 */
export function evictUnused(cache: MediaCache, spec: VixelSpec): void {
  const live = new Set(collectMediaKeys(spec));
  for (const [key, asset] of cache) {
    if (!live.has(key)) {
      disposeAsset(asset);
      cache.delete(key);
    }
  }
}

/**
 * Frame-accurate seek for EXPORT — set every active source-video to its exact
 * source time at `timeSec` and AWAIT the `seeked` event (the live preview doesn't
 * wait, which is fine on screen but would capture stale frames in an export). Call
 * before `renderScene` per exported frame.
 */
export async function awaitVideoSeeks(spec: VixelSpec, timeSec: number, cache: MediaCache): Promise<void> {
  const seeks: Promise<void>[] = [];
  const seekTo = (url: string | null, instanceKey: string, srcTime: number) => {
    if (!url) return;
    const a = cache.get(mediaCacheKey(url, instanceKey));
    if (!a || a.kind !== 'video') return;
    const el = a.el;
    const max = Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.05) : srcTime;
    const want = Math.max(0, Math.min(srcTime, max));
    if (Math.abs(el.currentTime - want) < 1e-3) return; // already at the right frame
    seeks.push(
      new Promise<void>((res) => {
        const done = () => {
          el.removeEventListener('seeked', done);
          res();
        };
        el.addEventListener('seeked', done);
        el.currentTime = want;
        setTimeout(done, 250); // safety: never hang the export on a missed event
      }),
    );
  };
  spec.tracks.forEach((track, ti) => {
    if (!isVisualTrack(track)) return;
    track.clips.forEach((clip, ci) => {
      if (clip.media.kind !== 'video' || clip.hidden) return;
      if (!(timeSec >= clip.at && timeSec < clip.at + clip.duration)) return;
      const trimStart = clip.media.trimStart ?? 0;
      seekTo(sourceUrl(clip.media.source), `vis:${ti}:${ci}`, trimStart + (timeSec - clip.at));
    });
  });
  await Promise.all(seeks);
}
