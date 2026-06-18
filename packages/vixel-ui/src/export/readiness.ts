/**
 * Per-frame async-readiness gate — the render harness must never capture a frame
 * until every async resource it depends on (web fonts, LUT `.cube` fetches, remote
 * media decodes) is ready. Otherwise text rasterizes with a FALLBACK font, or an
 * effect samples a not-yet-loaded texture — the flaky-export class (white boxes,
 * wrong fonts) that's maddening because it's timing-dependent.
 *
 * A ref-counted barrier any loader can signal through (Remotion's
 * delayRender/continueRender model), kept tiny + dependency-free. A labeled timeout
 * turns a never-cleared handle into an ERROR instead of a silent hang.
 */

export interface ReadinessGate {
  /**
   * Register an async dependency; call the returned function once it's ready. If it
   * isn't cleared within `timeoutMs` the gate's {@link ready} promise REJECTS with
   * the label (so a stuck loader fails loudly rather than hanging the export).
   */
  delay(label?: string, timeoutMs?: number): () => void;
  /** Resolves once all outstanding delays have cleared (or rejects on a timeout). */
  ready(): Promise<void>;
  /** Labels of the still-outstanding handles — for diagnostics. */
  pending(): string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function createReadinessGate(): ReadinessGate {
  const handles = new Map<number, { label: string; timer: ReturnType<typeof setTimeout> | null }>();
  let nextId = 0;
  let rejectAll: ((e: Error) => void) | null = null;

  return {
    delay(label = 'render', timeoutMs = DEFAULT_TIMEOUT_MS): () => void {
      const id = nextId++;
      const timer =
        timeoutMs > 0 && typeof setTimeout !== 'undefined'
          ? setTimeout(() => rejectAll?.(new Error(`readiness timeout: "${label}" not cleared within ${timeoutMs}ms`)), timeoutMs)
          : null;
      handles.set(id, { label, timer });
      let cleared = false;
      return () => {
        if (cleared) return;
        cleared = true;
        const h = handles.get(id);
        if (h?.timer) clearTimeout(h.timer);
        handles.delete(id);
      };
    },
    ready(): Promise<void> {
      if (handles.size === 0) return Promise.resolve();
      // Poll the handle set (cheap; counts are tiny) + arm the timeout-reject channel.
      return new Promise<void>((resolve, reject) => {
        rejectAll = reject;
        const tick = () => {
          if (handles.size === 0) {
            rejectAll = null;
            resolve();
          } else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
          else setTimeout(tick, 16);
        };
        tick();
      });
    },
    pending(): string[] {
      return [...handles.values()].map((h) => h.label);
    },
  };
}

/**
 * Await web fonts so text never rasterizes with a fallback mid-export. No-op where
 * the Font Loading API is absent (SSR / older runtimes). Call once before the render
 * loop AND after any dynamic `FontFace` registration.
 */
export async function awaitFontsReady(): Promise<void> {
  try {
    const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as FontFaceSet | undefined;
    if (fonts?.ready) await fonts.ready;
  } catch {
    /* best-effort — never block export on a font API quirk */
  }
}
