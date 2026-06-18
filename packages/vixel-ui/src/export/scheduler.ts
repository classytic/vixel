/**
 * Export scheduler primitives — the browser-quirk plumbing that turns a naive
 * "render a frame, encode it" loop into a fast, OOM-safe, UI-friendly client-side
 * export. Pure, dependency-free, and renderer-agnostic: shared by the in-browser MP4
 * exporter, and reusable by any future thumbnail/GIF/preview-record path.
 *
 * Why these exist (hard-won, easy to rediscover painfully):
 *  - **`glFinish`** — capturing a `VideoFrame` from a canvas that hasn't finished
 *    GPU work makes the browser pace capture to the DISPLAY refresh (vsync), capping
 *    an in-tab export at ~realtime. Forcing the pipeline to drain with `gl.finish()`
 *    BEFORE capture removes that ceiling — the single biggest throughput win.
 *  - **`waitEncoderQueue`** — `encoder.encode()` is fire-and-forget; without
 *    backpressure a fast render loop floods the encoder queue and OOMs at 4K/long
 *    timelines. Await until the queue drains below a limit.
 *  - **`yieldToScheduler`** — a `MessageChannel` macrotask yields to the event loop
 *    so the tab stays responsive (and timers/paint run), WITHOUT `setTimeout(0)`'s
 *    ~4ms clamp that would dominate a thousands-of-frames export.
 */

/** Max in-flight frames before we pause the render loop to let the encoder drain. */
export const ENCODER_QUEUE_LIMIT = 20;

/** Keyframe interval (frames): a GOP every ~3s balances seekability vs size. */
export function gopInterval(fps: number): number {
  return Math.max(1, Math.floor(fps * 3));
}

/** Yield to the event loop via a macrotask (no `setTimeout` 4ms clamp). Falls back
 *  to a microtask where `MessageChannel` is unavailable (SSR / old runtimes). */
export function yieldToScheduler(): Promise<void> {
  if (typeof MessageChannel === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(undefined);
  });
}

/** Minimal shape of a WebCodecs encoder we backpressure against (Video or Audio). */
export interface QueuedEncoder {
  readonly encodeQueueSize: number;
}

/**
 * Backpressure: resolve once the encoder's in-flight queue is at/below `limit`,
 * yielding between checks so the encoder thread can drain. Bounds memory at 4K /
 * long timelines instead of flooding the queue.
 */
export async function waitEncoderQueue(encoder: QueuedEncoder, limit: number = ENCODER_QUEUE_LIMIT): Promise<void> {
  let guard = 0;
  // `guard` is a runaway backstop: if the queue never drains (encoder wedged), bail
  // after a bounded number of yields rather than spin forever.
  while (encoder.encodeQueueSize > limit && guard++ < 100_000) {
    await yieldToScheduler();
  }
}

/** The existing WebGL/WebGL2 context on a canvas (never creates one — retrieves the
 *  one Pixi already made), or null. */
export function getCanvasGl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): WebGLRenderingContext | WebGL2RenderingContext | null {
  try {
    return (
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null)
    );
  } catch {
    return null;
  }
}

/**
 * Force the GPU pipeline to drain before capturing a frame (defeats vsync-paced
 * capture). No-op on a non-WebGL canvas (e.g. a WebGPU renderer, which doesn't need
 * it). Safe to call every frame.
 */
export function glFinish(canvas: HTMLCanvasElement | OffscreenCanvas): void {
  getCanvasGl(canvas)?.finish();
}
