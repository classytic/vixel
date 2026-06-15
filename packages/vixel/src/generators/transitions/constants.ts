/**
 * Transition Constants & Filter Builders
 * ======================================
 * Pure filtergraph builders — no I/O, fully unit-testable. The offset maths
 * here is the part most worth pinning with tests.
 */

export const DEFAULT_TRANSITION = 'fade';
export const DEFAULT_TRANSITION_DURATION = 0.5;

export interface XfadeGraph {
  filterComplex: string;
  videoLabel: string;
  audioLabel: string | null;
  /** Total output duration after all crossfade overlaps. */
  totalDuration: number;
}

/**
 * Build the xfade (+ optional acrossfade) filtergraph for chaining N clips.
 *
 * For clips with durations d0..d(n-1) and transition T, the i-th xfade
 * (joining the running result with clip i) starts at:
 *   offset_i = sum(d[0..i-1]) - T*i
 * and the running duration after that join is sum(d[0..i]) - T*i.
 */
export function buildXfadeGraph(opts: {
  durations: number[];
  transition: string;
  transitionDuration: number;
  audio: boolean;
  normalize?: { width: number; height: number; fps?: number | undefined } | undefined;
}): XfadeGraph {
  const { durations, transition, transitionDuration: T, audio, normalize } = opts;
  const n = durations.length;
  if (n < 2) throw new Error('xfade requires at least 2 clips');

  const chains: string[] = [];

  // Optionally normalize each input's geometry so xfade can blend them.
  const vLabel = (i: number): string => {
    if (!normalize) return `${i}:v`;
    const fpsPart = normalize.fps ? `,fps=${normalize.fps}` : '';
    const out = `nv${i}`;
    chains.push(
      `[${i}:v]scale=${normalize.width}:${normalize.height}:force_original_aspect_ratio=decrease,` +
        `pad=${normalize.width}:${normalize.height}:(ow-iw)/2:(oh-ih)/2,setsar=1${fpsPart},format=yuv420p[${out}]`,
    );
    return out;
  };

  // Video xfade chain.
  let prevV = vLabel(0);
  let cumulative = durations[0]!;
  for (let i = 1; i < n; i++) {
    const offset = cumulative - T * i;
    const cur = vLabel(i);
    const out = i === n - 1 ? 'vout' : `vx${i}`;
    chains.push(
      `[${prevV}][${cur}]xfade=transition=${transition}:duration=${T}:offset=${round(offset)}[${out}]`,
    );
    prevV = out;
    cumulative += durations[i]!;
  }
  const totalDuration = cumulative - T * (n - 1);

  // Audio acrossfade chain.
  let audioLabel: string | null = null;
  if (audio) {
    let prevA = `0:a`;
    for (let i = 1; i < n; i++) {
      const out = i === n - 1 ? 'aout' : `ax${i}`;
      chains.push(`[${prevA}][${i}:a]acrossfade=d=${T}[${out}]`);
      prevA = out;
    }
    audioLabel = `[aout]`;
  }

  return {
    filterComplex: chains.join('; '),
    videoLabel: '[vout]',
    audioLabel,
    totalDuration: round(totalDuration),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
