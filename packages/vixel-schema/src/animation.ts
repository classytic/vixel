/**
 * Animation presets + easing — closed, agent-emittable vocabularies.
 * `ClipAnimation` (kenBurns/zoom/pan) is a HIGH-LEVEL preset that the engine
 * expands into transform keyframes; overlay enter/exit are entrance/exit presets.
 */

export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeOutExpo'
  | 'easeOutBounce';

/** A pickable easing — pure DATA an editor maps to a dropdown. The `id` is the
 *  source of truth (validated by {@link applyEasing}); `name` is the human label. */
export interface EasingDescriptor {
  id: Easing;
  name: string;
}

/**
 * The easing vocabulary, labeled — the SINGLE source both renderers (preview +
 * export) and the editor UI read, so the curve list lives in ONE place (mirrors
 * {@link BUILTIN_TRANSITIONS} / BUILTIN_EFFECTS). Ordered for the menu: identity
 * first, then the common eases, then the expressive ones. Adding a curve here +
 * a `case` in {@link applyEasing} is the whole change — every consumer updates.
 */
export const BUILTIN_EASINGS: EasingDescriptor[] = [
  { id: 'linear', name: 'Linear' },
  { id: 'easeOut', name: 'Ease Out' },
  { id: 'easeIn', name: 'Ease In' },
  { id: 'easeInOut', name: 'Ease In-Out' },
  { id: 'easeOutExpo', name: 'Expo Out' },
  { id: 'easeOutBounce', name: 'Bounce' },
];

/**
 * Evaluate a named {@link Easing} at `t` ∈ [0,1] → eased [0,1]. ONE shared curve
 * so every renderer reads motion identically (entrance, transitions, preview ==
 * export). `undefined`/`linear` is the identity, so an un-eased transition keeps
 * its native progress (no behavior change unless a curve is chosen).
 */
export function applyEasing(easing: Easing | undefined, t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (easing) {
    case 'easeIn':
      return x * x * x;
    case 'easeOut':
      return 1 - Math.pow(1 - x, 3);
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'easeOutExpo':
      return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case 'easeOutBounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let u = x;
      if (u < 1 / d1) return n1 * u * u;
      if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
      if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
      return n1 * (u -= 2.625 / d1) * u + 0.984375;
    }
    case 'linear':
    default:
      return x;
  }
}

export type ClipAnimationPreset = 'kenBurns' | 'zoom' | 'pan';

export interface ClipAnimation {
  preset: ClipAnimationPreset;
  direction?: 'in' | 'out' | 'left' | 'right' | 'up' | 'down';
  /** e.g. ken-burns zoom amount. */
  amount?: number;
  easing?: Easing;
}

export type OverlayEnter =
  | 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'popIn' | 'none';
export type OverlayExit =
  | 'fadeOut' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'popOut' | 'none';
