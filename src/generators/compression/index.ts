/**
 * Compression Generator
 * Public API exports
 */

export { compressVideo } from './generator.js';
export { detectHardwareAccel } from './constants.js';
export type {
  CompressionConfig,
  CompressionResult,
  VideoCodec,
  HardwareAccel,
  EncodingPreset,
  AudioCodec,
} from './types.js';
