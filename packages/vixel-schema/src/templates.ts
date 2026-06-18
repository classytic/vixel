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
import type { TextStyle } from './captions.js';
import type { Rect } from './transform.js';
import { resolveRegion, resolveGridArea, grid, inset } from './layout.js';

/** Common timing every template needs. */
interface TimedInput {
  /** Scene start (seconds). */
  at: number;
  /** Scene length (seconds). */
  duration: number;
  /** Per-element entrance offset (seconds) for a cascade. Default 0.12. */
  stagger?: number;
}

const TEXT = '#FFFFFF';
const TEXT_DIM = '#C8CDD6'; // secondary text (TextStyle has no opacity → use a lighter color)

const text = (o: { at: number; duration: number; text: string; style?: TextStyle; frame: Rect }): VisualClip => ({
  // Plain layout text, not spoken captions — default to no caption animation so the
  // burner doesn't treat it as karaoke (which would recolor it to the highlight).
  media: { kind: 'text', text: o.text, style: { animation: 'none', ...o.style } },
  at: o.at,
  duration: o.duration,
  transform: { frame: o.frame },
  enter: 'slideUp',
  exit: 'fadeOut',
});

const shape = (o: { at: number; duration: number; style: string; frame: Rect }): VisualClip => ({
  media: { kind: 'shape', style: o.style },
  at: o.at,
  duration: o.duration,
  transform: { frame: o.frame },
  enter: 'slideUp',
  exit: 'fadeOut',
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
export function statCards(input: StatCardsInput): VisualClip[] {
  const { at, duration, cards, heading } = input;
  const cardStyle = input.cardStyle ?? 'glass';
  const stagger = input.stagger ?? 0.12;
  const clips: VisualClip[] = [];

  if (heading) {
    clips.push(
      text({
        at,
        duration,
        text: heading,
        frame: resolveRegion('title'),
        style: { fontSize: 80, bold: true, fillColor: TEXT, align: 'center' },
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
    clips.push(shape({ at: t, duration: dur, style: cardStyle, frame: cell }));

    const pad = inset(cell, 0.06, 0.08);
    const titleH = pad.h * 0.16;
    const gradeH = pad.h * 0.3;
    clips.push(
      text({
        at: t,
        duration: dur,
        text: card.title,
        frame: { x: pad.x, y: pad.y, w: pad.w, h: titleH },
        style: { fontSize: 24, fillColor: TEXT_DIM, align: 'left' },
      }),
    );
    if (card.grade) {
      const arrow = card.trend === 'up' ? ' ↑' : card.trend === 'down' ? ' ↓' : '';
      clips.push(
        text({
          at: t,
          duration: dur,
          text: `${card.grade}${arrow}`,
          frame: { x: pad.x, y: pad.y + titleH, w: pad.w, h: gradeH },
          style: { fontSize: 64, bold: true, fillColor: TEXT, align: 'left' },
        }),
      );
    }
    if (card.body) {
      const usedH = titleH + (card.grade ? gradeH : 0);
      clips.push(
        text({
          at: t,
          duration: dur,
          text: card.body,
          frame: { x: pad.x, y: pad.y + usedH, w: pad.w, h: pad.h - usedH },
          style: { fontSize: 24, fillColor: TEXT_DIM, align: 'left' },
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
export function titleCard(input: TitleCardInput): VisualClip[] {
  const { at, duration, title, subtitle } = input;
  const stagger = input.stagger ?? 0.12;
  const clips: VisualClip[] = [];

  if (input.panelStyle) {
    clips.push(shape({ at, duration, style: input.panelStyle, frame: resolveGridArea({ col: [2, 10], row: [4, 5] }) }));
  }
  clips.push(
    text({
      at,
      duration,
      text: title,
      frame: resolveGridArea({ col: [1, 12], row: [5, 2] }),
      style: { fontSize: 96, bold: true, fillColor: TEXT, align: 'center' },
    }),
  );
  if (subtitle) {
    clips.push(
      text({
        at: at + stagger,
        duration: Math.max(0.1, duration - stagger),
        text: subtitle,
        frame: resolveGridArea({ col: [2, 10], row: [7, 2] }),
        style: { fontSize: 40, fillColor: TEXT_DIM, align: 'center' },
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
export function lowerThird(input: LowerThirdInput): VisualClip[] {
  const { at, duration, title, subtitle } = input;
  const stagger = input.stagger ?? 0.1;
  const panel = resolveGridArea({ col: [1, 7], row: [9, 3] });
  const pad = inset(panel, 0.06, 0.16);
  const clips: VisualClip[] = [
    shape({ at, duration, style: input.panelStyle ?? 'glass', frame: panel }),
    text({
      at,
      duration,
      text: title,
      frame: { x: pad.x, y: pad.y, w: pad.w, h: subtitle ? pad.h * 0.55 : pad.h },
      style: { fontSize: 48, bold: true, fillColor: TEXT, align: 'left' },
    }),
  ];
  if (subtitle) {
    clips.push(
      text({
        at: at + stagger,
        duration: Math.max(0.1, duration - stagger),
        text: subtitle,
        frame: { x: pad.x, y: pad.y + pad.h * 0.55, w: pad.w, h: pad.h * 0.45 },
        style: { fontSize: 30, fillColor: TEXT_DIM, align: 'left' },
      }),
    );
  }
  return clips;
}

// ── registry (discovery for an editor / agent tool list) ──────────────────────

/** A discoverable template: metadata + a builder that turns typed input into clips. */
export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  build: (input: never) => VisualClip[];
}

export const BUILTIN_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'stat-cards',
    name: 'Stat Cards',
    description: 'Heading over a 2-column grid of glass stat cards (grade + body), cascading in.',
    build: statCards as (input: never) => VisualClip[],
  },
  {
    id: 'title-card',
    name: 'Title Card',
    description: 'Centered title + optional subtitle, optionally on a backing panel.',
    build: titleCard as (input: never) => VisualClip[],
  },
  {
    id: 'lower-third',
    name: 'Lower Third',
    description: 'Name/role lower-third on a glass panel, bottom-left.',
    build: lowerThird as (input: never) => VisualClip[],
  },
];

/** List the built-in templates (for an editor palette or an agent tool manifest). */
export function listTemplates(): LayoutTemplate[] {
  return [...BUILTIN_TEMPLATES];
}
