/**
 * Export sink — where the muxed MP4 bytes go. The ONE memory ceiling for a fully
 * client-side export is the muxer accumulating the whole file in RAM
 * (`ArrayBufferTarget`): a long / 4K render is gigabytes and OOMs the tab. Streaming
 * the output to an **OPFS** file (`FileSystemWritableFileStreamTarget`) removes that
 * ceiling — bytes hit disk as they're produced, so the render is bounded by frame
 * memory, not output size. That's what lets us stay 100% client-side (no server
 * renderer) even for long / high-res exports.
 *
 *  - SHORT clips → `memory` (ArrayBufferTarget + `fastStart: 'in-memory'`): one
 *    fast-start MP4 (moov up front → instant playback), zero disk juggling.
 *  - LARGE clips → `opfs` (stream to a temp OPFS file, `fastStart: false`): bounded
 *    RAM; the returned Blob is the disk-backed `File` (an object URL streams from
 *    disk, never loading the whole file into memory).
 *
 * `auto` (default) picks by estimated size + OPFS availability, falling back to
 * memory where OPFS / the writable-stream API is absent. The muxer target classes
 * are injected (they come from the dynamically-imported `mp4-muxer`), so this file
 * pulls in nothing itself.
 */

export type ExportSinkMode = 'auto' | 'memory' | 'opfs';

/** Above this estimated output size, prefer OPFS streaming over an in-RAM buffer. */
const OPFS_THRESHOLD_BYTES = 200 * 1024 * 1024; // 200 MB
/** Single reused temp filename — overwritten each export, so OPFS never accumulates. */
const TEMP_NAME = 'vixel-export.tmp.mp4';

/** Minimal shapes of the two mp4-muxer targets we use (injected from the dynamic import). */
export interface MuxerTargetCtors {
  ArrayBufferTarget: new () => { buffer: ArrayBuffer };
  FileSystemWritableFileStreamTarget: new (stream: FileSystemWritableFileStream, opts?: { chunkSize?: number }) => object;
}

export interface ExportSink {
  /** The mp4-muxer `target` instance to construct the Muxer with. */
  target: object;
  /** The matching `fastStart` mode (streaming can't buffer the moov in memory). */
  fastStart: false | 'in-memory';
  /** Whether this sink streams to disk (for logging / budget messaging). */
  streamed: boolean;
  /** Call AFTER `muxer.finalize()` → the finished MP4 as a Blob (disk-backed for OPFS). */
  finalize(): Promise<Blob>;
}

/** Is OPFS + the writable-file-stream API usable here? */
export function canStreamToOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage?.getDirectory &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  );
}

/** Estimate output bytes from bitrate × duration (+ ~12% container/audio overhead). */
export function estimateExportBytes(bitrateBps: number, durationSec: number): number {
  return Math.round((bitrateBps / 8) * durationSec * 1.12);
}

/**
 * Create the export sink. `mode='auto'` streams to OPFS when the estimate exceeds
 * {@link OPFS_THRESHOLD_BYTES} and OPFS is available; otherwise buffers in memory.
 */
export async function createExportSink(
  targets: MuxerTargetCtors,
  mode: ExportSinkMode,
  estBytes: number,
): Promise<ExportSink> {
  const wantOpfs = mode === 'opfs' || (mode === 'auto' && estBytes > OPFS_THRESHOLD_BYTES);
  if (wantOpfs && canStreamToOpfs()) {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(TEMP_NAME, { create: true });
    const writable = await handle.createWritable();
    const target = new targets.FileSystemWritableFileStreamTarget(writable);
    return {
      target,
      fastStart: false, // moov-at-end: progressive disk writes, bounded RAM
      streamed: true,
      finalize: async () => {
        await writable.close();
        return await handle.getFile(); // disk-backed Blob — object URL streams from disk
      },
    };
  }
  // memory path (shorts, or no OPFS): fast-start MP4 in a single ArrayBuffer.
  const target = new targets.ArrayBufferTarget();
  return {
    target,
    fastStart: 'in-memory',
    streamed: false,
    finalize: async () => new Blob([target.buffer], { type: 'video/mp4' }),
  };
}
