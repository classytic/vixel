/**
 * Video Pipeline
 * ==============
 * Fluent, composable multi-step video editing. Chain operations together and
 * the pipeline handles intermediate temp files, cleanup, cancellation, and
 * command capture for you — no manual file juggling.
 *
 * @example
 * ```typescript
 * import { pipeline } from '@classytic/vixel';
 *
 * const result = await pipeline('./input.mp4')
 *   .trim({ start: 10, end: 40 })
 *   .watermark({ type: 'image', imagePath: './logo.png', position: 'bottom-right' })
 *   .compress({ crf: 23, preset: 'fast' })
 *   .run('./output.mp4');
 *
 * // Inspect the exact ffmpeg commands without running anything:
 * const commands = await pipeline('./input.mp4')
 *   .trim({ start: 0, end: 5 })
 *   .speed({ speed: 2 })
 *   .toCommands('./out.mp4');
 * commands.forEach((c) => console.log(c.command));
 *
 * // Cancellable + overall progress:
 * const ac = new AbortController();
 * await pipeline(source, { signal: ac.signal, onProgress: (p) => render(p.overall) })
 *   .compress({ crf: 28 })
 *   .run('./out.mp4');
 * ```
 */

import { tmpdir } from 'node:os';
import type { VideoSource, GeneratorCommand } from './types/generators.js';
import type { TrimConfig } from './generators/trim/types.js';
import type { WatermarkConfig } from './generators/watermark/types.js';
import type { CropResizeConfig } from './generators/crop-resize/types.js';
import type { CompressionConfig } from './generators/compression/types.js';
import type { SpeedConfig } from './generators/speed/types.js';
import type { ConvertConfig } from './generators/convert/types.js';
import type { AudioMixConfig } from './generators/audio-mix/types.js';
import type { CaptionConfig } from './generators/captions/types.js';
import type { ReframeConfig } from './generators/reframe/types.js';
import type { FadeConfig } from './generators/fade/types.js';
import type { ColorAdjustConfig, ColorLutConfig } from './generators/color/types.js';
import type { GlowConfig } from './generators/glow/types.js';
import type { OverlayConfig } from './generators/overlay/types.js';
import type { FFmpegFilterConfig } from './types/building-blocks.js';
import { trimVideo } from './generators/trim/generator.js';
import { addWatermark } from './generators/watermark/generator.js';
import { cropResize } from './generators/crop-resize/generator.js';
import { compressVideo } from './generators/compression/generator.js';
import { changeSpeed } from './generators/speed/generator.js';
import { convertFormat } from './generators/convert/generator.js';
import { mixAudio } from './generators/audio-mix/generator.js';
import { burnCaptions } from './generators/captions/generator.js';
import { reframe } from './generators/reframe/generator.js';
import { fade } from './generators/fade/generator.js';
import { adjustColor, applyLut } from './generators/color/generator.js';
import { glow } from './generators/glow/generator.js';
import { overlay } from './generators/overlay/generator.js';
import { applyFFmpegFilter } from './core/ffmpeg-filter.js';
import { TempFileManager } from './core/temp-manager.js';
import { VixelError, ErrorCode } from './errors.js';

/** Progress reported as a pipeline runs. */
export interface PipelineProgress {
  /** 0-100 across the whole pipeline. */
  overall: number;
  /** Zero-based index of the step currently running. */
  stepIndex: number;
  /** Total number of steps. */
  stepCount: number;
  /** Label of the current step (e.g. "trim", "watermark"). */
  step: string;
  /** 0-100 within the current step. */
  stepProgress: number;
}

export interface PipelineOptions {
  /** ffmpeg binary path (default: 'ffmpeg'). */
  ffmpegPath?: string;
  /** ffprobe binary path (default: 'ffprobe'). */
  ffprobePath?: string;
  /** Per-process timeout in ms. */
  timeout?: number;
  /** Abort the whole pipeline. */
  signal?: AbortSignal;
  /** Overall + per-step progress. */
  onProgress?: (progress: PipelineProgress) => void;
  /** Directory for intermediate temp files (default: OS temp dir). */
  tempDir?: string;
}

export interface PipelineResult {
  /** Final output path. */
  outputPath: string;
  /** Ordered labels of the steps that ran. */
  steps: string[];
  /** Exact ffmpeg commands that were executed (or planned, in dry-run). */
  commands: GeneratorCommand[];
}

/** Per-step control injected by the pipeline runner. */
interface StepControl {
  signal?: AbortSignal | undefined;
  dryRun?: boolean | undefined;
  timeout?: number | undefined;
  ffmpegPath?: string | undefined;
  ffprobePath?: string | undefined;
  onCommand: (cmd: GeneratorCommand) => void;
  onStepProgress: (pct: number) => void;
}

interface Step {
  label: string;
  /** Output file extension (without dot). */
  ext: string;
  /** Runs the generator; returns the new duration (seconds) if known. */
  run: (input: VideoSource, output: string, ctrl: StepControl) => Promise<number | undefined>;
}

let pipelineCounter = 0;

export class VideoPipeline {
  private readonly steps: Step[] = [];
  private readonly options: PipelineOptions;
  private readonly source: VideoSource | string;
  private readonly id: number;

  constructor(source: VideoSource | string, options: PipelineOptions = {}) {
    this.source = source;
    this.options = options;
    this.id = ++pipelineCounter;
  }

  /** Trim to a time range. */
  trim(config: TrimConfig): this {
    this.steps.push({
      label: 'trim',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        trimVideo(input, output, this.merge(config, ctrl)).then((r) => r.duration),
    });
    return this;
  }

  /** Overlay an image or text watermark. */
  watermark(config: WatermarkConfig): this {
    this.steps.push({
      label: 'watermark',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        addWatermark(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Crop / resize to a target aspect ratio or dimensions. */
  crop(config: CropResizeConfig): this {
    this.steps.push({
      label: 'crop',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        cropResize(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Alias for {@link crop} — resize semantics are configured via the same generator. */
  resize(config: CropResizeConfig): this {
    return this.crop(config);
  }

  /** Re-encode with a target quality. */
  compress(config: CompressionConfig = {}): this {
    this.steps.push({
      label: 'compress',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        compressVideo(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Speed up or slow down. */
  speed(config: SpeedConfig): this {
    this.steps.push({
      label: 'speed',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        changeSpeed(input, output, this.merge(config, ctrl)).then(
          () => (input.duration > 0 ? input.duration / config.speed : undefined),
        ),
    });
    return this;
  }

  /** Convert container/format. */
  convert(config: ConvertConfig): this {
    this.steps.push({
      label: 'convert',
      ext: config.format,
      run: (input, output, ctrl) =>
        convertFormat(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Layer voiceover and/or background music (with optional ducking). */
  mixAudio(config: AudioMixConfig): this {
    this.steps.push({
      label: 'mixAudio',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        mixAudio(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Burn in subtitles (.srt/.ass) or a styled text overlay. */
  captions(config: CaptionConfig): this {
    this.steps.push({
      label: 'captions',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        burnCaptions(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Re-aspect for a different surface (vertical, square, …). */
  reframe(config: ReframeConfig): this {
    this.steps.push({
      label: 'reframe',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        reframe(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Fade in/out (video + audio). */
  fade(config: FadeConfig): this {
    this.steps.push({
      label: 'fade',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        fade(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Color/quality adjustment (brightness/contrast/saturation/gamma/sharpen). */
  adjust(config: ColorAdjustConfig): this {
    this.steps.push({
      label: 'adjust',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        adjustColor(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Apply a 3D LUT (.cube) for a graded look. */
  lut(config: ColorLutConfig): this {
    this.steps.push({
      label: 'lut',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        applyLut(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Soft luminance bloom / glow. */
  glow(config: GlowConfig = {}): this {
    this.steps.push({
      label: 'glow',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        glow(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Composite an atmosphere overlay (light leak / particles / bokeh / flare). */
  overlay(config: OverlayConfig): this {
    this.steps.push({
      label: 'overlay',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        overlay(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Apply an arbitrary FFmpeg filter (escape hatch for anything else). */
  filter(config: FFmpegFilterConfig): this {
    this.steps.push({
      label: 'filter',
      ext: 'mp4',
      run: (input, output, ctrl) =>
        applyFFmpegFilter(input, output, this.merge(config, ctrl)).then(() => input.duration),
    });
    return this;
  }

  /** Number of queued steps. */
  get length(): number {
    return this.steps.length;
  }

  /**
   * Execute the pipeline, writing the final result to `outputPath`.
   * Intermediate files are created in the temp dir and always cleaned up.
   */
  async run(outputPath: string): Promise<PipelineResult> {
    return this.execute(outputPath, false);
  }

  /**
   * Build every ffmpeg command without executing any of them. Useful for
   * debugging, cost estimation, and approval workflows.
   */
  async toCommands(outputPath: string): Promise<GeneratorCommand[]> {
    const result = await this.execute(outputPath, true);
    return result.commands;
  }

  // ---------------------------------------------------------------------------

  private merge<T extends object>(config: T, ctrl: StepControl): T {
    return {
      ...config,
      ffmpegPath: ctrl.ffmpegPath,
      ffprobePath: ctrl.ffprobePath,
      timeout: ctrl.timeout,
      signal: ctrl.signal,
      dryRun: ctrl.dryRun,
      onCommand: ctrl.onCommand,
      // Generators report `percentage`; the filter escape hatch reports `percent`.
      onProgress: (p: { percentage?: number; percent?: number }) =>
        ctrl.onStepProgress(p.percentage ?? p.percent ?? 0),
    } as T;
  }

  private async execute(outputPath: string, dryRun: boolean): Promise<PipelineResult> {
    if (this.steps.length === 0) {
      throw new VixelError('Pipeline has no steps', ErrorCode.INVALID_CONFIG);
    }

    const { signal, onProgress, timeout, ffmpegPath, ffprobePath } = this.options;
    const tempDir = this.options.tempDir ?? tmpdir();
    const commands: GeneratorCommand[] = [];
    const temp = new TempFileManager();

    let current = await this.resolveSource(dryRun);
    const stepCount = this.steps.length;

    try {
      for (let i = 0; i < stepCount; i++) {
        if (signal?.aborted) {
          throw new VixelError('Pipeline aborted', ErrorCode.ABORTED);
        }
        const step = this.steps[i]!;
        const isLast = i === stepCount - 1;
        const stepOut = isLast
          ? outputPath
          : temp.file(`vixel-${this.id}-${i}-${step.label}.${step.ext}`, tempDir);

        const ctrl: StepControl = {
          signal,
          dryRun,
          timeout,
          ffmpegPath,
          ffprobePath,
          onCommand: (cmd) => commands.push(cmd),
          onStepProgress: (pct) => {
            onProgress?.({
              overall: ((i + pct / 100) / stepCount) * 100,
              stepIndex: i,
              stepCount,
              step: step.label,
              stepProgress: pct,
            });
          },
        };

        const newDuration = await step.run(current, stepOut, ctrl);
        onProgress?.({
          overall: ((i + 1) / stepCount) * 100,
          stepIndex: i,
          stepCount,
          step: step.label,
          stepProgress: 100,
        });

        current = {
          inputPath: stepOut,
          duration: newDuration ?? current.duration,
          ...(current.width !== undefined && { width: current.width }),
          ...(current.height !== undefined && { height: current.height }),
        };
      }
    } finally {
      await temp.cleanup();
    }

    return {
      outputPath,
      steps: this.steps.map((s) => s.label),
      commands,
    };
  }

  private async resolveSource(dryRun: boolean): Promise<VideoSource> {
    if (typeof this.source !== 'string') return this.source;
    // In dry-run we don't need real metadata — avoid requiring ffprobe.
    if (dryRun) return { inputPath: this.source, duration: 0 };
    const { probeVideo } = await import('./core/probe.js');
    const meta = await probeVideo(this.source, this.options.ffprobePath);
    return {
      inputPath: this.source,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
    };
  }
}

/** Create a new {@link VideoPipeline}. */
export function pipeline(source: VideoSource | string, options?: PipelineOptions): VideoPipeline {
  return new VideoPipeline(source, options);
}
