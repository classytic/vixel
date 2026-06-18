/**
 * 3D LUT (`.cube`) → a Pixi filter for the editor preview — the browser side of
 * the engine's `lut3d`. A `lut`-kind pack effect ships a `.cube`; the engine reads
 * it directly (ffmpeg), and here we parse it + bake it into a LUT texture sampled
 * by a small filter so the SAME grade previews. Parsing is pure (unit-tested);
 * the texture/filter build is the browser-only part.
 */
import type * as PIXINS from 'pixi.js';
import type { VixelSpec } from '@classytic/vixel-schema';
import { VIXEL_FILTER_VERT, getEffect } from '@classytic/vixel-schema';
import { collectEffectIds } from './shader.js';

type Pixi = typeof import('pixi.js');

export interface ParsedLut {
  /** Grid resolution N (the LUT is N×N×N). */
  size: number;
  /** N³ RGB triples (0..1), red varying fastest (the `.cube` order). */
  data: Float32Array;
}

/** Parse an Adobe `.cube` 3D-LUT (pure). Ignores title/comment/domain lines. */
export function parseCubeLut(text: string): ParsedLut {
  let size = 0;
  const data: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^LUT_3D_SIZE\s+(\d+)/i.exec(line);
    if (m) {
      size = Number(m[1]);
      continue;
    }
    if (/^(TITLE|DOMAIN_MIN|DOMAIN_MAX|LUT_1D_SIZE)\b/i.test(line)) continue;
    const p = line.split(/\s+/).map(Number);
    if (p.length === 3 && p.every((n) => Number.isFinite(n))) data.push(p[0], p[1], p[2]);
  }
  return { size, data: new Float32Array(data) };
}

/**
 * Pack an N×N×N LUT into an (N·N)×N RGBA8 strip: column `b·N + r`, row `g` holds
 * `LUT[r,g,b]`. The fragment unwraps the same way. Pure (unit-testable).
 */
export function lutToStrip({ size, data }: ParsedLut): { width: number; height: number; pixels: Uint8Array } {
  const width = size * size;
  const height = size;
  const pixels = new Uint8Array(width * height * 4);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const src = (r + g * size + b * size * size) * 3;
        const dst = (b * size + r + g * width) * 4;
        pixels[dst] = Math.round(data[src] * 255);
        pixels[dst + 1] = Math.round(data[src + 1] * 255);
        pixels[dst + 2] = Math.round(data[src + 2] * 255);
        pixels[dst + 3] = 255;
      }
    }
  }
  return { width, height, pixels };
}

/**
 * Pixi v8 standard filter vertex (shared by LUT + shader filters). Re-exported
 * from the schema's single copy ({@link VIXEL_FILTER_VERT}) so preview + export +
 * engine never drift on the vertex contract.
 */
export const FILTER_VERT = VIXEL_FILTER_VERT;

// Nearest-tile LUT lookup from the (N·N)×N strip (good enough for a live preview;
// the ffmpeg export does full trilinear via lut3d). The grid size N is BAKED in as
// a GLSL constant rather than passed as a uniform: it's known at build time (one
// filter per `.cube`), and a single scalar uniform would otherwise need a uniform
// interface block — which fails to compile under WebGL contexts that report GLSL
// ES < 3.00 (e.g. headless SwiftShader), silently disabling the grade.
const lutFrag = (n: number) => `#version 300 es
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uLut;
void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  float n = ${n.toFixed(1)}, maxi = n - 1.0;
  float b = clamp(src.b, 0.0, 1.0) * maxi;
  float bi = floor(b + 0.5);
  vec2 uv = vec2((bi * n + clamp(src.r, 0.0, 1.0) * maxi + 0.5) / (n * n),
                 (clamp(src.g, 0.0, 1.0) * maxi + 0.5) / n);
  finalColor = vec4(texture(uLut, uv).rgb, src.a);
}`;

/** Build the Pixi LUT filter from a parsed `.cube`. Browser-only (needs a GL texture). */
export function buildLutFilter(PIXI: Pixi, parsed: ParsedLut): PIXINS.Filter {
  const { width, height, pixels } = lutToStrip(parsed);
  const source = new PIXI.BufferImageSource({ resource: pixels, width, height, scaleMode: 'nearest' });
  return new PIXI.Filter({
    glProgram: PIXI.GlProgram.from({ vertex: FILTER_VERT, fragment: lutFrag(parsed.size), name: 'vixel-lut' }),
    resources: { uLut: source },
  });
}

// `lut`-kind effect id → its built LUT filter, populated by {@link loadLuts} (the
// `.cube` is fetched + parsed async; the GL filter is reused across frames).
export const lutFilterCache = new Map<string, PIXINS.Filter>();

/**
 * Preload `.cube` LUTs for every `lut`-kind effect in the spec → built Pixi filters
 * — the preview side of the engine's `lut3d`. Call alongside `loadFonts`
 * before rendering. A missing/oversize LUT just leaves the preview ungraded (the
 * ffmpeg export still grades).
 */
export async function loadLuts(PIXI: Pixi, spec: VixelSpec): Promise<void> {
  await Promise.all(
    [...collectEffectIds(spec)].map(async (id) => {
      if (lutFilterCache.has(id)) return;
      const d = getEffect(id);
      if (d?.kind !== 'lut' || !d.source) return;
      try {
        const parsed = parseCubeLut(await (await fetch(d.source)).text());
        if (parsed.size > 1) lutFilterCache.set(id, buildLutFilter(PIXI, parsed));
      } catch {
        /* LUT unavailable — preview ungraded, export still grades via lut3d */
      }
    }),
  );
}
