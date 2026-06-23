/**
 * In-browser MP4 export — the SAME Pixi renderer as the live preview, stepped
 * frame-by-frame into WebCodecs + a pure-TS MP4 muxer. WYSIWYG by construction:
 * preview and export are one code path ({@link renderScene}). Zero server cost
 * for shorts; the server (ffmpeg) stays the fallback for long/4K/no-WebCodecs.
 *
 * `pixi.js` and `mp4-muxer` are dynamically imported (optional deps), so this
 * subpath only pulls them in when you actually export.
 *
 * Renderer note: inits Pixi with `preference: 'webgl'` for the broadest VideoFrame
 * capture support today; flip to `'webgpu'` once parity is proven (Pixi v8 is
 * renderer-agnostic, so this is the only line that changes).
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import { registerSpecPacks } from '@classytic/vixel-schema';
import { preloadAssets, renderScene, awaitVideoSeeks, loadEffectTextures, createApp as createPixiApp, destroyApp, type MediaCache } from '../preview/pixi/index.js';
import { totalDurationSec } from '../shared/utils/spec.js';
import { renderAudioMix, AUDIO_SAMPLE_RATE } from './audio.js';
import { glFinish, waitEncoderQueue, gopInterval } from './scheduler.js';
import { awaitFontsReady } from './readiness.js';
import { createExportSink, estimateExportBytes, type ExportSinkMode } from './opfs-sink.js';

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  /** 0..1. */
  ratio: number;
}

export interface ExportOptions {
  /** Output frame rate (default: the spec's `output.fps`). */
  fps?: number;
  /** Target H.264 bitrate (bps). Default scales with the OUTPUT resolution × fps. */
  bitrate?: number;
  /**
   * Quality ladder: a device-pixel multiplier over the spec's authored dims (default
   * 1). The SAME composition renders at a higher resolution — e.g. a 1280×720 (16:9)
   * project at `scale: 1.5` exports 1920×1080, at `scale: 3` exports 4K — with NO
   * re-authoring (logical coords unchanged; only the physical canvas scales). Use
   * scales that keep dims even (0.5 / 0.75 / 1 / 1.5 / 2 / 3). Clamped to [0.25, 4].
   */
  scale?: number;
  antialias?: boolean;
  /**
   * Where the muxed bytes go: `'auto'` (default) streams large exports to OPFS so
   * long / 4K renders don't OOM the tab (bounded RAM), and buffers shorts in memory
   * (fast-start MP4). `'memory'` / `'opfs'` force one path. See {@link createExportSink}.
   */
  stream?: ExportSinkMode;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

/** Is fully client-side MP4 export available here? (WebCodecs present.) */
export function canExportInBrowser(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Is this composition within a sane in-browser budget? Beyond it (long-form or
 * very high-res), the host should route to the server (ffmpeg) renderer where
 * browser memory isn't the ceiling. Shorts (≤3 min, ≤1440p) export in-browser.
 */
export function withinBrowserBudget(spec: VixelSpec): boolean {
  return totalDurationSec(spec) <= 180 && spec.output.width * spec.output.height <= 2560 * 1440;
}

const fpsOf = (fps: VixelSpec['output']['fps']): number => (typeof fps === 'number' ? fps : fps.num / fps.den);
const even = (n: number): number => (n % 2 === 0 ? n : n - 1); // H.264 needs even dimensions
const estimateBitrate = (w: number, h: number, fps: number): number => Math.round(w * h * fps * 0.07);

/**
 * Render a {@link VixelSpec} to an MP4 {@link Blob} entirely in the browser.
 * Throws if WebCodecs is unavailable (caller should fall back to server export).
 * VIDEO only in this slice — audio is the next phase.
 */
export async function exportToMp4(spec: VixelSpec, opts: ExportOptions = {}): Promise<Blob> {
  if (!canExportInBrowser()) {
    throw new Error('WebCodecs is unavailable in this browser — use the server export fallback.');
  }
  const PIXI = await import('pixi.js');
  const { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } = await import('mp4-muxer');

  const W = even(spec.output.width);
  const H = even(spec.output.height);
  const fps = opts.fps ?? fpsOf(spec.output.fps);
  const totalFrames = Math.max(1, Math.round(totalDurationSec(spec) * fps));
  // Quality ladder: render the logical W×H scene at a device-pixel multiplier so the
  // physical canvas (→ VideoFrame) is W·scale × H·scale (720p/1080p/4K of one comp).
  const scale = Math.max(0.25, Math.min(opts.scale ?? 1, 4));
  const US = 1_000_000;

  // Single app owner (pixi/app.ts): shares init incl. advanced-blend registration
  // + useBackBuffer + releaseGlobalResources-on-destroy with the preview.
  const app = await createPixiApp(PIXI, {
    width: W,
    height: H,
    background: spec.output.background ?? '#000000',
    antialias: opts.antialias ?? true,
    preference: 'webgl',
    resolution: scale,
  });

  // PHYSICAL output dims = what the canvas actually holds (W·scale, even for ladder
  // scales) — the single source of truth so VideoFrame size == encoder dims exactly.
  const outW = even((app.canvas as HTMLCanvasElement).width);
  const outH = even((app.canvas as HTMLCanvasElement).height);
  const bitrate = opts.bitrate ?? estimateBitrate(outW, outH, fps);

  registerSpecPacks(spec); // self-contained inline packs must resolve before preload/render
  const cache: MediaCache = new Map();
  // Decode + mix audio up front (so the muxer is configured with both tracks).
  const [, audio] = await Promise.all([
    preloadAssets(PIXI, spec, cache),
    renderAudioMix(spec).catch(() => null),
    // Determinism/readiness: text must not rasterize with a FALLBACK font mid-export
    // (the wrong-font / white-box class). Block until web fonts are ready.
    awaitFontsReady(),
    loadEffectTextures(PIXI, spec), // BYO shader texture INPUTS bound during render (kept last: preserves `audio` index)
  ]);
  const numCh = audio?.numberOfChannels ?? 2;

  // Output sink: stream large renders to OPFS (bounded RAM) so a long / 4K export
  // stays fully client-side without OOM; buffer shorts in memory (fast-start).
  const sink = await createExportSink(
    { ArrayBufferTarget, FileSystemWritableFileStreamTarget },
    opts.stream ?? 'auto',
    estimateExportBytes(bitrate, totalDurationSec(spec)),
  );
  const muxer = new Muxer({
    target: sink.target as InstanceType<typeof ArrayBufferTarget>,
    video: { codec: 'avc', width: outW, height: outH },
    ...(audio ? { audio: { codec: 'aac', sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: numCh } } : {}),
    fastStart: sink.fastStart,
  });
  // WebCodecs error callbacks run on a separate task — a `throw` there can't reject
  // this promise. Capture it and surface it on the next loop tick / after flush, so
  // a failed encode never returns a truncated MP4.
  let encoderError: Error | null = null;
  const onEncErr = (e: DOMException) => {
    encoderError = encoderError ?? new Error(`encoder failed: ${e.message}`);
  };
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: onEncErr });
  encoder.configure({ codec: 'avc1.640028', width: outW, height: outH, bitrate, framerate: fps });

  const audioEncoder = audio
    ? new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: onEncErr })
    : null;
  audioEncoder?.configure({ codec: 'mp4a.40.2', sampleRate: AUDIO_SAMPLE_RATE, numberOfChannels: numCh, bitrate: 128_000 });

  const gopSize = gopInterval(fps); // keyframe cadence (~3s)

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (encoderError) throw encoderError;
      if (opts.signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
      const t = i / fps;
      await awaitVideoSeeks(spec, t, cache); // frame-accurate source video
      renderScene(PIXI, app, spec, t, cache);
      // Drain the GPU pipeline BEFORE capture — without this the browser paces
      // VideoFrame capture to the display refresh (vsync), capping export at ~realtime.
      glFinish(app.canvas);
      const frame = new VideoFrame(app.canvas as HTMLCanvasElement, {
        timestamp: Math.round((i * US) / fps),
        duration: Math.round(US / fps),
        // Crop to the even encoder dims so frame size == configured size exactly
        // (a no-op for ladder scales, where the canvas is already even).
        visibleRect: { x: 0, y: 0, width: outW, height: outH },
      });
      encoder.encode(frame, { keyFrame: i % gopSize === 0 });
      frame.close();
      opts.onProgress?.({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames });
      // Backpressure: pause the render loop until the encoder queue drains, so a fast
      // loop can't flood it and OOM at 4K / long timelines (also lets the UI breathe).
      await waitEncoderQueue(encoder);
    }
    if (audio && audioEncoder) encodeAudioBuffer(audio, audioEncoder);
    await encoder.flush();
    await audioEncoder?.flush();
    if (encoderError) throw encoderError; // a failure during flush must not yield a partial MP4
    muxer.finalize();
    return await sink.finalize(); // ArrayBuffer Blob (memory) or disk-backed File (OPFS)
  } finally {
    try {
      encoder.close();
      audioEncoder?.close();
    } catch {
      /* already closed / errored */
    }
    destroyApp(app);
  }
}

/** Feed a rendered AudioBuffer to the AudioEncoder in `f32-planar` chunks. */
function encodeAudioBuffer(audio: AudioBuffer, encoder: AudioEncoder): void {
  const numCh = audio.numberOfChannels;
  const len = audio.length;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(audio.getChannelData(c));
  const CHUNK = 4096;
  for (let off = 0; off < len; off += CHUNK) {
    const frames = Math.min(CHUNK, len - off);
    const planar = new Float32Array(frames * numCh);
    for (let c = 0; c < numCh; c++) planar.set(channels[c].subarray(off, off + frames), c * frames);
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfFrames: frames,
      numberOfChannels: numCh,
      timestamp: Math.round((off / AUDIO_SAMPLE_RATE) * 1_000_000),
      data: planar,
    });
    encoder.encode(ad);
    ad.close();
  }
}
