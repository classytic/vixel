# Authoring a VixelSpec (agent guide)

A practical reference for an LLM (or a human) emitting a `VixelSpec` — the pure-data
composition contract every vixel renderer consumes. The full type shape lives in
[`ARCHITECTURE.md`](../ARCHITECTURE.md) and `@classytic/vixel-schema`; this page is the
**workflow**: discover the vocabulary → emit → validate → retry, deterministically.

> One rule above all: a spec is **pure data**. No code, no functions, no `Date.now()`.
> The same spec must render identically in the editor preview, the ffmpeg tier, the
> headless-Pixi server tier, and the in-browser WebCodecs tier.

## 1. Discover the vocabulary (don't guess ids)

Effects, transitions (and motions, as they land) are a **closed, registry-backed
vocabulary**. Never invent an id — enumerate the live set and pick by *meaning*:

```ts
import { describeCatalog } from '@classytic/vixel-schema';

const { filters, effects, transitions, full } = describeCatalog();
// → Markdown lists: `- id — Name (group): description`
// Put `full` in the model's context, then have it choose ONLY from those ids.
```

`describeCatalog()` reflects **registered packs** too (a host's BYO effect/transition
pack appears once registered), so the agent's choices stay in sync with the deployment.

## 2. Validate before you trust it (generate → validate → retry)

An invalid effect id, an out-of-range param, or a malformed clip renders **wrong but
silently** (the engine skips what it can't resolve). Catch it at the boundary:

```ts
import { safeParseSpec, validateSpec } from '@classytic/vixel-schema/validate';

const r = safeParseSpec(modelOutput);
if (!r.success) {
  // Feed these back to the model and ask it to fix ONLY these issues, then re-emit.
  const issues = validateSpec(modelOutput).errors; // ["tracks.0.clips.1.media.effect.id: unknown effect id \"glow2\" …"]
  // …retry with `issues` appended to the prompt…
} else {
  render(r.data); // typed VixelSpec
}
```

Validation is **structural + semantic**: it checks the contract shape AND that every
`EffectRef`/`TransitionRef` id resolves in the registry with in-range params. It is
**forward-compatible** (unknown keys are stripped, not rejected), so a spec authored
against a newer schema still validates against an older validator.

`@classytic/vixel-schema/validate` is an **opt-in subpath** (needs `zod` ≥4 as a peer);
the core `@classytic/vixel-schema` import stays zero-dependency.

## 3. Determinism: never use `Math.random()` / `Date.now()`

Spec evaluation is a pure function of `(frame, fps, seed)`. If a composition needs
randomness (jitter, scatter, grain phase), set `metadata.seed` and let the renderer
derive values with the shared PRNG — so every tier and every re-render match:

```ts
import { specSeed, frameRandom } from '@classytic/vixel-schema';

const seed = specSeed(spec.metadata?.seed); // number | "any-string" | undefined → stable
const jitter = frameRandom(seed, frame, /*salt*/ 0); // deterministic [0,1) per frame
```

A given `seed` always produces the same video. Omit it and you still get a stable
default (never time-based).

## 4. Export tiers (host-side, not your concern as an author)

The same spec drives four sinks — you author once:

| Tier | When | Notes |
|---|---|---|
| **Pixi preview** | live editor | WYSIWYG source of truth |
| **WebCodecs (browser)** | shorts, ≤1440p | zero server cost; `canExportInBrowser()` + `withinBrowserBudget()` gate it |
| **headless-Pixi (server)** | premium / long / 4K | pixel-parity with preview |
| **ffmpeg (server)** | fast tier / fallback | degrades premium GL transitions |

The client exporter waits for `document.fonts.ready` before rendering, so text never
exports with a fallback font — author with whatever `fontFamily` you load.

## 5. Minimal valid spec

```jsonc
{
  "version": 1,
  "output": { "width": 1080, "height": 1920, "fps": 30 },
  "metadata": { "seed": "my-short-001" },
  "tracks": [
    { "type": "visual", "clips": [
      { "media": { "kind": "image", "source": "https://…/a.jpg" }, "at": 0, "duration": 2.5,
        "enter": "fadeIn", "exit": "fadeOut" }
    ]},
    { "type": "audio", "items": [ { "source": "https://…/vo.mp3", "at": 0, "in": 0, "out": 2.5 } ] }
  ]
}
```

Run it through `safeParseSpec` before rendering. That's the whole loop.
