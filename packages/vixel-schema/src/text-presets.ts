/**
 * Text-style presets — a registry of ready-made looks (the CapCut "Presets" grid).
 * ============================================================================
 * Like {@link BUILTIN_EFFECTS}/{@link BUILTIN_TRANSITIONS}, these are DATA an agent
 * picks and an editor browses. Unlike effects/transitions there is no engine
 * resolver: a preset is just a {@link TextStyle} the editor/agent INLINES onto the
 * overlay (no `presetId` is persisted), so specs stay self-contained and render
 * without the registry. Developers extend via {@link registerTextPreset} (BYO).
 */
import type { TextStyle } from './captions.js';
import type { TextMotion } from './text-motion.js';

export interface TextStylePreset {
  id: string;
  name: string;
  /** Coarse grouping for the text-preset BROWSER (e.g. 'Clean' | 'Bold' | 'Glow' |
   *  'Caption') — presentation metadata, mirroring effects/transitions. */
  category?: string;
  /** The style merged onto the text overlay when applied. May use the LAYERED design
   *  fields (`fills`/`strokes`/`shadows`/`paintOrder`) for rich looks, or flat fields. */
  style: TextStyle;
  /** Optional bundled kinetic animation — a preset can be a "template" (look + motion),
   *  applied alongside the style. Distinct from the per-clip `enter/exit`/caption anim. */
  motion?: TextMotion;
  /** BYO preview override — a consumer-supplied SVG markup STRING or an image URL the
   *  gallery shows instead of the auto-derived {@link textDesignToSvg}. For looks whose
   *  fidelity exceeds the layer model (heavy textures, hand-tuned art). Render-agnostic:
   *  ignored by the engines, used only for the catalog thumbnail. */
  thumbnail?: string;
}

/** Built-in looks — research-backed social-caption + title styles. */
export const BUILTIN_TEXT_PRESETS: TextStylePreset[] = [
  {
    id: 'tiktok-bold',
    name: 'TikTok Bold',
    category: 'Bold',
    style: { fontFamily: 'Montserrat', fontSize: 120, bold: true, fillColor: '#FFFFFF', highlightColor: '#FFD400', stroke: { width: 8, color: '#000000' }, align: 'center', animation: 'pop' },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    category: 'Clean',
    style: { fontFamily: 'Inter', fontSize: 72, fillColor: '#FFFFFF', stroke: { width: 2, color: '#000000' }, align: 'center', animation: 'fade' },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    category: 'Caption',
    style: { fontFamily: 'Poppins', fontSize: 96, bold: true, fillColor: '#FFFFFF', highlightColor: '#22D3EE', stroke: { width: 5, color: '#101010' }, shadow: { depth: 2, color: '#000000' }, align: 'center', animation: 'karaoke' },
  },
  {
    id: 'word-focus',
    name: 'Word Focus',
    category: 'Caption',
    style: { fontFamily: 'Montserrat', fontSize: 150, bold: true, fillColor: '#FFFFFF', stroke: { width: 10, color: '#000000' }, align: 'center', animation: 'word-by-word' },
  },
  {
    id: 'boxed',
    name: 'Boxed',
    category: 'Bold',
    style: { fontFamily: 'Inter', fontSize: 84, bold: true, fillColor: '#0B0B12', box: { color: '#FFFFFF' }, align: 'center', animation: 'highlight-box' },
  },
  {
    id: 'neon',
    name: 'Neon',
    category: 'Glow',
    style: { fontFamily: 'Poppins', fontSize: 110, bold: true, fillColor: '#FFFFFF', glow: { color: '#39FF14', sigma: 8, intensity: 1.4 }, stroke: { width: 2, color: '#0a3d0a' }, align: 'center' },
  },
  {
    id: 'glow-pop',
    name: 'Glow Pop',
    category: 'Glow',
    style: { fontFamily: 'Montserrat', fontSize: 120, bold: true, fillColor: '#FFFFFF', glow: { color: '#FF2D9B', sigma: 10, intensity: 1.6 }, align: 'center', animation: 'pop' },
  },
  // ── Layered design (SVG-like stack) — the "smarter than CapCut" looks: gradients,
  //    3D offset, multi-stroke. Bundle a kinetic `motion` so the preset is a template. ──
  {
    id: 'pop-3d',
    name: '3D Pop',
    category: 'Bold',
    style: {
      fontFamily: 'Montserrat',
      fontSize: 140,
      bold: true,
      align: 'center',
      // Back fill offset down-right = a chunky extrude under the white face.
      fills: [
        { fill: { type: 'solid', color: '#1F2937' }, dx: 0.06, dy: 0.06 },
        { fill: { type: 'solid', color: '#FFFFFF' } },
      ],
      strokes: [{ color: '#1F2937', width: 6 }],
    },
    motion: { by: 'word', enter: 'popIn', stagger: 0.07 },
  },
  {
    id: 'gold-luxe',
    name: 'Gold Luxe',
    category: 'Elegant',
    style: {
      fontFamily: 'Playfair Display',
      fontSize: 130,
      bold: true,
      align: 'center',
      fills: [{ fill: { type: 'linear', angle: 90, stops: [
        { offset: 0, color: '#FFF3B0' },
        { offset: 0.5, color: '#E6B422' },
        { offset: 1, color: '#A6791F' },
      ] } }],
      strokes: [{ color: '#5A3D0A', width: 4 }],
      shadows: [{ color: '#00000055', dx: 0, dy: 4, blur: 3 }],
    },
    motion: { by: 'word', enter: 'slideUp', stagger: 0.06 },
  },
  {
    id: 'neon-bloom',
    name: 'Neon Bloom',
    category: 'Glow',
    style: {
      fontFamily: 'Poppins',
      fontSize: 120,
      bold: true,
      align: 'center',
      fills: [{ fill: { type: 'solid', color: '#E7FBFF' } }],
      strokes: [{ color: '#16F0FF', width: 3 }],
      // Two halos = a believable neon bloom (single `glow` can't stack).
      shadows: [
        { color: '#16F0FF', dx: 0, dy: 0, blur: 18, opacity: 0.9 },
        { color: '#0AA6FF', dx: 0, dy: 0, blur: 36, opacity: 0.6 },
      ],
    },
    motion: { by: 'char', enter: 'fadeIn', stagger: 0.03 },
  },
];

const REGISTRY = new Map<string, TextStylePreset>(BUILTIN_TEXT_PRESETS.map((p) => [p.id, p]));

/** Register a BYO text-style preset (or override a built-in by id). */
export function registerTextPreset(preset: TextStylePreset): void {
  REGISTRY.set(preset.id, preset);
}

/** Look up a text-style preset by id. */
export function getTextPreset(id: string): TextStylePreset | undefined {
  return REGISTRY.get(id);
}

/** All registered text-style presets (built-in + BYO). */
export function listTextPresets(): TextStylePreset[] {
  return [...REGISTRY.values()];
}
