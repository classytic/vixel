/**
 * Audio Mix Constants & Filter Builders
 * =====================================
 * Pure filtergraph builders — no I/O, fully unit-testable.
 */

export const DEFAULT_MUSIC_VOLUME_DUCKED = 0.25;
export const DEFAULT_MUSIC_VOLUME_FLAT = 1.0;
export const DEFAULT_VOICE_VOLUME = 1.0;
export const DEFAULT_DUCK_THRESHOLD = 0.03;
export const DEFAULT_DUCK_RATIO = 8;

export interface AudioMixPlan {
  /** Which foreground voice drives ducking, if any. */
  voiceLabel: string | null;
  musicVolume: number;
  voiceVolume: number;
  duck: boolean;
  threshold: number;
  ratio: number;
}

export interface BuiltAudioFilter {
  /** The `-filter_complex` string. */
  filterComplex: string;
  /** The output audio pad label to map (e.g. "[aout]"). */
  audioLabel: string;
}

/**
 * Build the filter_complex for an audio mix.
 *
 * Input pad layout is fixed by the caller in this order:
 *   `voicePad`  — the foreground voice source pad (e.g. "2:a" for a voiceover
 *                 input, or "0:a" when ducking music under the video's own audio).
 *   `musicPad`  — the background music source pad (e.g. "1:a").
 *   `extraPads` — additional sources to mix flat (e.g. the video's own audio
 *                 when `keepOriginalAudio` and a separate voiceover exists).
 *
 * When `duck` is true and both a voice and music are present, the music is
 * compressed against the voice (sidechaincompress) so it drops under speech,
 * then everything is mixed.
 */
export function buildAudioMixFilter(opts: {
  voicePad: string | null;
  musicPad: string | null;
  extraPads?: string[];
  musicVolume: number;
  voiceVolume: number;
  duck: boolean;
  threshold: number;
  ratio: number;
}): BuiltAudioFilter {
  const { voicePad, musicPad, extraPads = [], musicVolume, voiceVolume, duck, threshold, ratio } = opts;
  const chains: string[] = [];
  const mixInputs: string[] = [];

  const canDuck = duck && voicePad !== null && musicPad !== null;

  if (voicePad) {
    if (canDuck) {
      // Split the voice: one copy triggers the compressor, one goes into the mix.
      chains.push(`[${voicePad}]volume=${voiceVolume},asplit=2[v1][v2]`);
    } else {
      chains.push(`[${voicePad}]volume=${voiceVolume}[v2]`);
    }
  }

  if (musicPad) {
    chains.push(`[${musicPad}]volume=${musicVolume}[mus]`);
    if (canDuck) {
      chains.push(
        `[mus][v1]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=5:release=250[mducked]`,
      );
      mixInputs.push('[mducked]');
    } else {
      mixInputs.push('[mus]');
    }
  }

  if (voicePad) mixInputs.push('[v2]');

  // Flat extra sources (e.g. original video audio kept alongside a voiceover).
  extraPads.forEach((pad, i) => {
    chains.push(`[${pad}]volume=1.0[x${i}]`);
    mixInputs.push(`[x${i}]`);
  });

  if (mixInputs.length === 1) {
    // Single source — rename to a stable output label.
    const only = mixInputs[0]!.slice(1, -1); // strip brackets
    chains.push(`[${only}]anull[aout]`);
  } else {
    chains.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[aout]`);
  }

  return { filterComplex: chains.join('; '), audioLabel: '[aout]' };
}
