/**
 * HLS Variant Encoder
 * ===================
 * Encodes video to HLS with adaptive bitrate variants.
 *
 * Strategies:
 * - Codec Copy: 10-20x faster, for HLS-compatible sources
 * - Re-encode: Quality control, for incompatible codecs or downscaling
 *
 * @module encoding/variant-encoder
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, normalize } from 'node:path';
import type { QualityVariant, VariantInfo, ProgressCallback, HardwareAccel } from '../types/index.js';
import { FFmpegError } from '../types/index.js';
import { probeVideo, type VideoMetadata } from '../core/probe.js';
import { variantToPreset, checkHLSCompatibility, type QualityPreset } from '../core/index.js';
import { Logger } from '../utils/logger.js';
import { detectHardwareAccel, getHardwareEncoder } from '../generators/compression/constants.js';
import { mapWithConcurrency } from '../core/concurrency.js';
import {
  DEFAULT_FFMPEG_TIMEOUT,
  FALLBACK_BANDWIDTH_BY_RESOLUTION,
  DEFAULT_FALLBACK_BANDWIDTH,
  GOP_DURATION_SECONDS,
} from '../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface EncodeOptions {
  inputPath: string;
  outputDir: string;
  variants: QualityVariant[];
  onProgress?: ProgressCallback;
  segmentDuration?: number;
  /** Max variants encoded simultaneously. Default: 2. Prevents OOM. */
  concurrency?: number;
}

export interface EncodeResult {
  variants: VariantInfo[];
  masterPlaylist: string;
}

interface SingleVariantOptions {
  inputPath: string;
  outputDir: string;
  preset: QualityPreset;
  variant: QualityVariant;
  segmentDuration: number;
  metadata: VideoMetadata;
  onProgress: ((p: { percentage: number; current: number; total: number }) => void) | null;
}

interface SingleVariantResult {
  playlistPath: string;
  segmentCount: number;
  bandwidth: number;
}

// =============================================================================
// Encoder Class
// =============================================================================

export class VariantEncoder {
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly timeout: number;
  private readonly logger: Logger;
  private hwAccel: HardwareAccel = 'none';

  constructor(config: { ffmpegPath: string; ffprobePath: string; timeout?: number; logger?: Logger }) {
    this.ffmpegPath = config.ffmpegPath;
    this.ffprobePath = config.ffprobePath;
    this.timeout = config.timeout ?? DEFAULT_FFMPEG_TIMEOUT;
    this.logger = config.logger || new Logger({ debug: false });
  }

  /** Probe for available hardware encoders and cache the best one. */
  async detectHardwareAcceleration(): Promise<HardwareAccel> {
    const available = await detectHardwareAccel(this.ffmpegPath);
    // Priority: nvenc > qsv > vaapi > videotoolbox > none
    for (const preferred of ['nvenc', 'qsv', 'vaapi', 'videotoolbox'] as HardwareAccel[]) {
      if (available.includes(preferred)) {
        this.hwAccel = preferred;
        this.logger.info(`Hardware acceleration: ${preferred}`);
        return preferred;
      }
    }
    this.logger.info('Hardware acceleration: none (software encoding)');
    return 'none';
  }

  async encodeVariants(options: EncodeOptions): Promise<EncodeResult> {
    const { inputPath, outputDir, variants, onProgress, segmentDuration = 4, concurrency = 2 } = options;

    // Probe video
    const metadata = await probeVideo(inputPath, this.ffprobePath);
    this.logger.info(`Video: ${metadata.width}x${metadata.height} @ ${metadata.fps}fps, ${metadata.codec}`);

    await fs.mkdir(outputDir, { recursive: true });

    // Encode variants with a concurrency cap (parallel, but bounded to avoid OOM).
    // Per-variant progress is aggregated into an overall percentage.
    const progressByIndex = new Array<number>(variants.length).fill(0);
    const emitProgress = () => {
      if (!onProgress) return;
      const overall = progressByIndex.reduce((a, b) => a + b, 0) / variants.length;
      onProgress({
        percent: overall,
        currentTime: (overall / 100) * metadata.duration,
        targetDuration: metadata.duration,
      });
    };

    const encoded = await mapWithConcurrency(variants, Math.max(1, concurrency), async (variant, i) => {
      const preset = variantToPreset(variant);
      const variantDir = join(outputDir, `v${i}`);
      await fs.mkdir(variantDir, { recursive: true });
      this.logger.info(`Encoding variant ${i + 1}/${variants.length}: ${variant.name}`);

      const result = await this.encodeSingleVariant({
        inputPath,
        outputDir: variantDir,
        preset,
        variant,
        segmentDuration: variant.segmentDuration ?? segmentDuration,
        metadata,
        onProgress: onProgress
          ? (p) => {
              progressByIndex[i] = p.percentage;
              emitProgress();
            }
          : null,
      });

      return { ...result, preset, index: i };
    });

    const results: Array<SingleVariantResult & { preset: QualityPreset; index: number }> = encoded;

    // Create master playlist
    const masterPath = join(outputDir, 'master.m3u8');
    await this.createMasterPlaylist(masterPath, results);

    // Build variant info
    const variantInfo: VariantInfo[] = await Promise.all(
      results.map(async (r, i) => {
        const variantDir = join(outputDir, `v${i}`);
        const files = await fs.readdir(variantDir);
        const totalSize = await this.calculateSize(variantDir, files);

        return {
          name: variants[i]!.name,
          height: variants[i]!.height,
          playlistPath: `v${i}/playlist.m3u8`,
          segmentCount: r.segmentCount,
          totalSize,
        };
      })
    );

    return { variants: variantInfo, masterPlaylist: masterPath };
  }

  private async encodeSingleVariant(options: SingleVariantOptions): Promise<SingleVariantResult> {
    const { variant, metadata } = options;

    // Determine strategy using core codec detection + resolution matching
    const compat = checkHLSCompatibility(metadata.codec, metadata.audioCodec);
    const resolutionMatch = this.checkResolutionMatch(variant.height, metadata.height);

    // Codec copy requires: compatible codec + matching resolution + zero bitrates
    const canCodecCopy = compat.canCopy && resolutionMatch && variant.videoBitrate === 0;
    const useCodecCopy = variant.encodingMode === 'copy' ||
      (variant.encodingMode !== 'reencode' && canCodecCopy);

    // Warn if codec copy requested but conditions not met
    if (variant.encodingMode === 'copy') {
      if (!compat.canCopy) {
        this.logger.warn(`Codec copy requested but source (${metadata.codec}/${metadata.audioCodec}) not HLS-compatible - will attempt anyway`);
      }
      if (!resolutionMatch) {
        this.logger.warn(`Codec copy requested but resolution mismatch (source: ${metadata.height}p, target: ${variant.height}p) - scaling not possible with copy`);
      }
    }

    this.logger.info(`Strategy: ${useCodecCopy ? 'CODEC_COPY (fast)' : 'RE-ENCODE'}${!resolutionMatch ? ` [scaling ${metadata.height}p → ${variant.height}p]` : ''}`);

    return useCodecCopy
      ? this.encodeWithCodecCopy(options)
      : this.encodeWithReencode(options);
  }

  private async encodeWithCodecCopy(options: SingleVariantOptions): Promise<SingleVariantResult> {
    const { inputPath, outputDir, segmentDuration, metadata, onProgress } = options;
    const playlistPath = join(outputDir, 'playlist.m3u8');

    const args = [
      '-i', normalize(inputPath), '-y',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'hls',
      '-hls_time', String(segmentDuration),
      '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', normalize(join(outputDir, 'segment_%03d.ts')),
      normalize(playlistPath),
    ];

    return this.executeFFmpeg(args, outputDir, metadata, onProgress);
  }

  private async encodeWithReencode(options: SingleVariantOptions): Promise<SingleVariantResult> {
    const { inputPath, outputDir, preset, segmentDuration, metadata, onProgress } = options;
    const playlistPath = join(outputDir, 'playlist.m3u8');
    const gopSize = Math.round(metadata.fps * GOP_DURATION_SECONDS);

    // Use hardware encoder when available, fall back to libx264
    const hwEncoder = this.hwAccel !== 'none'
      ? getHardwareEncoder('libx264', this.hwAccel)
      : null;
    const videoCodec = hwEncoder ?? 'libx264';
    const qualityArgs: string[] = hwEncoder
      ? ['-qp', String(Math.round(parseInt(preset.videoBitrate) / 200))] // approximate CRF→QP
      : ['-crf', '23'];

    const args = [
      '-i', normalize(inputPath), '-y',
      // Parallel encoding threads (0 = auto-detect CPU count)
      '-threads', '0',
      // Video
      '-c:v', videoCodec,
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.maxrate,
      '-bufsize', preset.bufsize,
      '-vf', `scale=w=${preset.width}:h=${preset.height}:force_original_aspect_ratio=decrease,format=yuv420p,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
      ...(!hwEncoder ? ['-profile:v', preset.profile, '-level', preset.level] : []),
      '-g', String(gopSize),
      '-keyint_min', String(gopSize),
      '-sc_threshold', '0',
      '-preset', 'fast',
      ...qualityArgs,
      '-avoid_negative_ts', 'make_zero',
      '-force_key_frames', `expr:eq(mod(floor(t),${segmentDuration}),0)`,
      // Audio
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ac', '2',
      '-ar', '48000',
      // HLS
      '-f', 'hls',
      '-hls_time', String(segmentDuration),
      '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', normalize(join(outputDir, 'segment_%03d.ts')),
      normalize(playlistPath),
    ];

    return this.executeFFmpeg(args, outputDir, metadata, onProgress, preset);
  }

  private async executeFFmpeg(
    args: string[],
    outputDir: string,
    metadata: VideoMetadata,
    onProgress: ((p: { percentage: number; current: number; total: number }) => void) | null,
    preset?: QualityPreset
  ): Promise<SingleVariantResult> {
    return new Promise((resolve, reject) => {
      const proc: ChildProcess = spawn(this.ffmpegPath, args);
      let stderr = '';
      let lastProgress = 0;

      // Graceful timeout: SIGTERM first, SIGKILL after 5s if still running
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 5000);
        reject(FFmpegError.timeout(this.timeout, { args }));
      }, this.timeout);

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (onProgress) {
          const match = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (match) {
            const secs = parseInt(match[1]!) * 3600 + parseInt(match[2]!) * 60 + parseFloat(match[3]!);
            const pct = (secs / metadata.duration) * 100;
            if (pct > lastProgress) {
              lastProgress = pct;
              onProgress({ percentage: pct, current: secs, total: metadata.duration });
            }
          }
        }
      });

      proc.on('close', async (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(FFmpegError.failed(code, stderr.slice(-500)));
        }

        const files = await fs.readdir(outputDir);
        const segmentCount = files.filter(f => f.endsWith('.ts')).length;
        const bandwidth = preset
          ? (parseInt(preset.videoBitrate) + parseInt(preset.audioBitrate)) * 1000
          : this.estimateBandwidth(metadata);

        resolve({ playlistPath: join(outputDir, 'playlist.m3u8'), segmentCount, bandwidth });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(FFmpegError.spawn(err));
      });
    });
  }

  private estimateBandwidth(metadata: VideoMetadata): number {
    if (metadata.bitrate > 0) return metadata.bitrate * 1000;
    const heights = Object.keys(FALLBACK_BANDWIDTH_BY_RESOLUTION).map(Number).sort((a, b) => a - b);
    for (const h of heights) {
      if (metadata.height <= h) return FALLBACK_BANDWIDTH_BY_RESOLUTION[h]!;
    }
    return DEFAULT_FALLBACK_BANDWIDTH;
  }

  /**
   * Check if source resolution matches target (within tolerance)
   * Codec copy only works when no scaling is needed
   */
  private checkResolutionMatch(targetHeight: number, sourceHeight: number, tolerance = 10): boolean {
    return Math.abs(sourceHeight - targetHeight) <= tolerance;
  }

  private async createMasterPlaylist(
    path: string,
    variants: Array<SingleVariantResult & { preset: QualityPreset; index: number }>
  ): Promise<void> {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    for (const { preset, bandwidth, index } of variants) {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},NAME="${preset.name}"\n`;
      content += `v${index}/playlist.m3u8\n\n`;
    }
    await fs.writeFile(path, content, 'utf8');
  }

  private async calculateSize(dir: string, files: string[]): Promise<number> {
    let total = 0;
    for (const f of files) {
      if (f.endsWith('.ts')) {
        const stats = await fs.stat(join(dir, f));
        total += stats.size;
      }
    }
    return total;
  }
}
