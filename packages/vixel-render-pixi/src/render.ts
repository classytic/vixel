/**
 * renderSpecWithPixi — the premium server export. Drives the SAME `renderScene`
 * the editor uses, inside a headless browser, one frame at a time (bake mode →
 * no uniform blocks, so a GPU-less server's SwiftShader is fine), and hands the
 * frames to ffmpeg for ENCODE ONLY. The browser composites; ffmpeg muxes. This is
 * the editly architecture, but reusing our own renderer so preview == export by
 * construction.
 */
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { createRequire } from 'node:module';
import { totalDurationSec, collectTransitionSounds } from '@classytic/vixel-schema';
import type { VixelSpec } from '@classytic/vixel-schema';
import { resolveDriver, type BrowserDriver, type DriverBrowser } from './driver.js';

const require = createRequire(import.meta.url);

export interface PixiRenderOptions {
  /** Browser binary the driver launches (required by the `-core` drivers). */
  executablePath?: string;
  /** Prefer a specific installed driver. */
  driver?: 'playwright-core' | 'puppeteer-core';
  /** Output frame rate (default: the spec's `output.fps`). */
  fps?: number;
  /** ESM URL for `pixi.js` in the page. Default: jsDelivr CDN. Override to a
   *  self-hosted bundle for offline servers. */
  pixiUrl?: string;
  /** Extra ffmpeg output args (e.g. `['-crf','18']`). */
  ffmpegArgs?: string[];
  /** Path to the ffmpeg binary (default: `ffmpeg` on PATH). */
  ffmpegPath?: string;
  onProgress?: (p: { frame: number; totalFrames: number; ratio: number }) => void;
  signal?: AbortSignal;
  /**
   * BYO transition GLSL to register in the page before rendering (mirrors the
   * live editor calling `registerTransitionSource`). Keyed by transition id (or
   * `gl.shader` id) → gl-transitions-convention source. Needed because the schema
   * runs INSIDE the headless browser, so a host-process registration wouldn't
   * reach it — this forwards them so a custom-transition pack renders on export
   * exactly as it previews.
   */
  transitionSources?: Record<string, string>;
  /**
   * BYO transition OVERLAY textures (light-leak/film-burn footage) by transition
   * id → image/video URL (or `data:` URL), registered in the page so an
   * overlay-texture transition exports as it previews.
   */
  overlaySources?: Record<string, string>;
}

const DEFAULT_PIXI = 'https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs';
const fpsOf = (fps: VixelSpec['output']['fps']): number => (typeof fps === 'number' ? fps : fps.num / fps.den);
const MIME: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json', '.html': 'text/html' };

/** Resolve the served dist roots for the renderer + schema bundles. Resolves via
 *  each package's `package.json` (always exported) — the `./renderer` subpath has
 *  only an `import` condition, so CJS `require.resolve` of it would fail. */
function resolveBundles(): { uiDist: string; schemaDist: string } {
  const uiDist = join(dirname(require.resolve('@classytic/vixel-ui/package.json')), 'dist');
  const schemaDist = join(dirname(require.resolve('@classytic/vixel-schema/package.json')), 'dist');
  return { uiDist, schemaDist };
}

/** Cheap probe: are the renderer + schema bundles resolvable from here? */
export function bundlesResolvable(): boolean {
  try {
    resolveBundles();
    return true;
  } catch {
    return false;
  }
}

/** A tiny two-root static server (`/ui/*`, `/schema/*`) + the generated harness. */
function startServer(uiDist: string, schemaDist: string, harnessHtml: string): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const send = async (file: string) => {
      try {
        const buf = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
        res.end(buf);
      } catch {
        res.writeHead(404);
        res.end('nf');
      }
    };
    if (url === '/harness') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return void res.end(harnessHtml);
    }
    if (url.startsWith('/ui/')) return void send(join(uiDist, url.slice(4)));
    if (url.startsWith('/schema/')) return void send(join(schemaDist, url.slice(8)));
    res.writeHead(404);
    res.end('nf');
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === 'object' && addr ? addr.port : 0 });
    });
  });
}

/** The headless page: import the react-free renderer, render any frame to a PNG. */
function harnessHtml(pixiUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">
{ "imports": {
  "@classytic/vixel-schema": "/schema/index.js",
  "@classytic/vixel-ui/renderer": "/ui/preview/pixi/index.js"
} }
</script></head><body><canvas id="c"></canvas><script type="module">
import * as PIXI from ${JSON.stringify(pixiUrl)};
import { renderScene, preloadAssets, awaitVideoSeeks } from '@classytic/vixel-ui/renderer';
import { registerTransitionSource, registerTransitionOverlay } from '@classytic/vixel-schema';
let app, cache, spec;
// BYO transition GLSL + overlay textures forwarded from the host (they register in
// THIS page's schema instance, so a custom pack renders on export as it previews).
window.__register = (srcs, overlays) => {
  for (const [id, glsl] of Object.entries(srcs || {})) registerTransitionSource(id, glsl);
  for (const [id, url] of Object.entries(overlays || {})) registerTransitionOverlay(id, url);
};
window.__init = async (s) => {
  spec = s;
  app = new PIXI.Application();
  await app.init({ canvas: document.getElementById('c'), width: spec.output.width, height: spec.output.height,
    background: spec.output.background ?? '#000000', antialias: true, autoStart: false, resolution: 1, preference: 'webgl', useBackBuffer: true });
  cache = new Map();
  await preloadAssets(PIXI, spec, cache);
  window.__ready = true;
};
window.__frame = async (t) => {
  if (awaitVideoSeeks) await awaitVideoSeeks(spec, t, cache);
  renderScene(PIXI, app, spec, t, cache, false, true); // bake=true → SwiftShader-safe
  return await app.renderer.extract.base64(app.stage);
};
</script></body></html>`;
}

interface AItem { source: string; at: number; in?: number; out?: number; gain: number; loop?: boolean; fadeIn?: number; fadeOut?: number }

/**
 * Transition SOUNDS (whoosh/impact) as audio items, timed to land on each cut.
 * Walks the sequential lane accumulating the OUTPUT start of each clip (durations
 * minus prior overlaps); a transition between i,i+1 cuts at clip i+1's start, so
 * the sound leads in slightly before. dB gain → linear. Resolved in THIS Node
 * process (audio is muxed by ffmpeg here, not in the browser).
 */
function transitionSounds(spec: VixelSpec): AItem[] {
  // Shared seam-timing resolver (schema) → ffmpeg audio items. Lead in 80ms so the
  // hit builds into the cut; dB gain → linear.
  return collectTransitionSounds(spec).map((c) => ({
    source: c.source,
    at: Math.max(0, c.at - 0.08),
    gain: c.gain != null ? 10 ** (c.gain / 20) : 1,
    fadeIn: 0.02,
    fadeOut: 0.12,
  }));
}

function collectAudio(spec: VixelSpec): AItem[] {
  const items: AItem[] = [...transitionSounds(spec)];
  for (const track of spec.tracks ?? []) {
    if (track.type !== 'audio') continue;
    for (const it of track.items ?? []) {
      const s = it.source as unknown;
      const src = typeof s === 'string' ? s : ((s as { url?: string; path?: string })?.url ?? (s as { path?: string })?.path);
      if (src) items.push({ source: src, at: it.at ?? 0, in: it.in, out: it.out, gain: it.gain ?? 1, loop: it.loop, fadeIn: it.fadeIn, fadeOut: it.fadeOut });
    }
  }
  return items;
}

/**
 * Build the ffmpeg audio inputs (after the input-0 video pipe) + the mix filter.
 * Per item: trim (in/out) → delay (at) → gain → fade in/out, looped at the input
 * with `-stream_loop`. All `amix`'d. (Sidechain ducking is an engine-graph feature
 * — defer to vixel's `compose()` when you need it.)
 */
function audioGraph(spec: VixelSpec): { preArgs: string[]; filter: string | null } {
  const items = collectAudio(spec);
  if (!items.length) return { preArgs: [], filter: null };
  const preArgs: string[] = [];
  const chains: string[] = [];
  items.forEach((it, i) => {
    if (it.loop) preArgs.push('-stream_loop', '-1');
    preArgs.push('-i', it.source); // → ffmpeg input i+1 (input 0 is the video pipe)
    const f: string[] = [];
    if (it.in != null || it.out != null) {
      f.push(`atrim=start=${it.in ?? 0}${it.out != null ? `:end=${it.out}` : ''}`, 'asetpts=PTS-STARTPTS');
    }
    if (it.at > 0) f.push(`adelay=${Math.round(it.at * 1000)}:all=1`);
    if (it.gain !== 1) f.push(`volume=${it.gain}`);
    if (it.fadeIn) f.push(`afade=t=in:st=${it.at}:d=${it.fadeIn}`);
    if (it.fadeOut && it.out != null) {
      const end = it.at + Math.max(0, it.out - (it.in ?? 0));
      f.push(`afade=t=out:st=${Math.max(0, end - it.fadeOut)}:d=${it.fadeOut}`);
    }
    chains.push(`[${i + 1}:a]${f.length ? f.join(',') : 'anull'}[a${i}]`);
  });
  const mix = `${items.map((_, i) => `[a${i}]`).join('')}amix=inputs=${items.length}:normalize=0[aout]`;
  return { preArgs, filter: `${chains.join(';')};${mix}` };
}

/**
 * Render `spec` to an MP4 at `outPath` via the headless Pixi tier. Throws if no
 * browser driver is installed (the caller should fall back to the ffmpeg tier).
 * Frames are streamed straight into ffmpeg (`image2pipe`) — no temp directory.
 */
export async function renderSpecWithPixi(spec: VixelSpec, outPath: string, opts: PixiRenderOptions = {}): Promise<void> {
  const driver: BrowserDriver | null = await resolveDriver(opts.driver);
  if (!driver) throw new Error('no browser driver (install playwright-core or puppeteer-core)');

  const fps = opts.fps ?? fpsOf(spec.output.fps);
  const totalFrames = Math.max(1, Math.round(totalDurationSec(spec) * fps));
  const { uiDist, schemaDist } = resolveBundles();
  const { server, port } = await startServer(uiDist, schemaDist, harnessHtml(opts.pixiUrl ?? DEFAULT_PIXI));

  const audio = audioGraph(spec);
  const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0', ...audio.preArgs];
  // Cap the output at the VIDEO duration with `-t` (not `-shortest`): `-shortest`
  // ends at the shortest INPUT, so a short clip (a transition whoosh) would truncate
  // the whole render and close the frame pipe early. `-t` bounds infinite looped
  // music too, while letting short SFX play then fall silent for the remainder.
  if (audio.filter) args.push('-filter_complex', audio.filter, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-t', String(totalFrames / fps));
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(opts.ffmpegArgs ?? ['-crf', '18']), outPath);

  let browser: DriverBrowser | undefined;
  const ff = spawn(opts.ffmpegPath ?? 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => (ffErr += d.toString()));
  const ffDone = new Promise<void>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-600)}`))));
  });

  try {
    browser = await driver.launch({ executablePath: opts.executablePath });
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/harness`);
    // `globalThis` is the page `window` in the browser; typed loosely since these
    // callbacks are serialized and run there, not in this Node context.
    if ((opts.transitionSources && Object.keys(opts.transitionSources).length) || (opts.overlaySources && Object.keys(opts.overlaySources).length)) {
      await page.evaluate(
        (a) => (globalThis as unknown as { __register(s: unknown, o: unknown): void }).__register((a as { s: unknown }).s, (a as { o: unknown }).o),
        { s: opts.transitionSources ?? {}, o: opts.overlaySources ?? {} },
      );
    }
    await page.evaluate((s) => (globalThis as unknown as { __init(x: unknown): Promise<void> }).__init(s), spec);
    await page.waitForReady('__ready', 30000);

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new Error('aborted');
      if (ff.exitCode !== null) break; // ffmpeg died — stop feeding
      const t = i / fps;
      const dataUrl = await page.evaluate(
        (tt) => (globalThis as unknown as { __frame(t: number): Promise<string> }).__frame(tt as number),
        t,
      );
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); // backpressure
      opts.onProgress?.({ frame: i + 1, totalFrames, ratio: (i + 1) / totalFrames });
    }
    ff.stdin.end();
    await page.close();
    await ffDone;
  } finally {
    try { if (!ff.stdin.writableEnded) ff.stdin.end(); } catch { /* noop */ }
    if (ff.exitCode === null) { try { ff.kill('SIGKILL'); } catch { /* noop */ } }
    try { await browser?.close(); } catch { /* already closed */ }
    server.close();
  }
}
