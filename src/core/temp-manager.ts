/**
 * Temp File Manager
 * =================
 * Guarantees cleanup of intermediate files/directories — even when an
 * operation throws midway. Use it anywhere a pipeline creates scratch
 * files (palettes, concat lists, extracted frames, intermediate clips).
 *
 * @example
 * ```typescript
 * const temp = new TempFileManager();
 * try {
 *   const palette = temp.file('palette.png', outputDir);
 *   await generatePalette(palette);
 *   await encodeWithPalette(palette, output);
 * } finally {
 *   await temp.cleanup(); // palette removed even on failure
 * }
 *
 * // Or scoped — cleanup is automatic:
 * await TempFileManager.scoped(async (temp) => {
 *   const dir = temp.dir('frames', outputDir);
 *   await extractFrames(dir);
 *   return buildSprite(dir);
 * });
 * ```
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export class TempFileManager {
  private readonly tracked: string[] = [];

  /**
   * Register a file path for cleanup and return it. Pass a `baseDir` to place
   * it there, otherwise it goes in the OS temp directory.
   */
  file(name: string, baseDir: string = tmpdir()): string {
    const path = join(baseDir, name);
    this.tracked.push(path);
    return path;
  }

  /**
   * Register and create a directory for cleanup, returning its path.
   * The directory is created recursively.
   */
  async dir(name: string, baseDir: string = tmpdir()): Promise<string> {
    const path = join(baseDir, name);
    await fs.mkdir(path, { recursive: true });
    this.tracked.push(path);
    return path;
  }

  /** Register an already-known path (file or dir) for later cleanup. */
  register(path: string): string {
    this.tracked.push(path);
    return path;
  }

  /** Remove all tracked files/dirs. Never throws — failures are swallowed. */
  async cleanup(): Promise<void> {
    await Promise.allSettled(
      this.tracked.map((p) => fs.rm(p, { recursive: true, force: true })),
    );
    this.tracked.length = 0;
  }

  /**
   * Run `fn` with a fresh manager and guarantee cleanup afterwards,
   * regardless of success or failure.
   */
  static async scoped<T>(fn: (temp: TempFileManager) => Promise<T>): Promise<T> {
    const temp = new TempFileManager();
    try {
      return await fn(temp);
    } finally {
      await temp.cleanup();
    }
  }
}

/**
 * Best-effort removal of a single path. Useful for cleaning up a partially
 * written output file when an operation fails. Never throws.
 */
export async function removeQuietly(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true }).catch(() => {});
}

/**
 * Return the byte size of an output file, or 0 when `dryRun` is set (no file
 * was written). Lets generators build their result object uniformly without a
 * `stat()` crash in dry-run mode.
 */
export async function outputSize(path: string, dryRun?: boolean): Promise<number> {
  if (dryRun) return 0;
  const stats = await fs.stat(path);
  return stats.size;
}
