/**
 * compose() — render a {@link VixelSpec} to a single MP4 via ffmpeg.
 * =================================================================
 * The declarative composition renderer: clips + transitions + audio (with
 * optional music duck) compiled to one `filter_complex` pass. This is the
 * primitive an AI/MCP (e.g. prism's shot-stitcher) targets — emit a spec, get a
 * video.
 *
 * v1 renders the video+audio timeline backbone (see `./graph.ts` for scope).
 * Overlays (text/image/captions) land in the next increment; the schema already
 * carries them and `captions`/`overlay` ops can be applied to the result now.
 *
 * @example
 * ```ts
 * await compose({
 *   version: 1,
 *   output: { width: 1080, height: 1920, fps: 30 },
 *   tracks: [
 *     { type: 'video', clips: [
 *       { source: 'a.mp4', duration: 3, transition: { type: 'dissolve', duration: 0.5 } },
 *       { source: 'b.mp4', duration: 3 },
 *     ]},
 *     { type: 'audio', items: [{ source: 'music.mp3', role: 'music', duck: { amount: -12 } }] },
 *   ],
 * }, 'out.mp4');
 * ```
 */

import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegProgress } from '../core/ffmpeg-spawn.js';
import { probeVideo } from '../core/probe.js';
import { ConfigError } from '../errors.js';
import { planTimeline } from './timeline.js';
import { buildComposeGraph, fpsNumber } from './graph.js';
import { buildTextOverlayAss } from './text-overlay.js';
import type { TextOverlay, VixelSpec } from './schema.js';
import type { BaseGeneratorConfig } from '../types/generators.js';

function collectTextOverlays(spec: VixelSpec): TextOverlay[] {
  const out: TextOverlay[] = [];
  for (const t of spec.tracks) if (t.type === 'overlay') for (const it of t.items) if (it.kind === 'text') out.push(it);
  return out;
}

/** Upper bound on clip count (keeps the filter_complex within OS arg limits). */
const MAX_CLIPS = 200;

/**
 * Reject specs using features the v1 renderer can't honor, rather than silently
 * dropping them — an agent must know overlays/animation didn't render.
 */
function assertRenderable(spec: VixelSpec): void {
  for (const t of spec.tracks) {
    if (t.type !== 'overlay') continue;
    for (const it of t.items) {
      // fadeIn/fadeOut render; slide/pop overlay entrances are not wired yet.
      if (it.in && it.in !== 'fadeIn' && it.in !== 'none') {
        throw new ConfigError(`compose v1 supports overlay in:'fadeIn' (got '${it.in}'); slide/pop coming soon`);
      }
      if (it.out && it.out !== 'fadeOut' && it.out !== 'none') {
        throw new ConfigError(`compose v1 supports overlay out:'fadeOut' (got '${it.out}'); slide/pop coming soon`);
      }
    }
  }
  const video = spec.tracks.find((t) => t.type === 'video');
  if (video?.type === 'video') {
    if (video.clips.length > MAX_CLIPS) {
      throw new ConfigError(`too many clips: ${video.clips.length} > ${MAX_CLIPS}`);
    }
    for (const c of video.clips) {
      if (c.fit && c.fit !== 'contain') {
        throw new ConfigError(`compose v1 only supports fit:"contain" (got "${c.fit}")`, { context: { fit: c.fit } });
      }
    }
  }
  const audioItems = spec.tracks.filter((t) => t.type === 'audio').reduce((n, t) => n + (t.type === 'audio' ? t.items.length : 0), 0);
  if (audioItems > 1) {
    throw new ConfigError(`compose v1 supports a single music bed; got ${audioItems} audio items`);
  }
}

export interface ComposeConfig extends BaseGeneratorConfig {
  /** x264 preset (default `veryfast`). */
  preset?: string;
  /** x264 CRF (default 20). */
  crf?: number;
  onProgress?: (p: SpawnFFmpegProgress) => void;
}

export interface ComposeResult {
  outputPath: string;
  /** Total output duration (seconds). */
  durationSec: number;
  width: number;
  height: number;
}

export async function compose(
  spec: VixelSpec,
  outputPath: string,
  config: ComposeConfig = {},
): Promise<ComposeResult> {
  const videoTrack = spec.tracks.find((t) => t.type === 'video');
  if (!videoTrack || videoTrack.type !== 'video' || videoTrack.clips.length === 0) {
    throw new ConfigError('compose needs a `video` track with at least one clip');
  }
  assertRenderable(spec);

  // Snap to the output frame grid so cuts are frame-exact (no float drift).
  const plan = planTimeline(videoTrack.clips, fpsNumber(spec.output.fps));
  const ffmpegPath = config.ffmpegPath ?? 'ffmpeg';
  const ffprobePath = config.ffprobePath ?? 'ffprobe';

  // Probe each clip for its audio stream + duration so the graph can synthesize
  // silence where a clip has none, and so we can reject a trim that overruns the
  // source (which would silently break the timeline). Dry-run can't probe →
  // assume audio present for the command preview.
  let clipHasAudio: boolean[];
  if (config.dryRun) {
    clipHasAudio = plan.clips.map(() => true);
  } else {
    const probes = await Promise.all(
      plan.clips.map((c) =>
        probeVideo(c.source, ffprobePath)
          .then((m) => ({ hasAudio: m.hasAudio, duration: m.duration }))
          .catch(() => ({ hasAudio: false, duration: 0 })),
      ),
    );
    plan.clips.forEach((c, i) => {
      const src = probes[i]!;
      if (src.duration > 0 && c.trimStart + c.duration > src.duration + 0.05) {
        throw new ConfigError(
          `clip trim overruns the source: needs ${(c.trimStart + c.duration).toFixed(2)}s but source is ${src.duration.toFixed(2)}s`,
          { context: { source: c.source, in: c.trimStart, duration: c.duration, sourceDuration: src.duration } },
        );
      }
    });
    clipHasAudio = probes.map((p) => p.hasAudio);
  }

  // Burn text overlays via libass: author one ASS doc, write a temp file, and
  // let the graph apply it after the image overlays.
  const textOverlays = collectTextOverlays(spec);
  let assPath: string | undefined;
  if (textOverlays.length > 0 && !config.dryRun) {
    assPath = join(tmpdir(), `vixel-compose-${randomBytes(6).toString('hex')}.ass`);
    await writeFile(assPath, buildTextOverlayAss(textOverlays, spec.output), 'utf8');
  }

  try {
    const graph = buildComposeGraph({ spec, plan, clipHasAudio, ...(assPath ? { captionsAssPath: assPath } : {}) });
    const F = fpsNumber(spec.output.fps);

    const args: string[] = [];
    for (const inp of graph.inputs) {
      if (inp.options) args.push(...inp.options); // per-input flags (e.g. -loop 1 for a still overlay)
      args.push('-i', inp.source);
    }
    args.push('-filter_complex', graph.filterComplex);
    args.push('-map', graph.videoLabel);
    if (graph.audioLabel) args.push('-map', graph.audioLabel);
    args.push(
      '-c:v', 'libx264',
      '-preset', config.preset ?? 'veryfast',
      '-crf', String(config.crf ?? 20),
      '-pix_fmt', 'yuv420p',
      '-r', String(F),
      '-movflags', '+faststart',
    );
    if (graph.audioLabel) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000');
    } else {
      args.push('-an');
    }
    // `-shortest` bounds the render to the program length — critical when an image
    // overlay is fed via `-loop 1` (an otherwise-infinite input that would hang).
    args.push('-shortest', '-y', outputPath);

    await spawnFFmpeg(ffmpegPath, args, configToSpawnOptions(config, plan.total));

    return { outputPath, durationSec: plan.total, width: spec.output.width, height: spec.output.height };
  } finally {
    if (assPath) await unlink(assPath).catch(() => {});
  }
}
