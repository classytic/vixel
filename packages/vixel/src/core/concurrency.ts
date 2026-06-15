/**
 * Concurrency Control
 * ===================
 * A tiny, dependency-free concurrency limiter. Prevents spawning an unbounded
 * number of FFmpeg processes (which would OOM the host) when processing many
 * items — HLS variants, batch jobs, per-scene renders.
 *
 * @example
 * ```typescript
 * // Encode 3 variants at most 2 at a time
 * const results = await mapWithConcurrency(variants, 2, (v) => encode(v));
 *
 * // Reusable limiter
 * const limit = createLimiter(4);
 * await Promise.all(jobs.map((j) => limit(() => process(j))));
 * ```
 */

export type Task<T> = () => Promise<T>;

/**
 * Create a limiter that runs at most `concurrency` tasks simultaneously.
 * Returns a function you wrap each task with.
 */
export function createLimiter(concurrency: number): <T>(task: Task<T>) => Promise<T> {
  if (concurrency < 1) throw new RangeError('concurrency must be >= 1');

  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (run) {
      active++;
      run();
    }
  };

  return function limit<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      };
      queue.push(run);
      next();
    });
  };
}

/**
 * Map over `items` running the async `fn` at most `concurrency` at a time.
 * Results preserve input order. Rejects on the first error (like Promise.all);
 * use `mapSettled` if you want all results regardless of failures.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = createLimiter(concurrency);
  return Promise.all(items.map((item, i) => limit(() => fn(item, i))));
}

/**
 * Like `mapWithConcurrency` but never rejects — returns a settled result per
 * item so one failure doesn't abort the batch.
 */
export async function mapSettled<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limit = createLimiter(concurrency);
  return Promise.allSettled(items.map((item, i) => limit(() => fn(item, i))));
}
