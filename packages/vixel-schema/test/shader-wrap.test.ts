import { describe, it, expect } from 'vitest';
import {
  wrapEffectFragment,
  wrapTransitionFragment,
  substituteParams,
  getTransitionSource,
  registerTransitionSource,
  hasTransitionSource,
  totalDurationSec,
  BUILTIN_TRANSITIONS,
  type VixelSpec,
} from '../src/index.js';

const TIMED_EFFECT = 'vec4 vixelEffect(vec2 uv){ vec4 c=vixelSample(uv); c.g*=0.5+0.5*sin(uTime); return c; }';

describe('wrapEffectFragment (uTime dual-mode)', () => {
  it('live mode declares a PLAIN default-block uniform (Pixi packs+binds it)', () => {
    const { fragment, usesTimeUniform } = wrapEffectFragment(TIMED_EFFECT);
    expect(usesTimeUniform).toBe(true);
    expect(fragment).toContain('uniform float uTime;');
    // NOT a hand-written interface block — Pixi never binds a buffer to that.
    expect(fragment).not.toContain('uniform vixelUniforms');
  });

  it('bake mode inlines uTime as a literal — NO uniform at all (SwiftShader-safe)', () => {
    const { fragment, usesTimeUniform } = wrapEffectFragment(TIMED_EFFECT, { bakeTime: 1.5 });
    expect(usesTimeUniform).toBe(false);
    expect(fragment).toContain('float uTime = 1.5;');
    expect(fragment).not.toContain('uniform float uTime;');
  });

  it('a static effect (no uTime) carries no uniform either way', () => {
    const r = wrapEffectFragment('vec4 vixelEffect(vec2 uv){ return vixelSample(uv); }');
    expect(r.usesTimeUniform).toBe(false);
    expect(r.fragment).not.toContain('uniform float uTime;');
  });
});

describe('wrapTransitionFragment (progress dual-mode)', () => {
  const src = getTransitionSource('crossfade')!;
  it('live mode declares a PLAIN progress uniform (Pixi packs+binds it)', () => {
    const { fragment, usesProgressUniform } = wrapTransitionFragment(src, { ratio: 1 });
    expect(usesProgressUniform).toBe(true);
    expect(fragment).toContain('uniform float progress;');
    expect(fragment).not.toContain('uniform vixelUniforms');
  });
  it('bake mode inlines progress as a literal — NO uniform at all', () => {
    const { fragment, usesProgressUniform } = wrapTransitionFragment(src, { ratio: 1, bakeProgress: 0.5 });
    expect(usesProgressUniform).toBe(false);
    expect(fragment).toContain('float progress = 0.5;');
    expect(fragment).not.toContain('uniform float progress;');
  });
  it('exposes ratio as a baked constant + the two-texture samplers', () => {
    const { fragment } = wrapTransitionFragment(src, { ratio: 1.7777 });
    expect(fragment).toContain('const float ratio = 1.7777;');
    expect(fragment).toContain('getFromColor');
    expect(fragment).toContain('getToColor');
  });
});

describe('substituteParams', () => {
  it('floatifies integer params and defaults missing to 0.0', () => {
    expect(substituteParams('a {{x}} b {{y}} c {{z}}', { x: 2, y: 0.5 })).toBe('a 2.0 b 0.5 c 0.0');
  });
});

describe('getTransitionSource', () => {
  it('resolves curated gl-transitions by id', () => {
    for (const id of ['cube', 'doorway', 'crosswarp', 'GlitchMemories']) {
      expect(getTransitionSource(id)).toContain('transition');
    }
  });
  it('returns undefined for an unknown id', () => {
    expect(getTransitionSource('nope-xyz')).toBeUndefined();
  });

  it('shake>0 injects the vixelShake jitter on the coord (else passes vTextureCoord raw)', () => {
    const src = getTransitionSource('crossfade')!;
    const shaken = wrapTransitionFragment(src, { ratio: 1, shake: 0.012 }).fragment;
    expect(shaken).toContain('vixelShake');
    expect(shaken).toContain('transition(vixelShake(vTextureCoord))');
    const plain = wrapTransitionFragment(src, { ratio: 1 }).fragment;
    expect(plain).not.toContain('vixelShake');
    expect(plain).toContain('transition(vTextureCoord)');
  });

  it('overlay:true declares the uOverlay sampler + getOverlayColor helper (else omitted)', () => {
    const src = getTransitionSource('light-leak-film')!;
    const withOv = wrapTransitionFragment(src, { ratio: 1, overlay: true }).fragment;
    expect(withOv).toContain('uniform sampler2D uOverlay');
    expect(withOv).toContain('getOverlayColor');
    const noOv = wrapTransitionFragment(getTransitionSource('crossfade')!, { ratio: 1 }).fragment;
    expect(noOv).not.toContain('uOverlay');
  });

  it('registerTransitionSource adds a BYO source AND can override a built-in', () => {
    const SWIRL = 'vec4 transition(vec2 uv){ return mix(getFromColor(uv), getToColor(uv), progress); }';
    expect(getTransitionSource('swirl-byo')).toBeUndefined();
    registerTransitionSource('swirl-byo', SWIRL);
    expect(getTransitionSource('swirl-byo')).toBe(SWIRL); // new id resolves
    expect(hasTransitionSource('swirl-byo')).toBe(true);
    // Registered ids take precedence over the inlined core (packs can upgrade stock).
    const OVERRIDE = 'vec4 transition(vec2 uv){ return getToColor(uv); }';
    registerTransitionSource('cube', OVERRIDE);
    expect(getTransitionSource('cube')).toBe(OVERRIDE);
  });

  // Regression: every catalog transition must render its OWN look in the Pixi
  // preview. Only `fade` may resolve to nothing (its crossfade fallback IS a fade);
  // anything else silently crossfading is the bug the user hit ("radial/iris not
  // working", "slide and wipe behave the same").
  const resolve = (id: string) =>
    getTransitionSource(id, BUILTIN_TRANSITIONS.find((d) => d.id === id)?.gl?.shader);

  it('every built-in transition (except fade) resolves to a GL source', () => {
    for (const d of BUILTIN_TRANSITIONS) {
      if (d.id === 'fade') continue; // crossfade fallback === a fade; honest
      expect(resolve(d.id), `${d.id} has no GL source → silently crossfades`).toBeDefined();
    }
  });

  it('slide and wipe of the same direction are DISTINCT shaders', () => {
    for (const dir of ['left', 'right', 'up', 'down']) {
      expect(resolve(`slide${dir}`)).not.toBe(resolve(`wipe${dir}`));
    }
  });
});

describe('totalDurationSec', () => {
  it('takes the latest clip end (overlap baked into `at`): 0.5 + 1.5 = 2.0', () => {
    // Unified model: clips are absolutely timed and a transition overlap is
    // already folded into the incoming clip's `at` (B starts 1.0s before A ends).
    const spec: VixelSpec = {
      version: 1,
      output: { width: 8, height: 8, fps: 30 },
      tracks: [
        {
          type: 'visual',
          clips: [
            { media: { kind: 'image', source: 'a' }, at: 0, duration: 1.5 },
            { media: { kind: 'image', source: 'b' }, at: 0.5, duration: 1.5 },
          ],
          transitions: [{ between: [0, 1], transition: { id: 'cube', duration: 1.0 } }],
        },
      ],
    };
    expect(totalDurationSec(spec)).toBeCloseTo(2.0, 5);
  });
});
