/**
 * Layout templates — the agent's PRIMARY authoring API.
 * =====================================================
 * The agent's hard problem is "where do I put what". A template removes it: the
 * agent passes typed CONTENT + timing and gets back valid, non-overlapping,
 * pro-styled clips. The template owns every coordinate, the shape styling, and the
 * entrance stagger — the agent reasons about meaning, not geometry.
 *
 * Templates emit plain {@link VisualClip}s (shapes + text) for ONE visual lane, so
 * the result drops straight into `{ type: 'visual', clips: [...] }` and renders
 * with no template runtime. Stacking is array order (a card's shape is pushed
 * before its text, so the text sits on top). Elements `slideUp` in and `fadeOut`,
 * staggered by a per-element `at` offset.
 *
 * @example
 * ```ts
 * spec.tracks.push({ type: 'visual', clips: statCards({
 *   at: 1, duration: 6, heading: 'designed to detect chronic illness patterns',
 *   cards: [
 *     { title: 'Sympathetic/Parasympathetic Balance', grade: 'C', trend: 'down', body: '78/22 dominance…' },
 *     { title: 'Circadian HRV Desynchronization',      grade: 'C+', trend: 'down', body: 'HRV peaks at 6PM…' },
 *   ],
 * }) });
 * ```
 */
import type { VisualClip } from './visual.js';
import type { VixelSpec } from './spec.js';
import type { TextStyle } from './captions.js';
import type { Rect, BoxStyle } from './transform.js';
import { resolveRegion, resolveGridArea, grid, inset } from './layout.js';
import { type Theme, textStyle, themeOrDefault, listThemes } from './theme.js';

/** Common timing every template needs. */
interface TimedInput {
  /** Scene start (seconds). */
  at: number;
  /** Scene length (seconds). */
  duration: number;
  /** Per-element entrance offset (seconds) for a cascade. Default: the theme's `motion.stagger`. */
  stagger?: number;
  /** Theme id for the look (colors/type/motion). Default {@link DEFAULT_THEME_ID}. */
  theme?: string;
}

const text = (theme: Theme, o: { at: number; duration: number; text: string; style?: TextStyle; frame: Rect }): VisualClip => ({
  // Plain layout text, not spoken captions — default to no caption animation so the
  // burner doesn't treat it as karaoke (which would recolor it to the highlight).
  media: { kind: 'text', text: o.text, style: { animation: 'none', ...o.style } },
  at: o.at,
  duration: o.duration,
  transform: { frame: o.frame },
  enter: theme.motion.enter,
  exit: theme.motion.exit,
  motionTiming: { feel: theme.motion.feel },
});

const shape = (theme: Theme, o: { at: number; duration: number; style: string; frame: Rect }): VisualClip => ({
  media: { kind: 'shape', style: o.style },
  at: o.at,
  duration: o.duration,
  transform: { frame: o.frame },
  enter: theme.motion.enter,
  exit: theme.motion.exit,
  motionTiming: { feel: theme.motion.feel },
});

// ── stat-cards ────────────────────────────────────────────────────────────────

export interface StatCard {
  title: string;
  /** A short grade/score badge, e.g. `'C+'`. */
  grade?: string;
  /** Body copy under the grade. */
  body?: string;
  /** A trend arrow appended to the grade. */
  trend?: 'up' | 'down';
}

export interface StatCardsInput extends TimedInput {
  /** Optional headline above the cards. */
  heading?: string;
  cards: StatCard[];
  /** Shape preset for the card background. Default `'glass'`. */
  cardStyle?: string;
}

/**
 * A heading over a 2-column grid of glass stat cards (the health-dashboard look).
 * Cards cascade in by `stagger`. Returns shapes + text; geometry is fully owned.
 */
export function statCards(input: StatCardsInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration, cards, heading } = input;
  const cardStyle = input.cardStyle ?? theme.surfaceStyle;
  const stagger = input.stagger ?? theme.motion.stagger;
  const clips: VisualClip[] = [];

  if (heading) {
    clips.push(
      text(theme, {
        at,
        duration,
        text: heading,
        frame: resolveRegion('title'),
        style: textStyle(theme, 'heading', 'textPrimary', { align: 'center' }),
      }),
    );
  }

  // Cards occupy the area below the heading (or the whole safe area without one).
  const area = heading ? resolveGridArea({ col: [1, 12], row: [5, 7] }) : resolveRegion('safe');
  const cols = cards.length <= 1 ? 1 : 2;
  const rows = Math.ceil(cards.length / cols);
  const cells = grid(area, rows, cols, 0.03);

  cards.forEach((card, i) => {
    const cell = cells[i]!;
    const t = at + i * stagger;
    const dur = Math.max(0.1, duration - i * stagger);

    // Push the card background BEFORE its text so the text composites on top.
    clips.push(shape(theme, { at: t, duration: dur, style: cardStyle, frame: cell }));

    const pad = inset(cell, 0.06, 0.08);
    const titleH = pad.h * 0.16;
    const gradeH = pad.h * 0.3;
    clips.push(
      text(theme, {
        at: t,
        duration: dur,
        text: card.title,
        frame: { x: pad.x, y: pad.y, w: pad.w, h: titleH },
        style: textStyle(theme, 'label', 'textSecondary', { align: 'left' }),
      }),
    );
    if (card.grade) {
      const arrow = card.trend === 'up' ? ' ↑' : card.trend === 'down' ? ' ↓' : '';
      clips.push(
        text(theme, {
          at: t,
          duration: dur,
          text: `${card.grade}${arrow}`,
          frame: { x: pad.x, y: pad.y + titleH, w: pad.w, h: gradeH },
          style: textStyle(theme, 'metric', 'textPrimary', { align: 'left' }),
        }),
      );
    }
    if (card.body) {
      const usedH = titleH + (card.grade ? gradeH : 0);
      clips.push(
        text(theme, {
          at: t,
          duration: dur,
          text: card.body,
          frame: { x: pad.x, y: pad.y + usedH, w: pad.w, h: pad.h - usedH },
          style: textStyle(theme, 'body', 'textMuted', { align: 'left' }),
        }),
      );
    }
  });

  return clips;
}

// ── title-card ──────────────────────────────────────────────────────────────

export interface TitleCardInput extends TimedInput {
  title: string;
  subtitle?: string;
  /** Optional backing panel behind the text (a shape preset id, e.g. `'glass'`). */
  panelStyle?: string;
}

/** A centered title + optional subtitle, optionally on a backing panel. */
export function titleCard(input: TitleCardInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration, title, subtitle } = input;
  const stagger = input.stagger ?? theme.motion.stagger;
  const clips: VisualClip[] = [];

  if (input.panelStyle) {
    clips.push(shape(theme, { at, duration, style: input.panelStyle, frame: resolveGridArea({ col: [2, 10], row: [4, 5] }) }));
  }
  clips.push(
    text(theme, {
      at,
      duration,
      text: title,
      frame: resolveGridArea({ col: [1, 12], row: [5, 2] }),
      style: textStyle(theme, 'title', 'textPrimary', { align: 'center' }),
    }),
  );
  if (subtitle) {
    clips.push(
      text(theme, {
        at: at + stagger,
        duration: Math.max(0.1, duration - stagger),
        text: subtitle,
        frame: resolveGridArea({ col: [2, 10], row: [7, 2] }),
        style: textStyle(theme, 'subheading', 'textSecondary', { align: 'center' }),
      }),
    );
  }
  return clips;
}

// ── lower-third ───────────────────────────────────────────────────────────────

export interface LowerThirdInput extends TimedInput {
  /** Primary line (name / topic). */
  title: string;
  /** Secondary line (role / detail). */
  subtitle?: string;
  /** Backing chip/panel style. Default `'glass'`. */
  panelStyle?: string;
}

/** A name/role lower-third anchored bottom-left, on a glass panel. */
export function lowerThird(input: LowerThirdInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration, title, subtitle } = input;
  const stagger = input.stagger ?? theme.motion.stagger;
  const panel = resolveGridArea({ col: [1, 7], row: [9, 3] });
  const pad = inset(panel, 0.06, 0.16);
  const clips: VisualClip[] = [
    shape(theme, { at, duration, style: input.panelStyle ?? theme.surfaceStyle, frame: panel }),
    text(theme, {
      at,
      duration,
      text: title,
      frame: { x: pad.x, y: pad.y, w: pad.w, h: subtitle ? pad.h * 0.55 : pad.h },
      style: textStyle(theme, 'subheading', 'textPrimary', { align: 'left', bold: true }),
    }),
  ];
  if (subtitle) {
    clips.push(
      text(theme, {
        at: at + stagger,
        duration: Math.max(0.1, duration - stagger),
        text: subtitle,
        frame: { x: pad.x, y: pad.y + pad.h * 0.55, w: pad.w, h: pad.h * 0.45 },
        style: textStyle(theme, 'body', 'textSecondary', { align: 'left' }),
      }),
    );
  }
  return clips;
}

// ── media-slot templates (the editor's Layouts + Scenes; the CapCut model) ─────
//
// These emit `slot`-marked clips (see VisualClip.slot): media slots are empty-source
// PLACEHOLDERS the user/agent fills, keeping the template's frame + design. They flow
// through the SAME registry + buildScene as the content templates above — one engine
// for editor and agent. `layout` = bare media grids; `scene` = designed compositions.

/** An empty-source media PLACEHOLDER slot at `frame` (the user/agent fills it). */
const slotMedia = (
  theme: Theme,
  o: { at: number; duration: number; frame: Rect; slot: { id: string; label: string; role?: string }; kind?: 'image' | 'video'; style?: BoxStyle; rotation?: number },
): VisualClip => ({
  media: { kind: o.kind ?? 'image', source: '' },
  at: o.at,
  duration: o.duration,
  transform: { frame: o.frame, fit: 'cover', ...(o.rotation ? { rotation: o.rotation } : {}), ...(o.style ? { style: o.style } : {}) },
  enter: theme.motion.enter,
  exit: theme.motion.exit,
  motionTiming: { feel: theme.motion.feel },
  slot: { ...o.slot, kind: 'media' },
});

/** An editable TEXT slot (placeholder copy the user/agent rewrites). */
const slotText = (
  theme: Theme,
  o: { at: number; duration: number; text: string; frame: Rect; style?: TextStyle; slot: { id: string; label: string } },
): VisualClip => ({ ...text(theme, o), slot: { ...o.slot, kind: 'text' } });

/** A plain decorative shape (a direct fill, not a preset) — bg gradients, chips.
 *  NO entrance: a background/scaffold is present from the first frame (else the scene
 *  reads as empty at the scene start, where the playhead lands after applying). */
const decoShape = (o: { at: number; duration: number; frame: Rect; media: VisualClip['media'] }): VisualClip => ({
  media: o.media,
  at: o.at,
  duration: o.duration,
  transform: { frame: o.frame },
});

// — bare layout grids (media slots only) —
export function layoutSplitH(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  return [
    slotMedia(theme, { at, duration, frame: { x: 0, y: 0, w: 1, h: 0.5 }, kind: 'video', slot: { id: 'top', label: 'Top clip', role: 'top' } }),
    slotMedia(theme, { at, duration, frame: { x: 0, y: 0.5, w: 1, h: 0.5 }, kind: 'video', slot: { id: 'bottom', label: 'Bottom clip', role: 'bottom' } }),
  ];
}
export function layoutSplitV(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  return [
    slotMedia(theme, { at, duration, frame: { x: 0, y: 0, w: 0.5, h: 1 }, kind: 'video', slot: { id: 'left', label: 'Left clip', role: 'left' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.5, y: 0, w: 0.5, h: 1 }, kind: 'video', slot: { id: 'right', label: 'Right clip', role: 'right' } }),
  ];
}
export function layoutPip(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  return [
    slotMedia(theme, { at, duration, frame: { x: 0, y: 0, w: 1, h: 1 }, kind: 'video', slot: { id: 'main', label: 'Main', role: 'main' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.64, y: 0.66, w: 0.32, h: 0.3 }, kind: 'video', style: { radius: 0.1 }, slot: { id: 'pip', label: 'Inset', role: 'pip' } }),
  ];
}
export function layoutGallery2(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  return [
    slotMedia(theme, { at, duration, frame: { x: 0.03, y: 0.28, w: 0.45, h: 0.44 }, style: { radius: 0.04 }, slot: { id: 'a', label: 'Item 1' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.52, y: 0.28, w: 0.45, h: 0.44 }, style: { radius: 0.04 }, slot: { id: 'b', label: 'Item 2' } }),
  ];
}
export function layoutGallery3(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  return [
    slotMedia(theme, { at, duration, frame: { x: 0.02, y: 0.3, w: 0.31, h: 0.4 }, style: { radius: 0.04 }, slot: { id: 'a', label: 'Item 1' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.345, y: 0.3, w: 0.31, h: 0.4 }, style: { radius: 0.04 }, slot: { id: 'b', label: 'Item 2' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.67, y: 0.3, w: 0.31, h: 0.4 }, style: { radius: 0.04 }, slot: { id: 'c', label: 'Item 3' } }),
  ];
}
export function layoutGrid4(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  const s = { radius: 0.03 };
  return [
    slotMedia(theme, { at, duration, frame: { x: 0.02, y: 0.04, w: 0.47, h: 0.45 }, style: s, slot: { id: 'a', label: 'Item 1' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.51, y: 0.04, w: 0.47, h: 0.45 }, style: s, slot: { id: 'b', label: 'Item 2' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.02, y: 0.51, w: 0.47, h: 0.45 }, style: s, slot: { id: 'c', label: 'Item 3' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.51, y: 0.51, w: 0.47, h: 0.45 }, style: s, slot: { id: 'd', label: 'Item 4' } }),
  ];
}

// — designed scenes (media slots + themed decoration + text slots). Premium look:
//   layered decoration (gradient bg, accent glow/shapes), framed media (border/shadow/
//   tilt), accent-colored type, chips/bars with CENTERED labels (text anchors at frame
//   center, so a label shares its chip's frame). All colors from the theme palette →
//   cohesive + themeable. —
const rgba = (hex: string, a: number) => ({ color: hex, opacity: a });

export function sceneSplitCompare(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  const P = theme.palette;
  return [
    decoShape({ at, duration, frame: { x: 0, y: 0, w: 1, h: 1 }, media: { kind: 'shape', shape: 'rect', fill: { color: P.bg } } }),
    slotMedia(theme, { at, duration, frame: { x: 0.04, y: 0.045, w: 0.92, h: 0.43 }, kind: 'video', style: { radius: 0.04 }, slot: { id: 'top', label: 'Top clip', role: 'top' } }),
    slotMedia(theme, { at, duration, frame: { x: 0.04, y: 0.525, w: 0.92, h: 0.43 }, kind: 'video', style: { radius: 0.04 }, slot: { id: 'bottom', label: 'Bottom clip', role: 'bottom' } }),
    // center VS badge — an accent circle bridging the two clips, white "VS" centered on it
    decoShape({ at, duration, frame: { x: 0.4, y: 0.4425, w: 0.2, h: 0.1125 }, media: { kind: 'shape', shape: 'ellipse', fill: { color: P.accent }, stroke: { color: P.bg, width: 10 } } }),
    slotText(theme, { at, duration, text: 'VS', frame: { x: 0.4, y: 0.4425, w: 0.2, h: 0.1125 }, style: textStyle(theme, 'heading', 'accentText', { align: 'center' }), slot: { id: 'title', label: 'Badge' } }),
  ];
}

export function sceneSpotlight(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  const P = theme.palette;
  return [
    decoShape({ at, duration, frame: { x: 0, y: 0, w: 1, h: 1 }, media: { kind: 'shape', shape: 'rect', fill: { gradient: { from: P.accent, to: P.bg, angle: 160 } } } }),
    // soft accent glow behind the photo (large translucent disc → colour + depth)
    decoShape({ at, duration, frame: { x: 0.05, y: 0.13, w: 0.9, h: 0.5 }, media: { kind: 'shape', shape: 'ellipse', fill: rgba(P.accent, 0.25) } }),
    // framed, slightly-tilted photo (polaroid)
    slotMedia(theme, { at, duration, frame: { x: 0.19, y: 0.19, w: 0.62, h: 0.4 }, rotation: -3, style: { radius: 0.04, border: { color: '#ffffff', width: 6 }, shadow: { blur: 55, color: '#000000' } }, slot: { id: 'photo', label: 'Photo' } }),
    // name (bold, white)
    slotText(theme, { at, duration, text: 'Your Name', frame: { x: 0.06, y: 0.63, w: 0.88, h: 0.13 }, style: textStyle(theme, 'title', 'textPrimary', { align: 'center' }), slot: { id: 'name', label: 'Name' } }),
    // role on an accent pill
    decoShape({ at, duration, frame: { x: 0.32, y: 0.79, w: 0.36, h: 0.055 }, media: { kind: 'shape', shape: 'roundedRect', cornerRadius: 60, fill: { color: P.accent } } }),
    slotText(theme, { at, duration, text: 'role / title', frame: { x: 0.32, y: 0.79, w: 0.36, h: 0.055 }, style: textStyle(theme, 'label', 'accentText', { align: 'center' }), slot: { id: 'subtitle', label: 'Subtitle' } }),
    // accent dots
    decoShape({ at, duration, frame: { x: 0.09, y: 0.07, w: 0.05, h: 0.028 }, media: { kind: 'shape', shape: 'ellipse', fill: rgba('#ffffff', 0.55) } }),
    decoShape({ at, duration, frame: { x: 0.85, y: 0.9, w: 0.06, h: 0.034 }, media: { kind: 'shape', shape: 'ellipse', fill: { color: P.accent } } }),
  ];
}

export function scenePresenter(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  const P = theme.palette;
  return [
    decoShape({ at, duration, frame: { x: 0, y: 0, w: 1, h: 1 }, media: { kind: 'shape', shape: 'rect', fill: { gradient: { from: P.surface, to: P.bg, angle: 135 } } } }),
    // screencast — large rounded "device" with a soft shadow
    slotMedia(theme, { at, duration, frame: { x: 0.33, y: 0.1, w: 0.63, h: 0.62 }, kind: 'video', style: { radius: 0.03, shadow: { blur: 50, color: '#000000' } }, slot: { id: 'screen', label: 'Screen / cast', role: 'screen' } }),
    // presenter — circular webcam with an accent ring
    slotMedia(theme, { at, duration, frame: { x: 0.05, y: 0.16, w: 0.225, h: 0.4 }, kind: 'video', style: { radius: 0.5, border: { color: P.accent, width: 6 } }, slot: { id: 'presenter', label: 'Presenter (webcam)', role: 'presenter' } }),
    // lower-third: accent bar + title + role
    decoShape({ at, duration, frame: { x: 0.05, y: 0.8, w: 0.012, h: 0.13 }, media: { kind: 'shape', shape: 'rect', fill: { color: P.accent } } }),
    slotText(theme, { at, duration, text: 'Presenter name', frame: { x: 0.09, y: 0.8, w: 0.86, h: 0.075 }, style: textStyle(theme, 'subheading', 'textPrimary', { align: 'left', bold: true }), slot: { id: 'title', label: 'Title' } }),
    slotText(theme, { at, duration, text: 'topic / role', frame: { x: 0.09, y: 0.875, w: 0.86, h: 0.05 }, style: textStyle(theme, 'label', 'accent', { align: 'left' }), slot: { id: 'subtitle', label: 'Subtitle' } }),
  ];
}

export function sceneBoldTitle(input: TimedInput, theme: Theme = themeOrDefault(input.theme)): VisualClip[] {
  const { at, duration } = input;
  const P = theme.palette;
  return [
    // bold SOLID accent field (vibrant + themeable; an accent→near-black gradient
    // would spend most of its range dark, so use the accent at full strength).
    decoShape({ at, duration, frame: { x: 0, y: 0, w: 1, h: 1 }, media: { kind: 'shape', shape: 'rect', fill: { color: P.accent } } }),
    // big rings for depth (partly off-canvas)
    decoShape({ at, duration, frame: { x: 0.5, y: -0.1, w: 0.78, h: 0.439 }, media: { kind: 'shape', shape: 'ellipse', fill: rgba('#ffffff', 0.12) } }),
    decoShape({ at, duration, frame: { x: -0.18, y: 0.68, w: 0.66, h: 0.371 }, media: { kind: 'shape', shape: 'ellipse', fill: rgba('#000000', 0.12) } }),
    // huge display title
    slotText(theme, { at, duration, text: 'BIG\nTITLE', frame: { x: 0.06, y: 0.34, w: 0.88, h: 0.32 }, style: textStyle(theme, 'display', 'textPrimary', { align: 'center' }), slot: { id: 'title', label: 'Title' } }),
    // subtitle on a contrasting chip
    decoShape({ at, duration, frame: { x: 0.27, y: 0.7, w: 0.46, h: 0.06 }, media: { kind: 'shape', shape: 'roundedRect', cornerRadius: 40, fill: { color: '#ffffff' } } }),
    slotText(theme, { at, duration, text: 'subtitle goes here', frame: { x: 0.27, y: 0.7, w: 0.46, h: 0.06 }, style: textStyle(theme, 'label', 'bg', { align: 'center' }), slot: { id: 'subtitle', label: 'Subtitle' } }),
  ];
}

// ── registry (discovery for an editor / agent tool list) ──────────────────────

/**
 * A discoverable template: metadata + a builder that turns typed input into clips.
 * `category` splits the surface: `block` = content components (agent fills words),
 * `layout` = bare media grids, `scene` = designed compositions. `layout`/`scene`
 * templates emit `slot`-marked clips (see {@link collectSlots}) the editor fills.
 */
export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  category?: 'block' | 'layout' | 'scene';
  aspect?: 'portrait' | 'landscape' | 'square' | 'any';
  build: (input: never) => VisualClip[];
}

const asBuild = (fn: (i: never, t?: Theme) => VisualClip[]): ((input: never) => VisualClip[]) => fn as (input: never) => VisualClip[];

export const BUILTIN_TEMPLATES: LayoutTemplate[] = [
  // content components (agent fills words — no media slots)
  { id: 'stat-cards', name: 'Stat Cards', category: 'block', description: 'Heading over a 2-column grid of glass stat cards (grade + body), cascading in.', build: asBuild(statCards) },
  { id: 'title-card', name: 'Title Card', category: 'block', description: 'Centered title + optional subtitle, optionally on a backing panel.', build: asBuild(titleCard) },
  { id: 'lower-third', name: 'Lower Third', category: 'block', description: 'Name/role lower-third on a glass panel, bottom-left.', build: asBuild(lowerThird) },
  // bare media grids — the editor's "Layouts"
  { id: 'split-h', name: 'Split · Top / Bottom', category: 'layout', aspect: 'portrait', description: 'Two stacked clips — reels comparing two takes (reaction over gameplay, before/after).', build: asBuild(layoutSplitH) },
  { id: 'split-v', name: 'Split · Left / Right', category: 'layout', aspect: 'any', description: 'Two side-by-side clips — split-screen comparison.', build: asBuild(layoutSplitV) },
  { id: 'pip', name: 'Picture-in-Picture', category: 'layout', aspect: 'any', description: 'A full-frame main with a small inset — webcam over a screencast.', build: asBuild(layoutPip) },
  { id: 'gallery-2', name: 'Gallery · 2', category: 'layout', aspect: 'any', description: 'Two centered cards side by side.', build: asBuild(layoutGallery2) },
  { id: 'gallery-3', name: 'Gallery · 3', category: 'layout', aspect: 'any', description: 'Three columns — a triptych gallery.', build: asBuild(layoutGallery3) },
  { id: 'grid-4', name: 'Grid · 2×2', category: 'layout', aspect: 'any', description: 'A 2×2 quad — four clips/images at once.', build: asBuild(layoutGrid4) },
  // designed scenes — media slots + decoration + text slots
  { id: 'bold-title', name: 'Bold Title', category: 'scene', aspect: 'portrait', description: 'A big display title + subtitle chip on an accent gradient — intros, hooks, section breaks.', build: asBuild(sceneBoldTitle) },
  { id: 'split-compare', name: 'Split Compare', category: 'scene', aspect: 'portrait', description: 'Two rounded clips with a VS badge — this-or-that, before/after.', build: asBuild(sceneSplitCompare) },
  { id: 'spotlight', name: 'Spotlight', category: 'scene', aspect: 'portrait', description: 'A framed photo on a soft gradient with a name + subtitle — intros, profiles.', build: asBuild(sceneSpotlight) },
  { id: 'presenter', name: 'Presenter + Screen', category: 'scene', aspect: 'landscape', description: 'A talking-head beside a larger screencast with a lower-third — tutorials, demos.', build: asBuild(scenePresenter) },
];

const TEMPLATE_REGISTRY = new Map<string, LayoutTemplate>(BUILTIN_TEMPLATES.map((t) => [t.id, t]));

/** Register a BYO template (or override a built-in by id). */
export function registerTemplate(template: LayoutTemplate): void {
  TEMPLATE_REGISTRY.set(template.id, template);
}

/** Look up a template by id. */
export function getTemplate(id: string): LayoutTemplate | undefined {
  return TEMPLATE_REGISTRY.get(id);
}

/** List the templates (built-in + BYO) — for an editor palette or an agent tool manifest. */
export function listTemplates(): LayoutTemplate[] {
  return [...TEMPLATE_REGISTRY.values()];
}

// ── scene presets (the AGENT's fill-in unit) ──────────────────────────────────

/**
 * One scene the agent emits: a {@link LayoutTemplate} id + timing + a theme id +
 * the template's typed CONTENT (its `*Input` minus `at`/`duration`/`theme`). This
 * is the whole authoring surface — pick a template, name a theme once, fill in the
 * words. {@link buildScene} expands it to themed {@link VisualClip}s.
 */
export interface ScenePreset {
  /** A registered template id (see {@link listTemplates}). */
  template: string;
  /** Scene start (seconds). */
  at: number;
  /** Scene length (seconds). */
  duration: number;
  /** Theme id; falls back to the composition default, then `studio`. */
  theme?: string;
  /** The template's typed input (e.g. {@link StatCardsInput}) minus `at`/`duration`/`theme`. */
  content?: Record<string, unknown>;
}

/**
 * Expand a {@link ScenePreset} to themed clips. Unknown template ⇒ `[]` (skip,
 * don't throw — one bad scene shouldn't sink a render). `defaultTheme` applies
 * when the scene names none. Pure.
 */
export function buildScene(scene: ScenePreset, defaultTheme?: string): VisualClip[] {
  const tpl = getTemplate(scene.template);
  if (!tpl) return [];
  const input = { ...(scene.content ?? {}), at: scene.at, duration: scene.duration, theme: scene.theme ?? defaultTheme };
  return tpl.build(input as never);
}

/** Expand a list of scenes to one flat clip list (drop straight into a visual lane). */
export function buildScenes(scenes: ScenePreset[], defaultTheme?: string): VisualClip[] {
  return scenes.flatMap((s) => buildScene(s, defaultTheme));
}

// ── agent manifest ────────────────────────────────────────────────────────────

/** Discoverable id/name/description — what an agent tool list shows for a choice. */
export interface AuthoringChoice {
  id: string;
  name: string;
  description: string;
}

/** The agent's authoring vocabulary: the themes it may apply + templates it may fill. */
export interface AuthoringManifest {
  themes: AuthoringChoice[];
  templates: AuthoringChoice[];
}

/**
 * The themes + templates an agent can choose from, as flat metadata for a tool
 * manifest. The agent picks a `theme` once and a `template` per scene, then writes
 * `content` — it never names a color, font size, or coordinate.
 */
export function authoringManifest(): AuthoringManifest {
  return {
    themes: listThemes().map((t) => ({ id: t.id, name: t.name, description: t.description })),
    templates: listTemplates().map((t) => ({ id: t.id, name: t.name, description: t.description })),
  };
}

// ── slots (the fill points a template exposes) ────────────────────────────────

/** A fillable slot found in a spec — its location + the clip's {@link VisualClip.slot}. */
export interface FoundSlot {
  trackIndex: number;
  itemIndex: number;
  slot: NonNullable<VisualClip['slot']>;
  clip: VisualClip;
}

/**
 * Every fillable slot in a spec, in order — the editor's "fill these N" list and the
 * agent's fill targets. A `media` slot is an empty-source placeholder to populate; a
 * `text` slot is editable copy. One source of truth: a clip is a slot iff it carries
 * {@link VisualClip.slot} (set by the media-slot templates above).
 */
export function collectSlots(spec: VixelSpec): FoundSlot[] {
  const out: FoundSlot[] = [];
  spec.tracks.forEach((t, trackIndex) => {
    if (t.type !== 'visual') return;
    t.clips.forEach((clip, itemIndex) => {
      if (clip.slot) out.push({ trackIndex, itemIndex, slot: clip.slot, clip });
    });
  });
  return out;
}
