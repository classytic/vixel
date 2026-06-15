/**
 * Editor-proxy profile — golden-command unit tests (pure, no ffmpeg).
 *
 * Pins the exact ffmpeg flag set so any change to the proxy profile is reviewed
 * in a PR (the whole point of the recipe: a known-good, web-editor-safe command).
 */

import { describe, it, expect } from 'vitest';
import { buildEditorProxyArgs } from '../src/profiles/editor-proxy.js';
import { Source } from '../src/primitives/source.js';
import type { VideoMetadata } from '../src/core/probe.js';

const META: VideoMetadata = {
  duration: 10,
  width: 3840,
  height: 2160,
  bitrate: 40000,
  fps: 30,
  codec: 'hevc',
  hasAudio: true,
};
const src = Source.fromMetadata('in.mp4', META);

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

describe('buildEditorProxyArgs', () => {
  it('emits the web-editor-safe default profile', () => {
    const args = buildEditorProxyArgs(src, 'out.mp4');

    // input → output ordering
    expect(args[0]).toBe('-i');
    expect(args[1]).toBe('in.mp4');
    expect(args.at(-1)).toBe('out.mp4');
    expect(args.at(-2)).toBe('-y');

    // codec + browser/iOS compatibility
    expect(flag(args, '-c:v')).toBe('libx264');
    expect(flag(args, '-profile:v')).toBe('high');
    expect(flag(args, '-level:v')).toBe('4.1'); // 4K → downscaled 1080p30 → 4.1
    expect(flag(args, '-pix_fmt')).toBe('yuv420p');
    expect(args).not.toContain('-tune'); // fastdecode is OPT-IN, not default
    expect(flag(args, '-preset')).toBe('veryfast');
    expect(flag(args, '-crf')).toBe('24');

    // faststart for progressive play + range seeking
    expect(flag(args, '-movflags')).toBe('+faststart');

    // 1080p downscale cap
    expect(flag(args, '-vf')).toContain("min(1920,iw)");
    expect(flag(args, '-vf')).toContain('force_divisible_by=2');

    // regular GOP = fps × interval (30 × 1s) with deterministic keyframes
    expect(flag(args, '-g')).toBe('30');
    expect(flag(args, '-keyint_min')).toBe('30');
    expect(flag(args, '-sc_threshold')).toBe('0');
    expect(flag(args, '-force_key_frames')).toBe('expr:gte(t,n_forced*1)');

    // audio
    expect(flag(args, '-c:a')).toBe('aac');
    expect(flag(args, '-b:a')).toBe('128k');
    expect(flag(args, '-ar')).toBe('48000');
    expect(flag(args, '-ac')).toBe('2');
  });

  it('derives GOP from the source fps and interval', () => {
    const at60 = Source.fromMetadata('x.mp4', { ...META, fps: 60 });
    expect(flag(buildEditorProxyArgs(at60, 'o.mp4', { keyframeIntervalSec: 0.5 }), '-g')).toBe('30');
    expect(flag(buildEditorProxyArgs(src, 'o.mp4', { keyframeIntervalSec: 2 }), '-g')).toBe('60');
  });

  it('all-intra sets g=1 and omits force_key_frames', () => {
    const args = buildEditorProxyArgs(src, 'o.mp4', { allIntra: true });
    expect(flag(args, '-g')).toBe('1');
    expect(flag(args, '-keyint_min')).toBe('1');
    expect(args).not.toContain('-force_key_frames');
  });

  it('honours custom crf, preset, audio bitrate, and box', () => {
    const args = buildEditorProxyArgs(src, 'o.mp4', {
      crf: 28,
      preset: 'faster',
      audioBitrate: '96k',
      maxWidth: 1280,
      maxHeight: 720,
    });
    expect(flag(args, '-crf')).toBe('28');
    expect(flag(args, '-preset')).toBe('faster');
    expect(flag(args, '-b:a')).toBe('96k');
    expect(flag(args, '-vf')).toContain('min(1280,iw)');
  });

  it('falls back to 30fps when source fps is unknown', () => {
    const noFps = Source.fromMetadata('x.mp4', { ...META, fps: 0 });
    expect(flag(buildEditorProxyArgs(noFps, 'o.mp4'), '-g')).toBe('30');
  });

  it('bumps the H.264 level to 4.2 for 1080p60 (4.1 is too low)', () => {
    const p60 = Source.fromMetadata('x.mp4', { ...META, width: 1920, height: 1080, fps: 60 });
    expect(flag(buildEditorProxyArgs(p60, 'o.mp4'), '-level:v')).toBe('4.2');
    // 1080p30 stays at 4.1
    const p30 = Source.fromMetadata('x.mp4', { ...META, width: 1920, height: 1080, fps: 30 });
    expect(flag(buildEditorProxyArgs(p30, 'o.mp4'), '-level:v')).toBe('4.1');
  });

  it('adds -tune only when explicitly requested (opt-in)', () => {
    expect(flag(buildEditorProxyArgs(src, 'o.mp4', { tune: 'fastdecode' }), '-tune')).toBe('fastdecode');
  });

  it('rejects a non-positive resolution cap', () => {
    expect(() => buildEditorProxyArgs(src, 'o.mp4', { maxHeight: 0 })).toThrow();
  });
});
