# @classytic/vixel-ui

## 0.4.0

Requires **`@classytic/vixel-schema` ≥ 0.5.0**.

### ⚠️ Breaking — selection is now id-addressed

Selection refs no longer carry array positions; they name elements by stable id, so a
selection survives any insert/move/sort without drift.

- `SelectionRef` is now `{ kind, id }` (was `{ kind, trackIndex, itemIndex, id? }`).
- `SeamRef` is now `{ trackId, afterClipId }` (was `{ trackIndex, gap, … }`).
- `actions.select(target)` / `actions.selectSeam(target)` take the new positional input
  types **`SelectionTarget`** `{ kind, trackIndex, itemIndex }` / **`SeamTarget`**
  `{ trackIndex, gap }` — so existing call sites that pass positions keep working.
- `onSelect(ref)` now emits the id-based `SelectionRef`.

**Migration:** anywhere you read `selection.trackIndex` / `selection.itemIndex` off the
*stored* selection (or off `onSelect`), resolve it first:

```ts
import { resolveSelection, resolveSeam } from '@classytic/vixel-ui';
const pos = resolveSelection(spec, selection); // { trackIndex, itemIndex, track, item } | null
```

`resolveSelection` / `resolveSeam` / `selectionRefAt` / `seamRefAt` / `pruneSelection` /
`pruneSeam` are exported.

### Added
- **`MarkerRail`** primitive + **`useMarkers`** hook — a timeline marker rail (pins,
  click-to-seek, drag-to-retime, double-click rename, kind/color), with a `renderMarker`
  prop for custom pins. Backed by the schema's marker commands + chapter export.
- **Looping** is honored in the Pixi preview (video repeats its source; audio loops to
  `loopDuration`).

### Internal
- The edit reducer (`applyCommand`, `EditorCommand`, `ClipPatch`, `with*()` primitives)
  moved to `@classytic/vixel-schema`; this package re-exports them unchanged. Fixed a
  latent non-loop-aware duplicate of `totalDurationSec`.
