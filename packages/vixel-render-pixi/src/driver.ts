/**
 * Pluggable browser driver — the headless tier needs a real WebGL2 context, which
 * only a browser provides; this is the thin "remote control" that launches one
 * from Node. We support whatever the consumer installed (playwright-core OR
 * puppeteer-core) behind one minimal interface, and bundle NONE of them — they're
 * optional peers. The browser does the rendering; the driver only operates it.
 */

/** The few page operations the renderer needs, normalized across drivers. */
export interface DriverPage {
  /** Run `fn(arg)` in the page BEFORE its scripts (set a global, etc.). */
  addInitScript(fn: (arg: string) => void, arg: string): Promise<void>;
  goto(url: string): Promise<void>;
  evaluate<T>(fn: (arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T>;
  /** Resolve once `window[flag]` is truthy (the harness signals readiness). */
  waitForReady(flag: string, timeoutMs: number): Promise<void>;
  close(): Promise<void>;
}

export interface DriverBrowser {
  newPage(): Promise<DriverPage>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** Path to the Chromium/Chrome binary (required by the `-core` drivers). */
  executablePath?: string;
  args?: string[];
  headless?: boolean;
}

export interface BrowserDriver {
  readonly name: 'playwright-core' | 'puppeteer-core';
  launch(opts: LaunchOptions): Promise<DriverBrowser>;
}

const SWIFTSHADER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function wrapPlaywright(chromium: any): BrowserDriver {
  return {
    name: 'playwright-core',
    async launch(opts) {
      const browser = await chromium.launch({
        headless: opts.headless ?? true,
        executablePath: opts.executablePath,
        args: opts.args ?? SWIFTSHADER_ARGS,
      });
      return {
        async newPage() {
          const page = await browser.newPage();
          return {
            addInitScript: (fn, arg) => page.addInitScript(fn, arg),
            goto: (url) => page.goto(url).then(() => undefined),
            evaluate: (fn, arg) => page.evaluate(fn, arg),
            waitForReady: (flag, t) =>
              page.waitForFunction(`window[${JSON.stringify(flag)}] === true`, { timeout: t }).then(() => undefined),
            close: () => page.close(),
          } as DriverPage;
        },
        close: () => browser.close(),
      };
    },
  };
}

function wrapPuppeteer(puppeteer: any): BrowserDriver {
  return {
    name: 'puppeteer-core',
    async launch(opts) {
      const browser = await puppeteer.launch({
        headless: opts.headless ?? true,
        executablePath: opts.executablePath,
        args: opts.args ?? SWIFTSHADER_ARGS,
      });
      return {
        async newPage() {
          const page = await browser.newPage();
          return {
            addInitScript: (fn, arg) => page.evaluateOnNewDocument(fn, arg),
            goto: (url) => page.goto(url).then(() => undefined),
            evaluate: (fn, arg) => page.evaluate(fn, arg),
            waitForReady: (flag, t) =>
              page.waitForFunction(`window[${JSON.stringify(flag)}] === true`, { timeout: t }).then(() => undefined),
            close: () => page.close(),
          } as DriverPage;
        },
        close: () => browser.close(),
      };
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Resolve a browser driver from whatever optional peer is installed (preferring
 * an explicit `prefer`). Returns null if neither is available — the caller logs +
 * falls back to the ffmpeg tier.
 */
export async function resolveDriver(prefer?: 'playwright-core' | 'puppeteer-core'): Promise<BrowserDriver | null> {
  const order: Array<'playwright-core' | 'puppeteer-core'> =
    prefer === 'puppeteer-core' ? ['puppeteer-core', 'playwright-core'] : ['playwright-core', 'puppeteer-core'];
  for (const name of order) {
    try {
      const mod: any = await import(/* @vite-ignore */ name); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (name === 'playwright-core' && mod.chromium) return wrapPlaywright(mod.chromium);
      if (name === 'puppeteer-core') return wrapPuppeteer(mod.default ?? mod);
    } catch {
      /* not installed — try the next */
    }
  }
  return null;
}
