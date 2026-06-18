/**
 * Animated-image decoding — GIF, animated WebP, and APNG. Uses the browser's WebCodecs
 * `ImageDecoder` (Chromium, where the WebGL preview runs) to pull every frame + its
 * duration. Decoding is up-front (these are small stickers/loops, not long footage);
 * playback is PLAYHEAD-DRIVEN by the reconciler (see `gifFrameIndexAt` in calc.ts),
 * NEVER a wall-clock animation — so scrubbing and frame-accurate export pick the same
 * frame deterministically. (A ticker-driven `GifSprite` would freeze on export, which
 * is exactly why we decode to a frame table instead.)
 *
 * Why not just `.gif`: short-form sticker sources (Giphy/Tenor/etc.) are very often
 * animated WebP or APNG, not GIF. Routing on the `.gif` extension alone silently froze
 * those to their first frame. Here the format is detected from the response
 * `Content-Type`, then the URL extension, then the file's magic bytes — robust to
 * mislabeled or extension-less URLs.
 *
 * No Pixi dependency: returns `ImageBitmap`s + cumulative frame-end times. The caller
 * turns bitmaps into textures (so this module is unit-friendly + reusable). Returns
 * `null` whenever animated decode isn't possible (no `ImageDecoder`, CORS-blocked
 * fetch, truly single-frame, or over the memory budget) → caller falls back to a
 * static first-frame image (honest degrade, never a crash).
 */

const ANIMATED_EXT = /\.(gif|webp|apng|png)(\?|#|$)/i;

/** Could this URL be an animated image? (Extension hint; content-type/sniff confirm.) */
export function isAnimatedImageUrl(url: string): boolean {
  return ANIMATED_EXT.test(url);
}

export interface DecodedAnimation {
  /** One bitmap per frame, in order. */
  frames: ImageBitmap[];
  /** Cumulative END time (ms) of each frame; last entry = total loop duration. */
  frameEndsMs: number[];
  totalMs: number;
  width: number;
  height: number;
}

interface ImageDecoderResult { image: VideoFrame }
interface ImageTrack { frameCount: number; animated: boolean }
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack?: ImageTrack };
  decode(opts: { frameIndex: number }): Promise<ImageDecoderResult>;
  close(): void;
}
type ImageDecoderCtor = new (init: { data: ArrayBuffer | Uint8Array; type: string }) => ImageDecoderLike;

/** Default per-frame duration when a frame reports 0/none (browsers clamp ~100ms). */
const DEFAULT_FRAME_MS = 100;
/** Memory budget: total decoded pixels across all frames. ~64M px ≈ 256MB RGBA. Past
 *  this we downscale every frame to fit (keeps the animation; bounds VRAM). */
const MAX_TOTAL_PIXELS = 64_000_000;
/** Hard frame cap — a pathological multi-thousand-frame source bails to static. */
const MAX_FRAMES = 600;

/** Sniff an image MIME from the first bytes — the authoritative signal when a server
 *  mislabels Content-Type (common on CDNs). Covers GIF, WebP (RIFF…WEBP), and PNG/APNG. */
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'; // "GIF"
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'; // "RIFF"…"WEBP"
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'; // PNG/APNG
  return null;
}

function extMime(url: string): string | null {
  const m = ANIMATED_EXT.exec(url);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';
}

/**
 * Decode every frame of an animated image (GIF / animated WebP / APNG). Returns `null`
 * if `ImageDecoder` is unavailable, the fetch/decode fails (incl. CORS), the type isn't
 * a supported animated format, the image isn't actually animated (1 frame → treat as a
 * normal static image upstream), or it exceeds the frame cap.
 */
export async function decodeAnimatedImage(url: string): Promise<DecodedAnimation | null> {
  const Ctor = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  if (typeof Ctor !== 'function' || typeof createImageBitmap !== 'function') return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const data = new Uint8Array(await res.arrayBuffer());

    // Type resolution: magic bytes (most trustworthy) → response header → extension.
    const headerType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const type = sniffMime(data)
      ?? (headerType && headerType.startsWith('image/') && headerType !== 'image/jpeg' ? headerType : null)
      ?? extMime(url);
    if (!type) return null;

    const decoder = new Ctor({ data, type });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const frameCount = track?.frameCount ?? 0;
    if (!track || !track.animated || frameCount < 2 || frameCount > MAX_FRAMES) {
      decoder.close();
      return null; // single-frame (or pathological) → let the static image path handle it
    }

    // Probe frame 0 for native size, then derive a downscale ratio that keeps the whole
    // animation under the pixel budget (small stickers → ratio 1, no-op).
    const probe = await decoder.decode({ frameIndex: 0 });
    const natW = probe.image.displayWidth;
    const natH = probe.image.displayHeight;
    const budgetRatio = Math.sqrt(MAX_TOTAL_PIXELS / (natW * natH * frameCount));
    const ratio = Math.min(1, budgetRatio);
    const targetW = Math.max(1, Math.round(natW * ratio));
    const targetH = Math.max(1, Math.round(natH * ratio));
    const resize = ratio < 1 ? { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'high' as const } : undefined;

    const frames: ImageBitmap[] = [];
    const frameEndsMs: number[] = [];
    let cursor = 0;
    for (let i = 0; i < frameCount; i++) {
      const { image } = i === 0 ? probe : await decoder.decode({ frameIndex: i });
      // `duration` is microseconds (or null for the last/holdout frame).
      const durMs = image.duration != null ? image.duration / 1000 : DEFAULT_FRAME_MS;
      cursor += durMs > 0 ? durMs : DEFAULT_FRAME_MS;
      frameEndsMs.push(cursor);
      const bitmap = await createImageBitmap(image, resize ?? {});
      image.close();
      frames.push(bitmap);
    }
    decoder.close();
    return { frames, frameEndsMs, totalMs: cursor, width: targetW, height: targetH };
  } catch {
    return null;
  }
}
