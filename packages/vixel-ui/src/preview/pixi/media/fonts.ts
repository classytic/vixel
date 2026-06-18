/**
 * Custom font loading for the preview — the browser mirror of the engine's
 * `fontsdir` attachment, so `PIXI.Text` rasterizes in the same face libass uses
 * on export (preview ≈ export).
 */
import type { VixelSpec } from '@classytic/vixel-schema';

/**
 * Custom `(family, file)` pairs referenced by text overlays. A text style only
 * contributes when it pairs a `fontFile` with the `fontFamily` libass/Pixi resolves
 * it by.
 */
export function collectFontFaces(spec: VixelSpec): { family: string; file: string }[] {
  const out: { family: string; file: string }[] = [];
  const seen = new Set<string>();
  for (const track of spec.tracks) {
    if (track.type !== 'visual') continue;
    for (const clip of track.clips) {
      if (clip.media.kind !== 'text') continue;
      const st = clip.media.style;
      if (st?.fontFile && st.fontFamily) {
        const key = `${st.fontFamily}|${st.fontFile}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ family: st.fontFamily, file: st.fontFile });
        }
      }
    }
  }
  return out;
}

// Bumped each time a custom font is registered; folded into text/caption signatures
// so the retained scene re-rasterizes text first drawn in a fallback face.
let fontEpoch = 0;

/** Current font epoch — fold into a text raster signature so it invalidates on font load. */
export function getFontEpoch(): number {
  return fontEpoch;
}

/**
 * Load every custom `fontFile` into `document.fonts` so `PIXI.Text` rasterizes in
 * the right face — the preview side of the engine's `fontsdir` (preview ≈ export).
 * Bumps the font epoch per newly-added face so already-drawn text re-renders once
 * the font arrives. A failed/duplicate load is a no-op (Pixi falls back).
 */
export async function loadFonts(spec: VixelSpec): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') return;
  await Promise.all(
    collectFontFaces(spec).map(async ({ family, file }) => {
      try {
        if (document.fonts.check(`16px "${family}"`)) return; // already available
      } catch {
        /* check() throws on an odd family name — fall through and try to load */
      }
      try {
        const face = await new FontFace(family, `url(${JSON.stringify(file)})`).load();
        document.fonts.add(face);
        fontEpoch++;
      } catch {
        /* font unavailable — Pixi renders the fallback family, like the engine */
      }
    }),
  );
}
