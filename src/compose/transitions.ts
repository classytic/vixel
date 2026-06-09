/**
 * Transition presets — the catalog as DATA.
 * =========================================
 * CapCut-flavored, intent-level transition names mapped to the `xfade` filter
 * that renders them, plus an advisory default duration. This catalog is the
 * shared contract: vixel renders from it, and a host editor (or a browser
 * preview) can read the same names/durations to drive its UI — without ever
 * importing a renderer. The spec stays declarative; the `xfade` mapping is an
 * internal detail surfaced only as data.
 *
 * Raw `xfade` names (e.g. `dissolve`, `wipeleft`) still pass straight through —
 * presets are additive friendly aliases, not a replacement.
 */

export interface TransitionPresetDef {
  /** The underlying ffmpeg `xfade` transition this preset renders as. */
  xfade: string;
  /** Advisory default overlap (seconds) for hosts/UI. compose uses the spec's `duration`. */
  defaultDuration: number;
  /** One-line description for tooling / pickers. */
  description: string;
}

/** Friendly, intent-level transition presets → `xfade` parameters. */
export const TRANSITION_PRESETS = {
  'whip-pan': { xfade: 'smoothleft', defaultDuration: 0.3, description: 'Fast horizontal whip between shots' },
  'zoom-blur': { xfade: 'zoomin', defaultDuration: 0.5, description: 'Punch-in zoom into the next shot' },
  'blur': { xfade: 'hblur', defaultDuration: 0.4, description: 'Soft motion-blur cross' },
  'glitch': { xfade: 'pixelize', defaultDuration: 0.3, description: 'Pixelated digital glitch cut' },
  'radial': { xfade: 'radial', defaultDuration: 0.6, description: 'Clock-wipe sweep' },
  'ripple': { xfade: 'distance', defaultDuration: 0.5, description: 'Organic distance morph' },
  'squeeze': { xfade: 'squeezeh', defaultDuration: 0.4, description: 'Horizontal squeeze' },
  'iris': { xfade: 'circleopen', defaultDuration: 0.6, description: 'Circular iris open' },
} as const satisfies Record<string, TransitionPresetDef>;

export type TransitionPreset = keyof typeof TRANSITION_PRESETS;

/**
 * Resolve any transition type to its concrete `xfade` name: presets map through
 * the catalog, `none` becomes a benign `fade` (the overlap is already a cut at
 * the plan level), and raw `xfade` names pass straight through.
 */
export function resolveXfadeName(type: string): string {
  if (type === 'none') return 'fade';
  const preset = (TRANSITION_PRESETS as Record<string, TransitionPresetDef>)[type];
  return preset ? preset.xfade : type;
}
