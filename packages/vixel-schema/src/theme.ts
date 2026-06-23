/**
 * Theme — the design-token "taste layer" templates read instead of hardcoding
 * colors, type sizes, and motion.
 * ========================================================================
 * The agent's quality problem isn't "where do I put what" (templates solved that)
 * — it's "what should it LOOK like". Left free, a model (and each template) picks
 * its own `#FFFFFF` and `fontSize: 80`, so every scene freelances and the result
 * reads amateur. A Theme removes that freedom: it owns every hue, type size,
 * weight, font, and default motion. The agent picks a THEME by id + content; the
 * theme guarantees a designer-set floor across every scene.
 *
 * Same shape as the rest of the schema: pure DATA + one resolver + a BYO registry
 * (mirrors {@link BUILTIN_SHAPE_PRESETS} / {@link MOTION_FEELS}). The token table
 * lives HERE only, so the preview, the export, the editor menu, and the agent tool
 * manifest read one source.
 *
 * ── FONTS ARE FILES, NOT NAMES ──────────────────────────────────────────────
 * A `fontFamily` string alone loads NOTHING. Both renderers only load a font when
 * a `fontFile` is also present (Pixi → `FontFace().load()`, ffmpeg → fontsdir
 * attachment); a bare family name silently falls back to system fonts on BOTH —
 * so the "premium" font becomes Arial in export and preview ≠ output. Therefore a
 * theme carries a {@link ThemeFont} with a hosted `file` per family, and
 * {@link textStyle} emits BOTH `fontFamily` AND `fontFile`. Host the font files
 * (OFL — see family list below) at {@link FONT_PACK_BASE} and call
 * {@link setFontPackBase} once at startup so both the browser AND the server can
 * fetch them.
 */
import type { TextStyle } from './captions.js';
import type { OverlayEnter, OverlayExit } from './animation.js';
import type { MotionFeel } from './motion-feel.js';

/* ── font pack ─────────────────────────────────────────────────────────────── */

/** Base URL/path the theme font files resolve against. Set once at startup. */
export let FONT_PACK_BASE = '/fonts';

/** Point the theme font pack at your hosted location (CDN for the browser preview;
 *  a path the server can read/attach for ffmpeg). Affects every built-in theme. */
export function setFontPackBase(base: string): void {
  FONT_PACK_BASE = base.replace(/\/+$/, '');
}

/** A theme font — a CSS/libass family name PAIRED with the hosted file that backs it. */
export interface ThemeFont {
  /** Family used in `TextStyle.fontFamily` and as the libass family name. */
  family: string;
  /** Font FILE name (under {@link FONT_PACK_BASE}). REQUIRED — a family with no
   *  file silently degrades to system fonts on both renderers. Use `.ttf`/`.otf`:
   *  one file serves BOTH paths (browser `FontFace` accepts ttf; libass CANNOT read
   *  woff2). A woff2 would load in preview but fall back on the ffmpeg server. */
  file: string;
  /** Weight the file represents (documentation / future weight mapping). */
  weight?: number;
}

/** Resolve a {@link ThemeFont}'s file to a full URL under {@link FONT_PACK_BASE}. */
export function fontFileUrl(font: ThemeFont): string {
  return /^([a-z]+:)?\/\//i.test(font.file) ? font.file : `${FONT_PACK_BASE}/${font.file}`;
}

/* ── tokens ────────────────────────────────────────────────────────────────── */

/** Semantic color roles — the agent names a ROLE, never a hex. */
export interface ThemePalette {
  /** Canvas background. */
  bg: string;
  /** Card / panel fill (for solid surfaces). */
  surface: string;
  /** Headlines, hero numbers. */
  textPrimary: string;
  /** Body / supporting copy. */
  textSecondary: string;
  /** Captions, footnotes, de-emphasized labels. */
  textMuted: string;
  /** Highlight / brand pop. */
  accent: string;
  /** Text sitting ON an accent fill. */
  accentText: string;
  /** Hairlines, dividers, borders. */
  border: string;
}

/** Which family a type role uses. */
export type FontRole = 'heading' | 'body';

/** One step of the type scale → maps straight onto `TextStyle` fields. */
export interface TypeRole {
  /** Size in px, authored against a 1080-tall canvas (the engine's reference). */
  size: number;
  /** Family bucket. */
  font: FontRole;
  bold?: boolean;
  letterSpacing?: number;
}

/** Named type-scale roles — the agent picks a role, not a number. */
export type TypeRoleName = 'display' | 'title' | 'heading' | 'subheading' | 'metric' | 'body' | 'label';

export interface Theme {
  id: string;
  name: string;
  description: string;
  /** Heading + body families (with their backing files). */
  fonts: { heading: ThemeFont; body: ThemeFont };
  /** The modular type scale. */
  scale: Record<TypeRoleName, TypeRole>;
  palette: ThemePalette;
  /** Default shape-style preset id for cards/panels (a {@link BUILTIN_SHAPE_PRESETS} id). */
  surfaceStyle: string;
  /** Spacing scale (fractions of a cell) for insets/gaps — consistent padding. */
  space: { tight: number; base: number; loose: number };
  /** Default motion every template element inherits. */
  motion: { enter: OverlayEnter; exit: OverlayExit; feel: MotionFeel; stagger: number };
}

/* ── resolvers (what templates call) ───────────────────────────────────────── */

/**
 * Build a {@link TextStyle} for a named type role + color role — the ONE call a
 * template makes for text. Emits `fontFamily` AND `fontFile` so the look survives
 * export. `extra` (e.g. `{ align: 'left' }` or `{ bold: true }`) wins over the
 * role defaults. Pure.
 */
export function textStyle(
  theme: Theme,
  role: TypeRoleName,
  color: keyof ThemePalette,
  extra?: Partial<TextStyle>,
): TextStyle {
  const t = theme.scale[role];
  const font = theme.fonts[t.font];
  return {
    fontFamily: font.family,
    fontFile: fontFileUrl(font),
    fontSize: t.size,
    bold: t.bold,
    letterSpacing: t.letterSpacing,
    fillColor: theme.palette[color],
    // Layout text, not spoken captions — no karaoke recolor by default.
    animation: 'none',
    ...extra,
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Merge a partial theme over a base (BYO / one-field tweaks). Pure, non-mutating. */
export function resolveTheme(base: Theme, patch?: DeepPartial<Theme>): Theme {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    fonts: {
      heading: { ...base.fonts.heading, ...patch.fonts?.heading },
      body: { ...base.fonts.body, ...patch.fonts?.body },
    },
    scale: { ...base.scale, ...(patch.scale as Partial<Record<TypeRoleName, TypeRole>>) },
    palette: { ...base.palette, ...patch.palette },
    space: { ...base.space, ...patch.space },
    motion: { ...base.motion, ...patch.motion },
  } as Theme;
}

/* ── built-in themes (the curated taste presets) ───────────────────────────── */

const f = (family: string, file: string, weight?: number): ThemeFont => ({ family, file, weight });

/** Shared modular scale — every theme reuses these px sizes, varying only fonts/feel. */
const SCALE = (heading: FontRole = 'heading'): Record<TypeRoleName, TypeRole> => ({
  display: { size: 132, font: heading, bold: true, letterSpacing: -2 },
  title: { size: 96, font: heading, bold: true, letterSpacing: -1 },
  heading: { size: 72, font: heading, bold: true },
  subheading: { size: 44, font: 'body' },
  metric: { size: 64, font: heading, bold: true },
  body: { size: 30, font: 'body' },
  label: { size: 24, font: 'body', letterSpacing: 1 },
});

/**
 * The curated library. Hand-picked font pairings + palettes — a designer sets the
 * floor here so the agent can't fall below it. All families are OFL (free to
 * embed/serve); host the files under {@link FONT_PACK_BASE}.
 */
export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'studio',
    name: 'Studio',
    description: 'Neutral dark studio — clean grotesque on glass, snappy. The safe default.',
    fonts: { heading: f('Archivo', 'Archivo-Bold.ttf', 700), body: f('Inter', 'Inter-Regular.ttf', 400) },
    scale: SCALE(),
    palette: {
      bg: '#0B0B12', surface: '#16161F',
      textPrimary: '#FFFFFF', textSecondary: '#C8CDD6', textMuted: '#8A8F9A',
      accent: '#FF2D9B', accentText: '#FFFFFF', border: '#262633',
    },
    surfaceStyle: 'glass', space: { tight: 0.04, base: 0.06, loose: 0.1 },
    motion: { enter: 'slideUp', exit: 'fadeOut', feel: 'snappy', stagger: 0.12 },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Serif display + clean sans, warm neutrals — documentary / premium.',
    fonts: { heading: f('Fraunces', 'Fraunces-SemiBold.ttf', 600), body: f('Inter', 'Inter-Regular.ttf', 400) },
    scale: SCALE(),
    palette: {
      bg: '#14110E', surface: '#211C16',
      textPrimary: '#F5EFE6', textSecondary: '#CFC6B8', textMuted: '#9A9080',
      accent: '#E0A458', accentText: '#14110E', border: '#3A332A',
    },
    surfaceStyle: 'glass', space: { tight: 0.05, base: 0.07, loose: 0.11 },
    motion: { enter: 'slideUp', exit: 'fadeOut', feel: 'gentle', stagger: 0.14 },
  },
  {
    id: 'bold-pop',
    name: 'Bold Pop',
    description: 'Heavy display, high contrast, vivid accent — TikTok / CapCut energy.',
    fonts: { heading: f('Archivo Black', 'ArchivoBlack-Regular.ttf', 900), body: f('Inter', 'Inter-Regular.ttf', 400) },
    scale: SCALE(),
    palette: {
      bg: '#0B0B0F', surface: '#16161F',
      textPrimary: '#FFFFFF', textSecondary: '#C8CDD6', textMuted: '#8A8F9A',
      accent: '#FF3D71', accentText: '#FFFFFF', border: '#262633',
    },
    surfaceStyle: 'glass', space: { tight: 0.03, base: 0.05, loose: 0.08 },
    motion: { enter: 'slideUp', exit: 'fadeOut', feel: 'bouncy', stagger: 0.08 },
  },
  {
    id: 'minimal-mono',
    name: 'Minimal Mono',
    description: 'Geometric mono headings, monochrome + one accent — tech / SaaS.',
    fonts: { heading: f('Space Grotesk', 'SpaceGrotesk-Bold.ttf', 700), body: f('Inter', 'Inter-Regular.ttf', 400) },
    scale: SCALE(),
    palette: {
      bg: '#0A0A0A', surface: '#151515',
      textPrimary: '#FFFFFF', textSecondary: '#B5B5B5', textMuted: '#7A7A7A',
      accent: '#3DDC97', accentText: '#0A0A0A', border: '#242424',
    },
    surfaceStyle: 'panel-dark', space: { tight: 0.04, base: 0.06, loose: 0.1 },
    motion: { enter: 'slideUp', exit: 'fadeOut', feel: 'smooth', stagger: 0.1 },
  },
  {
    id: 'warm-brand',
    name: 'Warm Brand',
    description: 'Rounded friendly sans, warm light palette — lifestyle / brand.',
    fonts: { heading: f('Plus Jakarta Sans', 'PlusJakartaSans-Bold.ttf', 700), body: f('Plus Jakarta Sans', 'PlusJakartaSans-Regular.ttf', 400) },
    scale: SCALE(),
    palette: {
      bg: '#FBF6EF', surface: '#FFFFFF',
      textPrimary: '#1F1A17', textSecondary: '#54493F', textMuted: '#8A7C6E',
      accent: '#F0653E', accentText: '#FFFFFF', border: '#E6DBCB',
    },
    surfaceStyle: 'card', space: { tight: 0.04, base: 0.06, loose: 0.1 },
    motion: { enter: 'slideUp', exit: 'fadeOut', feel: 'smooth', stagger: 0.12 },
  },
];

/** The id used when a template/spec doesn't name a theme. */
export const DEFAULT_THEME_ID = 'studio';

const REGISTRY = new Map<string, Theme>(BUILTIN_THEMES.map((t) => [t.id, t]));

/** Register a BYO theme (or override a built-in by id). */
export function registerTheme(theme: Theme): void {
  REGISTRY.set(theme.id, theme);
}

/** Look up a theme by id (falls back to undefined — caller picks the default). */
export function getTheme(id: string | undefined): Theme | undefined {
  return id ? REGISTRY.get(id) : undefined;
}

/** Resolve an id to a theme, guaranteeing one back (default when unknown/absent). */
export function themeOrDefault(id?: string): Theme {
  return REGISTRY.get(id ?? DEFAULT_THEME_ID) ?? REGISTRY.get(DEFAULT_THEME_ID)!;
}

/** All registered themes (built-in + BYO) — for an editor palette or agent manifest. */
export function listThemes(): Theme[] {
  return [...REGISTRY.values()];
}

/**
 * Resolve a font FAMILY name → its hosted file URL, scanning every registered
 * theme's font pack. The one `family → file` source of truth shared across the
 * schema themes AND any downstream author that emits specs (e.g. the generation
 * agent setting `TextStyle.fontFile`) — so a family always points at the same file
 * and never silently falls back. Reflects `setFontPackBase` + BYO themes (reads the
 * live registry). Returns undefined for an unhosted family (caller keeps the bare
 * family name → system fallback, the prior behavior). Pure w.r.t. the registry.
 */
export function fontFileForFamily(family: string): string | undefined {
  for (const t of REGISTRY.values()) {
    if (t.fonts.heading.family === family) return fontFileUrl(t.fonts.heading);
    if (t.fonts.body.family === family) return fontFileUrl(t.fonts.body);
  }
  return undefined;
}
