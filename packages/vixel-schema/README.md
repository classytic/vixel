# @classytic/vixel-schema

**The `VixelSpec` composition contract — zero dependencies.**

The single source of truth for the JSON that an agent emits, an editor edits, and
the engine renders. No ffmpeg, no React — just the types (plus `defineComposition`
and `isMediaReference`).

```
@classytic/vixel-schema   ← the contract (this package)
   ├── @classytic/vixel        engine   → renders a spec to MP4 (server)
   ├── @classytic/vixel-ui     editor   → edits a spec (browser)
   └── your agent              emits a spec
```

Because everyone depends on **this**, the contract never drifts, and a frontend
that mounts the editor never pulls the ffmpeg engine into its dependency tree.

```ts
import { defineComposition, type VixelSpec } from '@classytic/vixel-schema';

export const spec = defineComposition({
  version: 1,
  output: { width: 1080, height: 1920, fps: 30 },
  tracks: [{ type: 'video', clips: [{ source: 'a.mp4', duration: 3 }] }],
});
```

## License

MIT © Classytic
