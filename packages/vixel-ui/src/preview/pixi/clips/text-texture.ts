/**
 * Fill-texture loader — async textures for {@link TextureFill} (the distress-grunge
 * look). A text style is built synchronously, but a texture URL loads async, so:
 *   - `getFillTexture` returns the cached Texture or null (→ caller falls back to a
 *     solid), and kicks off the load on first miss.
 *   - on load it bumps `textureEpoch` and calls `requestRender`, so the next frame's
 *     style signature changes and the style rebuilds WITH the pattern (same trick as
 *     the font-epoch). Failures cache as null (one attempt, no retry storm).
 */
import type * as PIXINS from 'pixi.js';
import type { Pixi } from '../types.js';

const cache = new Map<string, PIXINS.Texture | null>(); // null = loaded-but-failed
const pending = new Set<string>();
let epoch = 0;

/** Bumps whenever a fill texture finishes loading — fold into text signatures so a
 *  late-arriving texture triggers a style rebuild. */
export function getTextureEpoch(): number {
  return epoch;
}

/**
 * The loaded Texture for `url`, or null while loading / on failure. Triggers the
 * load on first request; `requestRender` redraws once it resolves.
 */
export function getFillTexture(PIXI: Pixi, url: string, requestRender?: () => void): PIXINS.Texture | null {
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  if (!pending.has(url)) {
    pending.add(url);
    PIXI.Assets.load(url)
      .then((tex: PIXINS.Texture) => {
        cache.set(url, tex);
        pending.delete(url);
        epoch++;
        requestRender?.();
      })
      .catch(() => {
        cache.set(url, null); // give up after one try
        pending.delete(url);
      });
  }
  return null;
}
