/**
 * Burn animated captions onto a video.
 * ===================================
 * Compiles cues + style → an ASS file (see `./ass.ts`), then burns it with the
 * ffmpeg `ass` filter (full libass animation, unlike `subtitles=`). Supports a
 * named {@link CaptionPreset} with a user {@link TextStyle} merged on top, and a
 * `fontsDir` for bring-your-own fonts.
 */

import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegProgress } from '../core/ffmpeg-spawn.js';
import { escapeSubtitlePath } from '../generators/captions/constants.js';
import { ConfigError } from '../errors.js';
import { buildAss } from './ass.js';
import { CAPTION_PRESETS, type CaptionPreset } from './presets.js';
import type { CaptionCanvas, CaptionCue, TextStyle } from './types.js';
import type { BaseGeneratorConfig, VideoSource } from '../types/generators.js';

export interface BurnCaptionsConfig extends BaseGeneratorConfig {
  /** Named starting style; a `style` is merged on top of it. */
  preset?: CaptionPreset;
  /** Bring-your-own style; overrides the preset field-by-field. */
  style?: TextStyle;
  /** Output canvas. Defaults to the source's probed dimensions. */
  canvas?: CaptionCanvas;
  /** Directory of font files for libass to resolve (BYO fonts). */
  fontsDir?: string;
  onProgress?: (p: SpawnFFmpegProgress) => void;
}

export interface BurnCaptionsResult {
  outputPath: string;
  cueCount: number;
}

/** Resolve the canvas from config or the source's probed dimensions. */
function resolveCanvas(source: VideoSource, config: BurnCaptionsConfig): CaptionCanvas {
  if (config.canvas) return config.canvas;
  if (source.width && source.height && source.width > 0 && source.height > 0) {
    return { width: source.width, height: source.height };
  }
  throw new ConfigError('captions need a canvas: pass `canvas` or a probed Source with width/height');
}

export async function burnCaptions(
  source: VideoSource,
  cues: readonly CaptionCue[],
  outputPath: string,
  config: BurnCaptionsConfig = {},
): Promise<BurnCaptionsResult> {
  if (cues.length === 0) {
    throw new ConfigError('burnCaptions requires at least one cue');
  }
  const canvas = resolveCanvas(source, config);
  const style: TextStyle = { ...(config.preset ? CAPTION_PRESETS[config.preset] : {}), ...config.style };
  const ass = buildAss(cues, style, canvas);

  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const assPath = join(tmpdir(), `vixel-captions-${randomBytes(6).toString('hex')}.ass`);

  // Don't touch disk in dry-run — the command preview references the temp path.
  if (!config.dryRun) await writeFile(assPath, ass, 'utf8');

  try {
    // Escape for a single-quoted ffmpeg filter arg: normalize the path, then
    // neutralize any `'` (close-quote, escaped quote, reopen) so a path/fontsDir
    // containing a quote can't break out and inject filtergraph syntax.
    const quoteArg = (p: string) => escapeSubtitlePath(p).replace(/'/g, "'\\''");
    const fonts = config.fontsDir ? `:fontsdir='${quoteArg(config.fontsDir)}'` : '';
    const filter = `ass='${quoteArg(assPath)}'${fonts}`;
    const args = ['-i', source.inputPath, '-vf', filter, '-c:a', 'copy', '-y', outputPath];
    await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, source.duration));
    return { outputPath, cueCount: cues.length };
  } finally {
    if (!config.dryRun) await unlink(assPath).catch(() => {});
  }
}
