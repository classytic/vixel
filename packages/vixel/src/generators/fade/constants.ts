/**
 * Fade Constants & Filter Builders
 * ================================
 * Pure filtergraph builders — no I/O, fully unit-testable.
 */

export interface BuiltFadeFilters {
  /** Video filter chain (empty string if no video fade requested). */
  videoFilter: string;
  /** Audio filter chain (empty string if no audio fade requested). */
  audioFilter: string;
}

/**
 * Build the video `fade` and audio `afade` chains.
 * `duration` is the clip length, needed to place the fade-out at the end.
 */
export function buildFadeFilters(opts: {
  duration: number;
  fadeIn: number;
  fadeOut: number;
  color: 'black' | 'white';
  audio: boolean;
}): BuiltFadeFilters {
  const { duration, fadeIn, fadeOut, color, audio } = opts;
  const v: string[] = [];
  const a: string[] = [];

  if (fadeIn > 0) {
    v.push(`fade=t=in:st=0:d=${fadeIn}:color=${color}`);
    if (audio) a.push(`afade=t=in:st=0:d=${fadeIn}`);
  }
  if (fadeOut > 0) {
    const start = Math.max(0, round(duration - fadeOut));
    v.push(`fade=t=out:st=${start}:d=${fadeOut}:color=${color}`);
    if (audio) a.push(`afade=t=out:st=${start}:d=${fadeOut}`);
  }

  return { videoFilter: v.join(','), audioFilter: a.join(',') };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
