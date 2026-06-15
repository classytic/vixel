# @classytic/vixel-ui

**Headless, configurable React editor primitives for [vixel](https://github.com/classytic/vixel).**
A timeline UI over the `VixelSpec` contract — the same spec an agent emits, a human
edits, and `@classytic/vixel` renders. Built for React 19.

> **One contract, two authors.** The agent emits a `VixelSpec`; `vixel-ui` lets a human
> tweak the *same* spec; `vixel` renders it to MP4. No second composition model, no drift.

## Why

- **🎛️ Headless**: no default styles, no shadow DOM. Render-prop + children-as-function. You own every pixel (Tailwind-ready via `data-*` hooks).
- **⚡ React 19 native**: `use()`, `useSyncExternalStore`, selector subscriptions — high-frequency playhead updates don't re-render the tree.
- **🧩 Capability-rich, client-configurable**: every tool lives here; a client app enables a subset via the `features` prop. Unused features tree-shake out.
- **📜 Contract-first**: edits a `VixelSpec` (from `@classytic/vixel`). Export = `compose(spec)`.
- **🪶 Zero-bloat**: ESM-only, `sideEffects: false`, subpath exports.

## Install

```bash
npm install @classytic/vixel-ui @classytic/vixel react react-dom
```

## Quick start

```tsx
import { VixelEditor } from '@classytic/vixel-ui';
import { Timeline, TimeRuler, Playhead, TimelineTrack, TimelineClip } from '@classytic/vixel-ui/timeline';
import { PlayButton, TimeDisplay } from '@classytic/vixel-ui/transport';
import type { VixelSpec } from '@classytic/vixel/compose';

export function Editor({ spec, onChange }: { spec: VixelSpec; onChange: (s: VixelSpec) => void }) {
  return (
    <VixelEditor
      spec={spec}
      features={{ transitions: true, kenBurns: true, captions: true }}
      onChange={onChange}
    >
      <div className="flex items-center gap-2">
        <PlayButton className="px-3 py-1 rounded bg-black text-white" />
        <TimeDisplay />
      </div>

      <Timeline className="relative h-40 bg-neutral-900">
        <TimeRuler className="h-6" />
        {(tracks) =>
          tracks.map((t) => (
            <TimelineTrack key={t.index} track={t} className="h-12">
              {(clip) => (
                <TimelineClip
                  clip={clip}
                  className="rounded bg-indigo-600 data-[selected=true]:ring-2"
                />
              )}
            </TimelineTrack>
          ))
        }
        <Playhead className="w-px bg-red-500" />
      </Timeline>
    </VixelEditor>
  );
}
```

## Packages

| Package | Role |
| --- | --- |
| [`@classytic/vixel`](https://github.com/classytic/vixel) | render engine + `VixelSpec` + export (ffmpeg) |
| **`@classytic/vixel-ui`** | this — headless editor primitives over the spec |
| `@classytic/react-media` | optional peer — preview playback (`PreviewSurface`) |

## Subpath exports

- `@classytic/vixel-ui` — `VixelEditor`, store hooks, types
- `@classytic/vixel-ui/timeline` — `Timeline`, `TimeRuler`, `Playhead`, `TimelineTrack`, `TimelineClip`
- `@classytic/vixel-ui/transport` — `PlayButton`, `TimeDisplay`, `PreviewSurface`
- `@classytic/vixel-ui/shared` — time/spec utilities

## License

MIT © Classytic
