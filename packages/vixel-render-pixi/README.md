# @classytic/vixel-render-pixi

Premium **WYSIWYG server export** for [vixel](https://github.com/classytic). Renders the
**same Pixi scene as the editor** through a headless browser, so gl-transitions, shapes,
and custom shaders — which the ffmpeg filtergraph can only approximate — come out
**byte-for-byte what you previewed**. ffmpeg is used for the encode only.

## Install

Nothing is bundled — bring your own runtimes (all optional peers):

```bash
npm i @classytic/vixel-render-pixi @classytic/vixel-ui @classytic/vixel
npm i playwright-core   # OR: npm i puppeteer-core   (a browser driver — pick one)
```

`*-core` drivers download no browser: point them at a Chromium via `executablePath`.
`ffmpeg` must be on `PATH` (or pass `ffmpegPath`).

## Usage

```ts
import { composeAuto } from '@classytic/vixel-render-pixi';

const { tier, degraded } = await composeAuto(spec, 'out.mp4', {
  executablePath: '/path/to/chrome',
});
```

`composeAuto` auto-routes: the **Pixi tier** when the spec needs it *and* a driver is
installed, otherwise the **fast ffmpeg tier**. If the premium runtime is missing it
**logs a warning and falls back** (gl-transitions → `xfade`) — never crashes, never empty.

### API

| Export | Purpose |
| --- | --- |
| `composeAuto(spec, out, opts)` | Capability-aware router (recommended). |
| `renderSpecWithPixi(spec, out, opts)` | Force the Pixi tier. |
| `specNeedsPixi(spec)` · `canRenderWithPixi()` | Introspection. |

Inject your own logger via `opts.logger` (defaults to console).

## Notes

- **GPU-less servers:** headless Chromium uses SwiftShader, which rejects GLSL uniform
  blocks; the export path bakes `progress`/`uTime` as literals so shaders still render.
- **Containers:** `npm ci` installs the *driver*, not the browser or its OS libs — add
  those to your image (the official `mcr.microsoft.com/playwright` image, `apt-get install
  chromium`, or `@sparticuz/chromium` on Lambda). For offline servers, self-host `pixi.js`
  and pass `pixiUrl`.
- **Audio** is a basic mix (delay + gain + amix); sidechain ducking defers to vixel's
  `compose()`.

MIT © Classytic
