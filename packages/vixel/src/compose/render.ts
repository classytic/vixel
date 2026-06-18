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
 *     { type: 'visual', sequential: true,
 *       clips: [
 *         { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
 *         { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 3 },
 *       ],
 *       transitions: [{ between: [0, 1], transition: { id: 'dissolve', duration: 0.5 } }],
 *     },
 *     { type: 'audio', items: [{ source: 'music.mp3', role: 'music', duck: { amount: -12 } }] },
 *   ],
 * }, 'out.mp4');
 * ```
 */

import { writeFile, unlink, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnFFmpeg, configToSpawnOptions, type SpawnFFmpegProgress } from '../core/ffmpeg-spawn.js';
import { probeVideo } from '../core/probe.js';
import { resolveToPath } from '../core/media-reference.js';
import { ConfigError } from '../errors.js';
import { planTimeline } from './timeline.js';
import { buildComposeGraph, collectOverlays, mainVisualTrack, fpsNumber } from './graph.js';
import { buildTextOverlayAss } from './text-overlay.js';
import { rasterizeShape } from './shape-raster.js';
import { rasterizeBoxStyle } from './box-style-raster.js';
import { frameToPx } from '@classytic/vixel-schema';
import { toLibplaceboHook, VULKAN_HW_ARGS } from './shader-adapter.js';
import { normalizeSpec } from './schema.js';
import { getEffect, sourceUrl, type EffectRef } from '@classytic/vixel-schema';
import type { VixelSpec } from './schema.js';
import type { BaseGeneratorConfig } from '../types/generators.js';


/** Upper bound on clip count (keeps the filter_complex within OS arg limits). */
const MAX_CLIPS = 200;

/**
 * Reject specs using features the v1 renderer can't honor, rather than silently
 * dropping them — an agent must know overlays/animation didn't render.
 */
function assertRenderable(spec: VixelSpec): void {
  // Overlays no longer gate here: text/image/video composite, shapes rasterize
  // (resvg), and any enter/exit renders (fade exact; slide/pop degrade to fade
  // server-side, full motion in the Pixi preview).
  const main = mainVisualTrack(spec);
  if (main && main.clips.length > MAX_CLIPS) {
    throw new ConfigError(`too many clips: ${main.clips.length} > ${MAX_CLIPS}`);
  }
  // transform.fit (cover/contain/stretch) is honored by the compositor — no restriction.
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
  // Upgrade to the unified shape FIRST — the same `normalizeSpec` the editor runs
  // on load — so a spec authored with `place`/shape-presets/legacy fields renders
  // identically here and in the Pixi preview. Idempotent; the one contract gate.
  spec = normalizeSpec(spec);

  const videoTrack = mainVisualTrack(spec);
  if (!videoTrack || videoTrack.clips.length === 0) {
    throw new ConfigError('compose needs a sequential `visual` main track with at least one clip');
  }
  assertRenderable(spec);

  // Snap to the output frame grid so cuts are frame-exact (no float drift). The
  // main track's first-class `transitions[]` drive the per-gap cross-dissolves.
  const plan = planTimeline(videoTrack.clips, fpsNumber(spec.output.fps), videoTrack.transitions);
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

  // Burn text overlays via libass — ONE ASS file per text overlay, keyed by its
  // z-order, so the graph can interleave each at its own z (a text layer can sit
  // behind a later image/video overlay).
  const textAssLayers: { order: number; assPath: string }[] = [];
  if (!config.dryRun) {
    for (const layer of collectOverlays(spec)) {
      if (layer.kind !== 'text') continue;
      const p = join(tmpdir(), `vixel-text-${layer.order}-${randomBytes(6).toString('hex')}.ass`);
      await writeFile(p, buildTextOverlayAss([layer.clip], spec.output), 'utf8');
      textAssLayers.push({ order: layer.order, assPath: p });
    }
  }

  // Custom fonts: copy every text overlay's `style.fontFile` into one temp
  // fontsdir so libass can resolve it by family name (the Style's Fontname).
  let fontsDir: string | undefined;
  if (!config.dryRun) {
    const fontFiles = new Set<string>();
    for (const layer of collectOverlays(spec)) {
      if (layer.kind !== 'text') continue;
      const media = layer.clip.media;
      const f = media.kind === 'text' ? media.style?.fontFile : undefined;
      if (f) fontFiles.add(f);
    }
    if (fontFiles.size > 0) {
      fontsDir = join(tmpdir(), `vixel-fonts-${randomBytes(6).toString('hex')}`);
      await mkdir(fontsDir, { recursive: true });
      await Promise.all(
        [...fontFiles].map((f) => copyFile(resolveToPath(f), join(fontsDir!, basename(f)))),
      );
    }
  }

  // Probe each VIDEO overlay for its audio stream + duration, so the graph mixes
  // overlay audio only when present and an overrunning trim fails loudly. Keyed by
  // collectOverlays order to line up with the graph's z-ordered layer list.
  const overlayHasAudio: { order: number; hasAudio: boolean }[] = [];
  for (const layer of collectOverlays(spec)) {
    if (layer.kind !== 'video') continue;
    if (config.dryRun) {
      overlayHasAudio.push({ order: layer.order, hasAudio: true });
      continue;
    }
    const clip = layer.clip;
    const media = clip.media;
    if (media.kind !== 'video') continue;
    const m = await probeVideo(resolveToPath(media.source), ffprobePath)
      .then((r) => ({ hasAudio: r.hasAudio, duration: r.duration }))
      .catch(() => ({ hasAudio: false, duration: 0 }));
    const trimStart = media.trimStart ?? 0;
    if (m.duration > 0 && trimStart + clip.duration > m.duration + 0.05) {
      throw new ConfigError(
        `video overlay trim overruns the source: needs ${(trimStart + clip.duration).toFixed(2)}s but source is ${m.duration.toFixed(2)}s`,
        { context: { source: sourceUrl(media.source), trimStart, duration: clip.duration, sourceDuration: m.duration } },
      );
    }
    overlayHasAudio.push({ order: layer.order, hasAudio: m.hasAudio });
  }

  // Rasterize each shape overlay to a transparent PNG (resvg), keyed by
  // collectOverlays order, so the graph composites it like an image overlay. A
  // frosted shape also writes a silhouette mask PNG for the backdrop-blur chain.
  type ShapePngLayer = {
    order: number;
    path: string;
    xPx: number;
    yPx: number;
    backdrop?: { maskPath: string; blur: number; x: number; y: number; w: number; h: number };
  };
  const shapePngLayers: ShapePngLayer[] = [];
  if (!config.dryRun) {
    for (const layer of collectOverlays(spec)) {
      if (layer.kind !== 'shape') continue;
      const r = await rasterizeShape(layer.clip, spec.output.width, spec.output.height);
      const p = join(tmpdir(), `vixel-shape-${layer.order}-${randomBytes(6).toString('hex')}.png`);
      await writeFile(p, r.data);
      const entry: ShapePngLayer = { order: layer.order, path: p, xPx: r.xPx, yPx: r.yPx };
      if (r.backdrop) {
        const mp = join(tmpdir(), `vixel-shapemask-${layer.order}-${randomBytes(6).toString('hex')}.png`);
        await writeFile(mp, r.backdrop.mask);
        entry.backdrop = { maskPath: mp, blur: r.backdrop.blur, x: r.backdrop.x, y: r.backdrop.y, w: r.backdrop.w, h: r.backdrop.h };
      }
      shapePngLayers.push(entry);
    }
  }

  // Rasterize each image/video overlay's `transform.style` (rounded corners /
  // border / shadow) to PNG layer(s), keyed by collectOverlays order, so the graph
  // alphamerges the rounded mask + overlays the border + underlays the shadow —
  // matching the Pixi preview. The box px mirror the graph's frame-box math
  // (frameToPx, or W×H when boxless). resvg is OPTIONAL: if it's missing we skip
  // the styling for this clip and render it unstyled rather than crash.
  type BoxStylePngLayer = {
    order: number;
    maskPath?: string;
    borderPath?: string;
    shadow?: { path: string; padX: number; padY: number; offX: number; offY: number };
  };
  const boxStylePngLayers: BoxStylePngLayer[] = [];
  const boxStyleTempFiles: string[] = [];
  if (!config.dryRun) {
    const W = spec.output.width;
    const H = spec.output.height;
    for (const layer of collectOverlays(spec)) {
      if (layer.kind !== 'image' && layer.kind !== 'video') continue;
      const style = layer.clip.transform?.style;
      if (!style) continue;
      const hasStyle = (style.radius && style.radius > 0) || style.border || style.shadow;
      if (!hasStyle) continue;
      // Box px = the clip's frame box (or full canvas when boxless), same as the
      // graph forces the clip to before masking.
      const fr = layer.clip.transform?.frame;
      const box = fr ? frameToPx(fr, W, H) : { w: W, h: H };
      let r;
      try {
        r = await rasterizeBoxStyle(style, box.w, box.h);
      } catch {
        continue; // resvg absent → degrade: composite the clip unstyled.
      }
      const entry: BoxStylePngLayer = { order: layer.order };
      if (r.mask) {
        const p = join(tmpdir(), `vixel-boxmask-${layer.order}-${randomBytes(6).toString('hex')}.png`);
        await writeFile(p, r.mask);
        entry.maskPath = p;
        boxStyleTempFiles.push(p);
      }
      if (r.border) {
        const p = join(tmpdir(), `vixel-boxborder-${layer.order}-${randomBytes(6).toString('hex')}.png`);
        await writeFile(p, r.border);
        entry.borderPath = p;
        boxStyleTempFiles.push(p);
      }
      if (r.shadow) {
        const p = join(tmpdir(), `vixel-boxshadow-${layer.order}-${randomBytes(6).toString('hex')}.png`);
        await writeFile(p, r.shadow.data);
        entry.shadow = { path: p, padX: r.shadow.pad, padY: r.shadow.pad, offX: r.shadow.offX, offY: r.shadow.offY };
        boxStyleTempFiles.push(p);
      }
      if (entry.maskPath || entry.borderPath || entry.shadow) boxStylePngLayers.push(entry);
    }
  }

  // `shader`-kind effects → a libplacebo `.hook` temp per id (the canonical vixel
  // shader wrapped for ffmpeg's Vulkan GPU path). Skipped in dry-run / when a pack
  // declares the effect ffmpeg-unsupported.
  const shaderPaths = new Map<string, string>();
  const shaderTempFiles: string[] = [];
  if (!config.dryRun) {
    const refs: EffectRef[] = [];
    for (const t of spec.tracks) {
      if (t.type !== 'visual') continue;
      for (const c of t.clips) {
        if (c.effects) refs.push(...c.effects);
        if (c.media.kind === 'effect') refs.push(c.media.effect);
      }
    }
    for (const ref of refs) {
      if (shaderPaths.has(ref.id)) continue;
      const d = getEffect(ref.id);
      if (d?.kind === 'shader' && d.source && !d.unsupported?.includes('ffmpeg')) {
        const p = join(tmpdir(), `vixel-shader-${randomBytes(6).toString('hex')}.hook`);
        await writeFile(p, toLibplaceboHook(d.name ?? ref.id, d.source, ref.params), 'utf8');
        shaderPaths.set(ref.id, p);
        shaderTempFiles.push(p);
      }
    }
  }

  try {
    const graph = buildComposeGraph({
      spec,
      plan,
      clipHasAudio,
      textAssLayers,
      overlayHasAudio,
      shapePngLayers,
      boxStylePngLayers,
      ...(fontsDir ? { fontsDir } : {}),
      ...(shaderPaths.size ? { shaderPaths } : {}),
    });
    const F = fpsNumber(spec.output.fps);

    const args: string[] = [];
    // libplacebo shader effects need a Vulkan device (global, before inputs).
    if (shaderPaths.size > 0) args.push(...VULKAN_HW_ARGS);
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
    for (const l of textAssLayers) await unlink(l.assPath).catch(() => {});
    for (const s of shapePngLayers) {
      await unlink(s.path).catch(() => {});
      if (s.backdrop) await unlink(s.backdrop.maskPath).catch(() => {});
    }
    for (const p of boxStyleTempFiles) await unlink(p).catch(() => {});
    for (const p of shaderTempFiles) await unlink(p).catch(() => {});
    if (fontsDir) await rm(fontsDir, { recursive: true, force: true }).catch(() => {});
  }
}
