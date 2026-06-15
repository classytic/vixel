/**
 * Parallax Constants & Filter Builder
 * ===================================
 * Pure filtergraph builder — no I/O, fully unit-testable.
 *
 * 2.5D parallax via `displace`: a per-pixel displacement map is derived from
 * the depth map (deviation from mid-gray = shift), and animated over time so
 * near pixels travel more than far ones — a fake camera move.
 *
 * Honest limit: ffmpeg `displace` has no occlusion handling, so it smears /
 * ghosts at depth edges (and on any baked-in text). Keep `amplitude` small and
 * the depth map smooth. This is a BASIC, ffmpeg-native approximation — good for
 * subtle ambient drift, not the "ImmersityAI / 3D photo" look.
 *
 * Proper design (for production quality) is a GLSL fragment shader that samples
 * depth + color per pixel and offsets by depth on a GPU. The reference
 * open-source implementation is DepthFlow (BrokenSource/DepthFlow) — a free
 * ImmersityAI alternative doing depth-parallax in a GLSL shader at up to
 * 8K50fps. If a project needs convincing 2.5D, delegate to DepthFlow (a Python
 * + GPU tool) rather than ffmpeg; vixel's `parallax3d` is the lightweight,
 * dependency-free fallback for gentle motion only.
 */

export const DEFAULT_AMPLITUDE = 12;
export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;
export const DEFAULT_FPS = 30;

/** Build the displace-based parallax filter_complex producing `[vout]`. */
export function buildParallaxFilter(opts: {
  width: number;
  height: number;
  amplitude: number;
  period: number;
  duration: number;
  mode: 'sway' | 'pan' | 'orbit';
}): string {
  const { width, height, amplitude, period, duration, mode } = opts;
  // displace shift = (mapval - 128); map a max shift of `amplitude` px onto the
  // nearest depth (lum 255 → deviation 127): k = amplitude / 127.
  const k = round(amplitude / 127);

  let xOsc: string;
  let yOsc: string;
  switch (mode) {
    case 'pan':
      xOsc = `(2*T/${duration}-1)`; // linear left→right
      yOsc = `0`;
      break;
    case 'orbit':
      xOsc = `cos(2*PI*T/${period})`;
      yOsc = `sin(2*PI*T/${period})`;
      break;
    case 'sway':
    default:
      xOsc = `cos(2*PI*T/${period})`;
      yOsc = `0.5*sin(2*PI*T/${period})`;
      break;
  }

  return (
    `[1:v]format=gray,scale=${width}:${height},split=2[d1][d2];` +
    `[d1]geq=lum='128+(lum(X\\,Y)-128)*${k}*${xOsc}'[xmap];` +
    `[d2]geq=lum='128+(lum(X\\,Y)-128)*${k}*${yOsc}'[ymap];` +
    `[0:v]scale=${width}:${height},setsar=1[img];` +
    `[img][xmap][ymap]displace=edge=smear,format=yuv420p[vout]`
  );
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
