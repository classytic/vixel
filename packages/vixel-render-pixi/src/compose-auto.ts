/**
 * composeAuto — the capability-aware router. Picks the right renderer per spec:
 * the Pixi (WYSIWYG) tier when the spec uses something the ffmpeg filtergraph
 * can't do faithfully AND a browser driver is installed; otherwise the fast ffmpeg
 * tier. When the premium runtime is missing it NEVER fails or emits an empty video
 * — it logs (through the injectable logger) that fidelity is reduced and degrades
 * to ffmpeg's `xfade`/approximation. There is no "tiering" product surface; this
 * is one entry that routes.
 */
import type { VixelSpec } from '@classytic/vixel-schema';
import { specNeedsPixi } from './detect.js';
import { resolveDriver } from './driver.js';
import { renderSpecWithPixi, bundlesResolvable, type PixiRenderOptions } from './render.js';

/** Minimal logger contract — inject your app's; defaults to console. */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const consoleLogger: Logger = {
  info: (m) => console.log('[vixel-render-pixi]', m),
  warn: (m) => console.warn('[vixel-render-pixi]', m),
  error: (m) => console.error('[vixel-render-pixi]', m),
};

export interface ComposeAutoOptions extends PixiRenderOptions {
  logger?: Logger;
  /** Force a tier instead of auto-detecting (`'auto'` is the default). */
  forceTier?: 'auto' | 'pixi' | 'ffmpeg';
}

/** Is the premium Pixi tier usable here (driver installed + bundles resolvable)? */
export async function canRenderWithPixi(
  prefer?: 'playwright-core' | 'puppeteer-core',
): Promise<{ ok: boolean; reason?: string }> {
  const driver = await resolveDriver(prefer);
  if (!driver) return { ok: false, reason: 'no browser driver (install playwright-core or puppeteer-core)' };
  if (!bundlesResolvable()) return { ok: false, reason: '@classytic/vixel-ui not resolvable' };
  return { ok: true };
}

async function importEngine(): Promise<{ compose: (s: VixelSpec, out: string) => Promise<unknown> } | null> {
  try {
    // The declarative renderer lives at the `/compose` subpath (the MCP surface).
    return (await import(/* @vite-ignore */ '@classytic/vixel/compose')) as {
      compose: (s: VixelSpec, out: string) => Promise<unknown>;
    };
  } catch {
    return null;
  }
}

export interface ComposeAutoResult {
  /** Which renderer actually ran. */
  tier: 'pixi' | 'ffmpeg';
  /** Why the Pixi tier was chosen/needed (empty when not needed). */
  reasons: string[];
  /** True if the Pixi tier was needed but unavailable → ffmpeg degradation. */
  degraded: boolean;
}

/**
 * Render `spec` to `outPath`, choosing the tier automatically. Returns which tier
 * ran and whether it degraded (premium needed but unavailable).
 */
export async function composeAuto(
  spec: VixelSpec,
  outPath: string,
  opts: ComposeAutoOptions = {},
): Promise<ComposeAutoResult> {
  const log = opts.logger ?? consoleLogger;
  const need = specNeedsPixi(spec);
  const wantPixi = opts.forceTier === 'pixi' || (opts.forceTier !== 'ffmpeg' && need.needs);

  if (wantPixi) {
    const cap = await canRenderWithPixi(opts.driver);
    if (cap.ok) {
      log.info(`Pixi tier — ${need.reasons.join(', ') || 'forced'}`);
      await renderSpecWithPixi(spec, outPath, opts);
      return { tier: 'pixi', reasons: need.reasons, degraded: false };
    }
    log.warn(
      `spec needs the Pixi tier (${need.reasons.join(', ')}) but ${cap.reason}; ` +
        `falling back to ffmpeg — these will degrade to xfade/approximation.`,
    );
  }

  const engine = await importEngine();
  if (!engine) {
    throw new Error('cannot render: Pixi tier unavailable and @classytic/vixel (ffmpeg engine) is not installed');
  }
  await engine.compose(spec, outPath);
  return { tier: 'ffmpeg', reasons: need.reasons, degraded: wantPixi };
}
