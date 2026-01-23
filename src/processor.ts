/**
 * HLS Processor - Main Class
 * ===========================
 * Enterprise-grade HLS processing with modern TypeScript.
 */

import { promises as fs } from 'node:fs';
import type {
  HLSProcessorConfig,
  ProcessorOptions,
  HLSProcessingResult,
  ProcessingMetadata,
  CodecCopyOptions,
  FeatureFlags,
  QualityVariant,
} from './types/index.js';
import { HLSProcessorError } from './types/index.js';
import { VariantEncoder, type EncodeOptions } from './encoding/variant-encoder.js';
import { probeVideo } from './core/probe.js';
import { generateSprites } from './generators/sprites/generator.js';
import { generateChapters } from './generators/chapters/generator.js';
import { Logger } from './utils/logger.js';
import {
  DEFAULT_SPRITE_INTERVAL,
  DEFAULT_SPRITE_WIDTH,
  DEFAULT_SPRITE_COLUMNS,
  DEFAULT_FFMPEG_TIMEOUT,
} from './constants.js';

/**
 * Internal config type with all defaults applied
 */
interface ResolvedHLSProcessorConfig {
  variants: QualityVariant[];
  features: Required<FeatureFlags>;
  ffmpeg: {
    ffmpegPath: string;
    ffprobePath: string;
    timeout: number;
    codecCopy: Required<CodecCopyOptions>;
  };
  debug: boolean;
}

/**
 * Main HLS Processor
 *
 * Converts video to HLS format with adaptive bitrate streaming,
 * thumbnail sprites, and WebVTT chapters.
 */
export class HLSProcessor {
  private readonly config: ResolvedHLSProcessorConfig;
  private readonly encoder: VariantEncoder;
  private readonly logger: Logger;

  constructor(config: HLSProcessorConfig) {
    // Apply defaults FIRST, then validate
    const ffmpegPath = config.ffmpeg?.ffmpegPath ?? 'ffmpeg';
    const ffprobePath = config.ffmpeg?.ffprobePath ?? 'ffprobe';
    const timeout = config.ffmpeg?.timeout ?? DEFAULT_FFMPEG_TIMEOUT;
    const codecCopy: Required<CodecCopyOptions> = {
      enabled: config.ffmpeg?.codecCopy?.enabled ?? false,
      autoDetect: config.ffmpeg?.codecCopy?.autoDetect ?? true,
      resolutionTolerance: config.ffmpeg?.codecCopy?.resolutionTolerance ?? 10,
      force: config.ffmpeg?.codecCopy?.force ?? false,
      fallbackToReencode: config.ffmpeg?.codecCopy?.fallbackToReencode ?? true,
    };

    this.config = {
      variants: config.variants,
      features: {
        sprites: config.features?.sprites ?? false,
        chapters: config.features?.chapters ?? false,
        textTracks: config.features?.textTracks ?? false,
      },
      ffmpeg: {
        ffmpegPath,
        ffprobePath,
        timeout,
        codecCopy,
      },
      debug: config.debug ?? false,
    };

    // Initialize logger BEFORE validation (validation uses logger)
    this.logger = new Logger({
      debug: this.config.debug,
      prefix: '[HLS]',
    });

    // Validate configuration AFTER defaults are applied
    this.validateConfig(this.config);

    this.encoder = new VariantEncoder({
      ffmpegPath,
      ffprobePath,
      timeout,
      logger: this.logger,
    });
  }

  /**
   * Validate processor configuration
   * @remarks Called AFTER defaults are applied in constructor
   */
  private validateConfig(config: ResolvedHLSProcessorConfig): void {
    // Validate variants
    if (!config.variants || config.variants.length === 0) {
      throw new HLSProcessorError(
        'At least one variant is required',
        'INVALID_CONFIG'
      );
    }

    // Check for duplicate variant names
    const variantNames = new Set<string>();
    for (const variant of config.variants) {
      if (variantNames.has(variant.name)) {
        throw new HLSProcessorError(
          `Duplicate variant name: "${variant.name}". Each variant must have a unique name.`,
          'INVALID_VARIANT'
        );
      }
      variantNames.add(variant.name);
    }

    // Validate each variant
    for (const variant of config.variants) {
      if (!variant.name || variant.name.trim() === '') {
        throw new HLSProcessorError(
          'Variant name is required',
          'INVALID_VARIANT'
        );
      }

      if (variant.height <= 0) {
        throw new HLSProcessorError(
          `Invalid variant height: ${variant.height}. Height must be positive`,
          'INVALID_VARIANT'
        );
      }

      // Validate segment duration if specified
      if (variant.segmentDuration !== undefined) {
        if (variant.segmentDuration <= 0 || variant.segmentDuration > 30) {
          throw new HLSProcessorError(
            `Invalid segment duration: ${variant.segmentDuration}. Must be between 1-30 seconds`,
            'INVALID_VARIANT'
          );
        }
      }

      // =========================================================================
      // Bitrate validation: Aligned with CodecCopyDetector logic
      // =========================================================================
      const isExplicitCopyMode = variant.encodingMode === 'copy';
      const isExplicitReencodeMode = variant.encodingMode === 'reencode';

      if (isExplicitCopyMode) {
        // Explicit codec copy: zero bitrates are required
        if (variant.videoBitrate !== 0 || variant.audioBitrate !== 0) {
          this.logger.warn(
            `Variant "${variant.name}": encodingMode='copy' but bitrates are non-zero. ` +
            `Bitrates will be ignored in codec copy mode.`
          );
        }
        this.logger.success(
          `Variant "${variant.name}" configured for explicit codec copy mode`
        );
      } else if (isExplicitReencodeMode) {
        // Explicit re-encode: require positive bitrates
        if (variant.videoBitrate <= 0) {
          throw new HLSProcessorError(
            `Invalid variant videoBitrate: ${variant.videoBitrate}. ` +
              `Bitrate must be positive for re-encoding mode (encodingMode='reencode').`,
            'INVALID_VARIANT'
          );
        }
        if (variant.audioBitrate <= 0) {
          throw new HLSProcessorError(
            `Invalid variant audioBitrate: ${variant.audioBitrate}. ` +
              `Bitrate must be positive for re-encoding mode.`,
            'INVALID_VARIANT'
          );
        }
      } else {
        // Auto mode: validate based on bitrates
        if (variant.videoBitrate === 0 || variant.audioBitrate === 0) {
          // Zero bitrates in auto mode - only allowed if codec copy is enabled
          if (!config.ffmpeg.codecCopy?.enabled) {
            throw new HLSProcessorError(
              `Variant "${variant.name}": Zero bitrates require codec copy to be enabled. ` +
                `Either set ffmpeg.codecCopy.enabled=true or use positive bitrates.`,
              'INVALID_VARIANT'
            );
          }
          this.logger.info(
            `Variant "${variant.name}" will use codec copy if source resolution matches (auto-detect mode)`
          );
        } else {
          // Non-zero bitrates: will re-encode or use auto-detection
          if (variant.videoBitrate < 0 || variant.audioBitrate < 0) {
            throw new HLSProcessorError(
              `Invalid bitrates for variant "${variant.name}". Bitrates cannot be negative.`,
              'INVALID_VARIANT'
            );
          }
        }
      }
    }

    // FFmpeg paths: Validate they're not empty after defaults applied
    if (!config.ffmpeg.ffmpegPath || config.ffmpeg.ffmpegPath.trim() === '') {
      throw new HLSProcessorError(
        'ffmpegPath cannot be empty',
        'INVALID_CONFIG'
      );
    }

    if (!config.ffmpeg.ffprobePath || config.ffmpeg.ffprobePath.trim() === '') {
      throw new HLSProcessorError(
        'ffprobePath cannot be empty',
        'INVALID_CONFIG'
      );
    }
  }

  /**
   * Process video to HLS format
   *
   * @param options - Processing options
   * @returns Processing result with URLs and metadata
   *
   * @example
   * ```typescript
   * const result = await processor.process({
   *   inputPath: './input.webm',
   *   outputDir: './output/hls',
   *   onProgress: (progress) => {
   *     console.log(`${progress.percent}% complete`);
   *   },
   * });
   * ```
   */
  async process(options: ProcessorOptions): Promise<HLSProcessingResult> {
    const { inputPath, outputDir, onProgress } = options;
    const startTime = new Date();

    try {
      // Validate input
      await this.validateInput(inputPath);

      // Create output directory
      await fs.mkdir(outputDir, { recursive: true });

      // Probe video metadata
      const videoInfo = await probeVideo(inputPath, this.config.ffmpeg.ffprobePath);

      const metadata: ProcessingMetadata = {
        duration: videoInfo.duration,
        resolution: {
          width: videoInfo.width,
          height: videoInfo.height,
        },
        startedAt: startTime,
      };

      // Step 1: Encode HLS variants
      this.logger.info('Encoding variants...');
      const encodeOptions: EncodeOptions = {
        inputPath,
        outputDir,
        variants: this.config.variants,
      };
      if (onProgress) {
        encodeOptions.onProgress = onProgress;
      }
      const encodingResult = await this.encoder.encodeVariants(encodeOptions);

      // Step 2: Generate optional features
      const result: HLSProcessingResult = {
        success: true,
        outputDir,
        variants: encodingResult.variants,
        metadata,
      };

      // Optional: Generate sprites
      if (this.config.features.sprites) {
        this.logger.info('Generating thumbnail sprites...');
        try {
          const spriteResult = await generateSprites(
            { inputPath, duration: videoInfo.duration },
            outputDir,
            {
              interval: DEFAULT_SPRITE_INTERVAL,
              width: DEFAULT_SPRITE_WIDTH,
              columns: DEFAULT_SPRITE_COLUMNS,
              ffmpegPath: this.config.ffmpeg.ffmpegPath,
            }
          );
          result.sprites = {
            imagePath: spriteResult.imagePath,
            vttPath: spriteResult.vttPath,
            thumbnailCount: spriteResult.thumbnailCount,
            dimensions: spriteResult.dimensions,
          };
          this.logger.success('Sprites generated');
        } catch (error) {
          this.logger.error('Sprites generation failed:', error);
        }
      }

      // Optional: Generate chapters
      if (this.config.features.chapters) {
        this.logger.info('Generating chapters...');
        try {
          const manualChapters = options.featuresConfig?.chapters;
          const chapterResult = await generateChapters(
            { inputPath, duration: videoInfo.duration },
            outputDir,
            manualChapters
              ? {
                  mode: 'manual',
                  chapters: manualChapters.map((ch) => ({
                    id: ch.id,
                    startTime: ch.startTime,
                    title: ch.title,
                  })),
                }
              : { mode: 'auto' }
          );
          result.chapters = {
            vttPath: chapterResult.vttPath,
            chapterCount: chapterResult.chapterCount,
            chapters: chapterResult.chapters.map((ch) => ({
              id: ch.id,
              startTime: ch.startTime,
              endTime: ch.endTime ?? 0,
              title: ch.title,
            })),
          };
          this.logger.success('Chapters generated');
        } catch (error) {
          this.logger.error('Chapters generation failed:', error);
        }
      }

      // Complete metadata
      const endTime = new Date();
      result.metadata.completedAt = endTime;
      result.metadata.processingTime = endTime.getTime() - startTime.getTime();

      return result;
    } catch (error) {
      throw new HLSProcessorError(
        `HLS processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PROCESSING_FAILED',
        error
      );
    }
  }

  /**
   * Validate input video file
   */
  private async validateInput(inputPath: string): Promise<void> {
    try {
      await fs.access(inputPath);
    } catch {
      throw new HLSProcessorError(
        `Input file not found: ${inputPath}`,
        'INPUT_NOT_FOUND'
      );
    }
  }
}
