/**
 * Keyframes — the scoped animation model.
 * =======================================
 * `[{ t, value, easing }]` → an ffmpeg time-expression. Deliberately limited to
 * attributes ffmpeg can animate per-frame via a `t`-expression (overlay x/y,
 * rotate angle, volume). Animated *effect* parameters and roto are compositor-
 * tier and refused (see DESIGN.md).
 *
 * The data shape is also the contract a host's keyframe-curve editor renders.
 */

/** Easing INTO the next keyframe (movis/AE model). Aligned with the schema's vocabulary, + `hold`. */
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

export interface Keyframe {
  /** Time in seconds (relative to the element's start). */
  t: number;
  value: number;
  /** Easing applied across the segment to the NEXT keyframe. Default `linear`. */
  easing?: KeyframeEasing;
}

const num = (n: number) => String(Number(n.toFixed(6)));

/** Eased progress as an ffmpeg-expr string, given a normalized-progress expr `P`. */
function easeExpr(easing: KeyframeEasing, P: string): string {
  switch (easing) {
    case 'hold':
      return '0'; // step — hold the start value until the next key
    case 'easeIn':
      return `pow(${P}\\,2)`;
    case 'easeOut':
      return `(1-pow(1-${P}\\,2))`;
    case 'easeInOut':
      return `if(lt(${P}\\,0.5)\\,2*${P}*${P}\\,1-pow(-2*${P}+2\\,2)/2)`;
    case 'linear':
    default:
      return P;
  }
}

/**
 * Compile a scalar keyframe track to an ffmpeg time-expression in terms of
 * `timeVar` (default `t`). Holds the first value before the first key and the
 * last value after the last; each segment interpolates with its easing.
 *
 * Commas are backslash-escaped so the result is safe inside a quoted filter
 * argument (e.g. `overlay=x='<expr>'`).
 */
export function compileScalarKeyframes(kfs: readonly Keyframe[], timeVar = 't'): string {
  if (kfs.length === 0) throw new Error('compileScalarKeyframes needs at least one keyframe');
  const ks = [...kfs].sort((a, b) => a.t - b.t);
  if (ks.length === 1) return num(ks[0]!.value);

  const seg = (i: number): string => {
    const a = ks[i]!;
    const b = ks[i + 1]!;
    const dt = b.t - a.t;
    if (dt <= 0) return num(b.value); // coincident keys → jump to the later value
    const P = `clip((${timeVar}-${num(a.t)})/${num(dt)}\\,0\\,1)`;
    if (b.value === a.value) return num(a.value);
    return `(${num(a.value)}+(${num(b.value - a.value)})*${easeExpr(a.easing ?? 'linear', P)})`;
  };

  // Nested: if(lt(t,t1), seg0, if(lt(t,t2), seg1, … segN-2))
  let expr = seg(ks.length - 2);
  for (let i = ks.length - 3; i >= 0; i--) {
    expr = `if(lt(${timeVar}\\,${num(ks[i + 1]!.t)})\\,${seg(i)}\\,${expr})`;
  }
  return expr;
}
