/**
 * Effect-registry parity — the Pixi preview must cover the same catalog the
 * ffmpeg engine does, so an effect can't render in server export but vanish in
 * the preview/in-browser export (or vice-versa).
 *
 * `BUILTIN_EFFECTS` (schema) is the single source of truth; each renderer keeps
 * its own resolver map (different APIs — Pixi filters vs ffmpeg strings), and a
 * coverage test on each side ties that map back to the catalog. This is the Pixi
 * side; the engine's `effects.test.ts` is the mirror. A gap must be DECLARED on
 * the descriptor (`unsupported: ['pixi']`), never silently missing.
 */
import { describe, it, expect } from 'vitest';
import { BUILTIN_EFFECTS } from '@classytic/vixel-schema';
import type { VixelSpec, EffectRef } from '@classytic/vixel-schema';
import { PIXI_EFFECT_IDS } from './registry.js';

describe('Pixi effect coverage vs BUILTIN_EFFECTS', () => {
  it('renders every filter effect the catalog does not mark unsupported on pixi', () => {
    const required = BUILTIN_EFFECTS.filter((e) => e.kind === 'filter' && !e.unsupported?.includes('pixi')).map(
      (e) => e.id,
    );
    for (const id of required) {
      expect(PIXI_EFFECT_IDS, `no Pixi resolver for '${id}'`).toContain(id);
    }
  });

  it('has no resolver for an effect not in the catalog (no orphans)', () => {
    const catalogIds = new Set(BUILTIN_EFFECTS.map((e) => e.id));
    for (const id of PIXI_EFFECT_IDS) {
      expect(catalogIds, `Pixi resolver '${id}' has no catalog descriptor`).toContain(id);
    }
  });

  it('declared-unsupported effects (e.g. vignette) are intentionally absent', () => {
    const pixiUnsupported = BUILTIN_EFFECTS.filter((e) => e.unsupported?.includes('pixi')).map((e) => e.id);
    for (const id of pixiUnsupported) {
      expect(PIXI_EFFECT_IDS).not.toContain(id);
    }
  });
});

describe('effect references on the unified visual-lane model resolve to a Pixi resolver', () => {
  // A spec in the NEW model: a visual lane whose clips carry per-clip `effects`,
  // plus an `effect`-clip (adjustment layer over the composite). Both are paths
  // the renderer pulls effect ids from — assert each id is either resolvable or a
  // declared gap, so the preview never silently drops a catalog effect.
  const grade: EffectRef = { id: 'grayscale' };
  const adjust: EffectRef = { id: 'sepia' };
  const spec: VixelSpec = {
    version: 1,
    output: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      {
        type: 'visual',
        sequential: true,
        clips: [
          {
            media: { kind: 'image', source: 'https://example.com/a.jpg' },
            at: 0,
            duration: 3,
            effects: [grade],
            transform: { frame: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, style: { radius: 0.1 } },
          },
        ],
      },
      {
        type: 'visual',
        clips: [{ media: { kind: 'effect', effect: adjust }, at: 0, duration: 3 }],
      },
    ],
  };

  it('every referenced builtin effect id has a Pixi resolver (or is a declared gap)', () => {
    const referenced = new Set<string>();
    for (const t of spec.tracks) {
      if (t.type !== 'visual') continue;
      for (const clip of t.clips) {
        for (const e of clip.effects ?? []) referenced.add(e.id);
        if (clip.media.kind === 'effect') referenced.add(clip.media.effect.id);
      }
    }
    expect(referenced).toEqual(new Set(['grayscale', 'sepia']));
    const declaredGaps = new Set(
      BUILTIN_EFFECTS.filter((e) => e.unsupported?.includes('pixi')).map((e) => e.id),
    );
    for (const id of referenced) {
      const ok = PIXI_EFFECT_IDS.includes(id) || declaredGaps.has(id);
      expect(ok, `referenced effect '${id}' is neither resolvable nor a declared pixi gap`).toBe(true);
    }
  });
});
