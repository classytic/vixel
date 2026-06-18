import { describe, it, expect } from 'vitest';
import { createExportSink, estimateExportBytes, canStreamToOpfs, type MuxerTargetCtors } from './opfs-sink.js';

// Fakes for the injected mp4-muxer target classes.
class FakeArrayBufferTarget {
  buffer = new Uint8Array([0, 1, 2, 3]).buffer;
}
class FakeFsTarget {
  constructor(public stream: unknown) {}
}
const targets = {
  ArrayBufferTarget: FakeArrayBufferTarget,
  FileSystemWritableFileStreamTarget: FakeFsTarget,
} as unknown as MuxerTargetCtors;

describe('export/opfs-sink', () => {
  it('estimateExportBytes ≈ bitrate/8 × duration × overhead', () => {
    expect(estimateExportBytes(8_000_000, 10)).toBe(Math.round((8_000_000 / 8) * 10 * 1.12));
    expect(estimateExportBytes(0, 100)).toBe(0);
  });

  it('memory mode → ArrayBufferTarget, fast-start, finalize yields an mp4 Blob', async () => {
    const sink = await createExportSink(targets, 'memory', 999 * 1024 * 1024);
    expect(sink.streamed).toBe(false);
    expect(sink.fastStart).toBe('in-memory');
    expect(sink.target).toBeInstanceOf(FakeArrayBufferTarget);
    const blob = await sink.finalize();
    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(4);
  });

  it('auto mode falls back to memory where OPFS is unavailable (e.g. tests/SSR)', async () => {
    // happy-dom/node have no navigator.storage.getDirectory → canStreamToOpfs is false.
    expect(canStreamToOpfs()).toBe(false);
    const sink = await createExportSink(targets, 'auto', 999 * 1024 * 1024); // huge, would prefer OPFS
    expect(sink.streamed).toBe(false); // but OPFS absent → memory
    expect(sink.target).toBeInstanceOf(FakeArrayBufferTarget);
  });

  it('auto mode stays in memory for a small estimate', async () => {
    const sink = await createExportSink(targets, 'auto', 1024 * 1024);
    expect(sink.streamed).toBe(false);
  });
});
