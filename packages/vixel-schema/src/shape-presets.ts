/**
 * Shape-style presets — ready-made looks an agent picks and an editor browses
 * (the "Glass / Card / Chip" grid). Like {@link BUILTIN_TEXT_PRESETS}, a preset is
 * DATA that gets INLINED onto the overlay ({@link inlineShapePreset}) — no preset
 * id persists, so specs stay self-contained and render without the registry.
 * Explicit fields on the overlay always win over the preset. BYO via
 * {@link registerShapePreset}.
 */
import type { ShapeKind, ShapeStyle } from './shape.js';
import type { ShapeMedia } from './visual.js';

export interface ShapeStylePreset {
  id: string;
  name: string;
  /** Default primitive for this look (e.g. `glass` → roundedRect). */
  shape?: ShapeKind;
  /** The look merged onto the shape when applied. */
  style: ShapeStyle;
}

/** Built-in looks — the modern "glassmorphism / soft-card" UI vocabulary. */
export const BUILTIN_SHAPE_PRESETS: ShapeStylePreset[] = [
  {
    id: 'glass',
    name: 'Glass',
    shape: 'roundedRect',
    style: {
      fill: { color: '#FFFFFF', opacity: 0.08 },
      stroke: { color: '#FFFFFF', width: 1, opacity: 0.18 },
      cornerRadius: 24,
      backdrop: { blur: 24 },
      shadow: { color: '#000000', blur: 40, y: 8, opacity: 0.25 },
    },
  },
  {
    id: 'glass-dark',
    name: 'Glass Dark',
    shape: 'roundedRect',
    style: {
      fill: { color: '#0B0B12', opacity: 0.38 },
      stroke: { color: '#FFFFFF', width: 1, opacity: 0.10 },
      cornerRadius: 24,
      backdrop: { blur: 28 },
    },
  },
  {
    id: 'card',
    name: 'Card',
    shape: 'roundedRect',
    style: {
      fill: { color: '#FFFFFF', opacity: 1 },
      cornerRadius: 20,
      shadow: { color: '#000000', blur: 32, y: 6, opacity: 0.18 },
    },
  },
  {
    id: 'panel-dark',
    name: 'Panel Dark',
    shape: 'roundedRect',
    style: { fill: { color: '#11141B', opacity: 1 }, cornerRadius: 16 },
  },
  {
    id: 'chip',
    name: 'Chip',
    shape: 'roundedRect',
    style: { fill: { color: '#FFFFFF', opacity: 0.14 }, cornerRadius: 999 },
  },
  {
    id: 'outline',
    name: 'Outline',
    shape: 'roundedRect',
    style: { fill: { color: '#000000', opacity: 0 }, stroke: { color: '#FFFFFF', width: 2 }, cornerRadius: 16 },
  },
  {
    id: 'solid',
    name: 'Solid',
    shape: 'rect',
    style: { fill: { color: '#FF2D9B', opacity: 1 } },
  },
  {
    id: 'divider',
    name: 'Divider',
    shape: 'line',
    style: { stroke: { color: '#FFFFFF', width: 2, opacity: 0.3 } },
  },
];

const REGISTRY = new Map<string, ShapeStylePreset>(BUILTIN_SHAPE_PRESETS.map((p) => [p.id, p]));

/** Register a BYO shape-style preset (or override a built-in by id). */
export function registerShapePreset(preset: ShapeStylePreset): void {
  REGISTRY.set(preset.id, preset);
}

/** Look up a shape-style preset by id. */
export function getShapePreset(id: string): ShapeStylePreset | undefined {
  return REGISTRY.get(id);
}

/** All registered shape-style presets (built-in + BYO). */
export function listShapePresets(): ShapeStylePreset[] {
  return [...REGISTRY.values()];
}

/**
 * Inline a shape clip's `style` preset — explicit fields WIN, the preset fills the
 * gaps, the `style` id is dropped (spec stays self-contained). Idempotent: a shape
 * with no/unknown `style` is returned unchanged (explicit fields intact).
 */
export function inlineShapePreset(m: ShapeMedia): ShapeMedia {
  if (!m.style) return m;
  const preset = REGISTRY.get(m.style);
  if (!preset) {
    // Unknown id: drop it but keep explicit fields; nothing to merge.
    const { style: _drop, ...rest } = m;
    return rest;
  }
  const { style: _drop, ...rest } = m;
  return {
    ...rest,
    shape: m.shape ?? preset.shape ?? 'roundedRect',
    fill: m.fill ?? preset.style.fill,
    stroke: m.stroke ?? preset.style.stroke,
    cornerRadius: m.cornerRadius ?? preset.style.cornerRadius,
    shadow: m.shadow ?? preset.style.shadow,
    backdrop: m.backdrop ?? preset.style.backdrop,
  };
}
