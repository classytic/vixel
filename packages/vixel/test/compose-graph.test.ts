/**
 * filter_complex graph builder — golden unit tests (pure, no ffmpeg).
 *
 * Unified-lane model: the main track is a `sequential` visual lane; overlays are
 * clips on later (non-sequential) visual lanes. Stacking is POSITIONAL (track
 * index, then clip index). Placement is `transform.frame`-driven.
 */

import { describe, it, expect } from 'vitest';
import { planTimeline } from '../src/compose/timeline.js';
import { buildComposeGraph } from '../src/compose/graph.js';
import { registerEffect } from '../src/effects/index.js';
import type { VixelSpec, VisualClip, AudioItem, SequenceTransition } from '../src/compose/schema.js';

const out = { width: 1280, height: 720, fps: 30 };

/** Lay video clips end-to-end as the sequential main track. */
function mainClips(durations: number[]): VisualClip[] {
  let at = 0;
  return durations.map((duration, i) => {
    const clip: VisualClip = { media: { kind: 'video', source: `${'abcde'[i]}.mp4` }, at, duration };
    at += duration;
    return clip;
  });
}

const tr = (i: number, id: string, duration: number): SequenceTransition => ({
  between: [i, i + 1],
  transition: { id, duration },
});

function spec(clips: VisualClip[], audio?: AudioItem[], transitions?: SequenceTransition[]): VixelSpec {
  const main = { type: 'visual' as const, sequential: true, clips, ...(transitions ? { transitions } : {}) };
  return {
    version: 1,
    output: out,
    tracks: audio ? [main, { type: 'audio', items: audio }] : [main],
  };
}

function graphFor(clips: VisualClip[], clipHasAudio: boolean[], audio?: AudioItem[], transitions?: SequenceTransition[]) {
  const s = spec(clips, audio, transitions);
  return buildComposeGraph({ spec: s, plan: planTimeline(clips, undefined, transitions), clipHasAudio });
}

describe('buildComposeGraph — video', () => {
  it('scales/cover-crops/fps-normalizes each clip (cover is the default fit)', () => {
    const g = graphFor(mainClips([3]), [true]);
    expect(g.filterComplex).toContain('[0:v]trim=start=0:duration=3');
    expect(g.filterComplex).toContain('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720');
    expect(g.filterComplex).toContain('fps=30');
  });

  it('pads (letterbox) when a clip explicitly sets fit=contain', () => {
    const clips: VisualClip[] = [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3, transform: { fit: 'contain' } }];
    const g = graphFor(clips, [true]);
    expect(g.filterComplex).toContain('scale=1280:720:force_original_aspect_ratio=decrease');
    expect(g.filterComplex).toContain('pad=1280:720');
  });

  it('builds an xfade chain with the planned offset for crossfades', () => {
    const g = graphFor(mainClips([3, 3]), [true, true], undefined, [tr(0, 'dissolve', 0.5)]);
    expect(g.filterComplex).toContain('xfade=transition=dissolve:duration=0.5:offset=2.5[vout]');
    expect(g.videoLabel).toBe('[vout]');
  });

  it('uses concat for all-hard-cut timelines', () => {
    const g = graphFor(mainClips([2, 2]), [true, true]);
    expect(g.filterComplex).toContain('concat=n=2:v=1:a=0[vout]');
    expect(g.filterComplex).not.toContain('xfade');
  });

  it('supports a MIXED hard-cut + crossfade timeline (per-gap fold)', () => {
    const g = graphFor(mainClips([2, 2, 2]), [true, true, true], undefined, [tr(0, 'fade', 0.5)]);
    // gap0 crossfades, gap1 concats — both in one graph
    expect(g.filterComplex).toContain('xfade=transition=fade:duration=0.5');
    expect(g.filterComplex).toContain('[vx1][v2]concat=n=2:v=1:a=0[vout]');
    expect(g.filterComplex).toContain('[ax1][a2]concat=n=2:v=0:a=1[aprog]');
  });

  it('resolves registry transition ids (e.g. cube → an xfade name)', () => {
    const g = graphFor(mainClips([2, 2]), [true, true], undefined, [tr(0, 'cube', 0.5)]);
    expect(g.filterComplex).toContain('xfade=transition=slideleft:duration=0.5'); // cube.ffmpeg.xfade
  });
});

describe('buildComposeGraph — audio', () => {
  it('synthesizes silence for a clip with no audio stream, normalized to 48k stereo', () => {
    const g = graphFor(mainClips([3]), [false]);
    expect(g.filterComplex).toContain('anullsrc=r=48000:cl=stereo,atrim=duration=3');
    expect(g.filterComplex).toContain('aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo');
  });

  it('normalizes every audio leaf so combiners do not fail on rate/layout mismatch', () => {
    const g = graphFor(
      mainClips([2, 2]),
      [true, false], // mixed: one real, one silent
      [{ source: 'm.mp3', role: 'music' }],
    );
    // both clip audios + the bed carry the canonical aformat
    expect((g.filterComplex.match(/aformat=sample_fmts=fltp:channel_layouts=stereo/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('crossfades clip audio to mirror the video', () => {
    const g = graphFor(mainClips([3, 3]), [true, true], undefined, [tr(0, 'dissolve', 0.5)]);
    expect(g.filterComplex).toContain('acrossfade=d=0.5[aprog]');
  });

  it('mixes + sidechain-ducks a music bed under the program audio', () => {
    const g = graphFor(mainClips([4]), [true], [{ source: 'music.mp3', role: 'music', duck: { amount: -12 } }]);
    expect(g.inputs.map((x) => x.source)).toContain('music.mp3'); // bed added as an input
    expect(g.filterComplex).toContain('sidechaincompress');
    expect(g.filterComplex).toContain('amix=inputs=2');
    expect(g.audioLabel).toBe('[aout]');
  });

  it('mixes a music bed without ducking when no duck is set', () => {
    const g = graphFor(mainClips([4]), [true], [{ source: 'm.mp3', role: 'music' }]);
    expect(g.filterComplex).toContain('amix=inputs=2');
    expect(g.filterComplex).not.toContain('sidechaincompress');
  });
});

describe('buildComposeGraph — image/GIF overlays (frame-positioned)', () => {
  const withOverlay = (overlay: VisualClip) => {
    const s: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'visual', sequential: true, clips: mainClips([5]) },
        { type: 'visual', clips: [overlay] },
      ],
    };
    return buildComposeGraph({ spec: s, plan: planTimeline(mainClips([5])), clipHasAudio: [true] });
  };

  it('composites a logo into its frame box (cover-fit), timed via enable', () => {
    // frame {x:0.75,y:0.05,w:0.2,h:0.1} on a 1280x720 canvas → box 256x72 at (960,36)
    const g = withOverlay({
      media: { kind: 'image', source: 'logo.png' },
      at: 0,
      duration: 5,
      transform: { frame: { x: 0.75, y: 0.05, w: 0.2, h: 0.1 } },
    });
    expect(g.inputs.map((i) => i.source)).toContain('logo.png');
    expect(g.inputs.find((i) => i.source === 'logo.png')?.options).toEqual(['-loop', '1']); // still → loop
    expect(g.filterComplex).toContain('scale=256:72:force_original_aspect_ratio=increase,crop=256:72');
    expect(g.filterComplex).toContain("overlay=x=960:y=36:enable='between(t,0,5)'");
    expect(g.videoLabel).toBe('[ovv0]');
  });

  it('loops a GIF source with -ignore_loop 0', () => {
    const g = withOverlay({
      media: { kind: 'image', source: 'sticker.gif' },
      at: 1,
      duration: 2,
      transform: { frame: { x: 0.4, y: 0.7, w: 0.2, h: 0.2 } },
    });
    expect(g.inputs.find((i) => i.source === 'sticker.gif')?.options).toEqual(['-ignore_loop', '0']);
    expect(g.filterComplex).toContain("enable='between(t,1,3)'");
  });

  it('applies opacity via colorchannelmixer', () => {
    const g = withOverlay({ media: { kind: 'image', source: 'wm.png' }, at: 0, duration: 5, transform: { opacity: 0.5 } });
    expect(g.filterComplex).toContain('colorchannelmixer=aa=0.5');
  });

  it('fades an overlay in/out (alpha, keyed to its on-screen window)', () => {
    const g = withOverlay({ media: { kind: 'image', source: 'l.png' }, at: 1, duration: 3, enter: 'fadeIn', exit: 'fadeOut' });
    expect(g.filterComplex).toContain('format=rgba');
    expect(g.filterComplex).toContain('fade=t=in:st=1:d=0.35:alpha=1');
    expect(g.filterComplex).toContain('fade=t=out:st=3.65:d=0.35:alpha=1'); // 1+3−0.35 (ENTRANCE_DEFAULTS)
  });

  it('a full-frame blend-mode overlay composites via blend (VFX layer)', () => {
    const g = withOverlay({ media: { kind: 'image', source: 'leak.png', blend: 'screen' }, at: 0, duration: 5 });
    expect(g.filterComplex).toContain('blend=all_mode=screen');
  });
});

describe('buildComposeGraph — positional layer order', () => {
  // Stacking is purely (track index, clip index): later = on top. There is no
  // z-by-kind anymore — a text lane BELOW a subject lane renders behind it.
  const layered = (textAssLayers: { order: number; assPath: string }[], clips: VisualClip[]) => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'visual', sequential: true, clips: mainClips([5]) },
        { type: 'visual', clips },
      ],
    };
    return buildComposeGraph({
      spec,
      plan: planTimeline(mainClips([5])),
      clipHasAudio: [true],
      textAssLayers,
    });
  };

  it('composites overlay clips in array order (text BEHIND a later subject clip)', () => {
    const clips: VisualClip[] = [
      { media: { kind: 'text', text: 'TITLE' }, at: 0, duration: 5 }, // order 0 — behind
      { media: { kind: 'image', source: 'subject.png' }, at: 0, duration: 5, transform: { frame: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } } }, // order 1 — front
      { media: { kind: 'text', text: 'caption' }, at: 0, duration: 5 }, // order 2 — top
    ];
    const fc = layered(
      [
        { order: 0, assPath: '/tmp/title.ass' },
        { order: 2, assPath: '/tmp/caption.ass' },
      ],
      clips,
    ).filterComplex;
    const iTitle = fc.indexOf('title.ass'); // order 0, behind
    const iSubject = fc.indexOf('overlay='); // order 1, the image overlay
    const iCaption = fc.indexOf('caption.ass'); // order 2, on top
    expect(iTitle).toBeGreaterThan(-1);
    expect(iTitle).toBeLessThan(iSubject); // title burned BEFORE the subject → behind it
    expect(iSubject).toBeLessThan(iCaption); // subject before the top caption
  });

  it('a text lane after an image lane renders text on top (positional, no z-by-kind)', () => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'visual', sequential: true, clips: mainClips([5]) },
        { type: 'visual', clips: [{ media: { kind: 'image', source: 'logo.png' }, at: 0, duration: 5, transform: { frame: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } } }] },
        { type: 'visual', clips: [{ media: { kind: 'text', text: 'hi' }, at: 0, duration: 5 }] },
      ],
    };
    const fc = buildComposeGraph({
      spec,
      plan: planTimeline(mainClips([5])),
      clipHasAudio: [true],
      textAssLayers: [{ order: 1, assPath: '/tmp/hi.ass' }],
    }).filterComplex;
    // image lane composites first, text lane after → text on top.
    expect(fc.indexOf('overlay=')).toBeLessThan(fc.indexOf('hi.ass'));
  });
});

describe('buildComposeGraph — clip rotation', () => {
  const rotated = (clip: VisualClip) =>
    buildComposeGraph({
      spec: { version: 1, output: out, tracks: [{ type: 'visual', sequential: true, clips: [clip] }] },
      plan: planTimeline([clip]),
      clipHasAudio: [true],
    }).filterComplex;

  const vclip = (transform?: VisualClip['transform']): VisualClip => ({
    media: { kind: 'video', source: 'a.mp4' },
    at: 0,
    duration: 3,
    ...(transform ? { transform } : {}),
  });

  it('rotates a full-frame clip around center (the "Auto" case)', () => {
    const fc = rotated(vclip({ fit: 'cover', rotation: -41 }));
    expect(fc).toContain('rotate=-0.71558:c=0x000000'); // -41° in rad, filled with bg
  });

  it('a clip with no rotation emits no rotate filter (no regression)', () => {
    expect(rotated(vclip())).not.toContain('rotate=');
  });

  it('a clip with opacity < 1 blends over the background canvas', () => {
    const fc = rotated(vclip({ opacity: 0.55 }));
    expect(fc).toContain('format=rgba,colorchannelmixer=aa=0.55');
    expect(fc).toContain('color=c=0x000000:s=1280x720');
    expect(fc).toMatch(/\[cbg0\]\[ctmp0\]overlay=0:0:format=auto,format=yuv420p\[v0\]/);
  });

  it('a fully opaque clip stays on the simple path (no bg compositing)', () => {
    const fc = rotated(vclip());
    expect(fc).not.toContain('colorchannelmixer=aa=');
    expect(fc).not.toContain('[cbg0]');
  });

  it('a FRAMED rotated clip rotates as a unit + composites over a bg canvas (matches preview)', () => {
    const fc = rotated(vclip({ fit: 'cover', frame: { x: 0, y: 0, w: 1, h: 0.5 }, rotation: 25 }));
    // out is 1280x720 → box 1280x360. rotated bbox grows; corners transparent (c=none).
    expect(fc).toContain('format=rgba,rotate=0.43633:'); // 25° in rad
    expect(fc).toContain(':c=none');
    expect(fc).toContain('color=c=0x000000:s=1280x720'); // bg canvas to composite onto
    expect(fc).toMatch(/\[cbg0\]\[crot0\]overlay=-?\d+:-?\d+:format=auto,format=yuv420p\[v0\]/);
  });
});

describe('buildComposeGraph — adjustment-effect layers', () => {
  const withEffect = (effect: { id: string; params?: Record<string, number> }, at: number, duration: number) => {
    const spec: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'visual', sequential: true, clips: mainClips([6]) },
        { type: 'visual', clips: [{ media: { kind: 'effect', effect }, at, duration }] },
      ],
    };
    return buildComposeGraph({ spec, plan: planTimeline(mainClips([6])), clipHasAudio: [true] }).filterComplex;
  };

  it('applies the effect to the composite, time-gated to its window', () => {
    const fc = withEffect({ id: 'grayscale' }, 2, 3);
    expect(fc).toMatch(/hue=s=0:enable='between\(t,2,5\)'\[vfx\d+\]/);
  });

  it('passes effect params through, still gated', () => {
    const fc = withEffect({ id: 'blur', params: { amount: 12 } }, 1, 2);
    expect(fc).toContain("gblur=sigma=12:enable='between(t,1,3)'");
  });

  it('gates a BARE (no-arg) filter with `=enable`, not the invalid `:enable`', () => {
    // ffmpeg's first option separator after a filter NAME is `=`, not `:`. A bare
    // filter like `vignette`/`negate` must be `vignette=enable=…` — `vignette:enable=…`
    // is a hard "Invalid argument" parse error (the effect-layer export crash).
    const vig = withEffect({ id: 'vignette' }, 0, 2);
    expect(vig).toContain("vignette=enable='between(t,0,2)'");
    expect(vig).not.toContain('vignette:enable=');
    const inv = withEffect({ id: 'invert' }, 0, 2);
    expect(inv).toContain("negate=enable='between(t,0,2)'");
    expect(inv).not.toContain('negate:enable=');
  });

  it('gates a MULTI-filter effect via split→process→overlay (whole chain bounded, not just the last filter)', () => {
    registerEffect('test:chain', () => 'eq=contrast=1.2,hue=s=0');
    const fc = withEffect({ id: 'test:chain' }, 1, 2);
    expect(fc).toMatch(/\[[^\]]+\]split\[fxb\d+\]\[fxs\d+\]/); // composite split
    expect(fc).toMatch(/\[fxs\d+\]eq=contrast=1\.2,hue=s=0\[fxp\d+\]/); // full chain on the copy
    expect(fc).toMatch(/\[fxb\d+\]\[fxp\d+\]overlay=enable='between\(t,1,3\)':format=auto,format=yuv420p\[vfx\d+\]/);
    expect(fc).not.toContain('hue=s=0:enable='); // NOT the broken inline (enable on last filter only)
  });

  it('a spec with no effect layer emits no enable-gated filter (no regression)', () => {
    const spec: VixelSpec = { version: 1, output: out, tracks: [{ type: 'visual', sequential: true, clips: mainClips([3]) }] };
    expect(buildComposeGraph({ spec, plan: planTimeline(mainClips([3])), clipHasAudio: [true] }).filterComplex).not.toContain(':enable=');
  });
});

describe('buildComposeGraph — custom fonts (fontsdir)', () => {
  const textSpec: VixelSpec = {
    version: 1,
    output: out,
    tracks: [
      { type: 'visual', sequential: true, clips: mainClips([5]) },
      { type: 'visual', clips: [{ media: { kind: 'text', text: 'BRAND', style: { fontFamily: 'Acme', fontFile: '/f/Acme.ttf' } }, at: 0, duration: 5 }] },
    ],
  };
  const build = (fontsDir?: string) =>
    buildComposeGraph({
      spec: textSpec,
      plan: planTimeline(mainClips([5])),
      clipHasAudio: [true],
      textAssLayers: [{ order: 0, assPath: '/tmp/t.ass' }],
      ...(fontsDir ? { fontsDir } : {}),
    }).filterComplex;

  it('passes fontsdir + filename to the ass filter when fonts are attached', () => {
    expect(build('/tmp/fonts')).toContain("ass=filename='/tmp/t.ass':fontsdir='/tmp/fonts'");
  });

  it('uses the bare positional ass filename when there is no fontsdir (no regression)', () => {
    const fc = build();
    expect(fc).toContain("ass='/tmp/t.ass'");
    expect(fc).not.toContain('fontsdir');
  });
});

describe('buildComposeGraph — clip animation', () => {
  it('applies a video-safe zoompan (d=1) for ken-burns/zoom', () => {
    const clips: VisualClip[] = [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3, animation: { preset: 'kenBurns', direction: 'in', amount: 0.2 } }];
    const g = buildComposeGraph({
      spec: { version: 1, output: out, tracks: [{ type: 'visual', sequential: true, clips }] },
      plan: planTimeline(clips),
      clipHasAudio: [true],
    });
    expect(g.filterComplex).toContain("zoompan=z='min(1+0.2*on/");
    expect(g.filterComplex).toContain(':d=1:'); // d=1 → video-safe (not d=frames)
    expect(g.filterComplex).toContain('scale=2560:-2'); // prescale W*2
  });

  it('pans (constant zoom, moving x) for a pan direction', () => {
    const clips: VisualClip[] = [{ media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 2, animation: { preset: 'pan', direction: 'left' } }];
    const g = buildComposeGraph({
      spec: { version: 1, output: out, tracks: [{ type: 'visual', sequential: true, clips }] },
      plan: planTimeline(clips),
      clipHasAudio: [true],
    });
    expect(g.filterComplex).toContain("x='(iw-iw/zoom)*on/");
  });
});
