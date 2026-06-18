/**
 * Schema blend mode → Pixi v8 blend mode mapping.
 */
import type * as PIXINS from 'pixi.js';

/**
 * Map a schema blend mode to a Pixi v8 blend mode (null = normal). The browser
 * mirror of the engine's `ffmpegBlendMode` — so a `screen` light-leak VFX clip
 * previews the same way it exports. `overlay`/`soft-light` are advanced modes
 * (need `pixi.js/advanced-blend-modes`); Pixi falls back to normal if absent.
 */
export function pixiBlendMode(blend: string | undefined): PIXINS.BLEND_MODES | null {
  switch (blend) {
    case 'screen': return 'screen';
    case 'add': return 'add';
    case 'multiply': return 'multiply';
    case 'overlay': return 'overlay';
    case 'soft-light': return 'soft-light';
    default: return null;
  }
}
