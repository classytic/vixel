/**
 * filter_complex graph builder — golden unit tests (pure, no ffmpeg).
 */

import { describe, it, expect } from 'vitest';
import { planTimeline } from '../src/compose/timeline.js';
import { buildComposeGraph } from '../src/compose/graph.js';
import type { VixelSpec, Clip, AudioItem } from '../src/compose/schema.js';

const out = { width: 1280, height: 720, fps: 30 };

function spec(clips: Clip[], audio?: AudioItem[]): VixelSpec {
  return {
    version: 1,
    output: out,
    tracks: audio
      ? [{ type: 'video', clips }, { type: 'audio', items: audio }]
      : [{ type: 'video', clips }],
  };
}

function graphFor(clips: Clip[], clipHasAudio: boolean[], audio?: AudioItem[]) {
  const s = spec(clips, audio);
  return buildComposeGraph({ spec: s, plan: planTimeline(clips), clipHasAudio });
}

describe('buildComposeGraph — video', () => {
  it('scales/pads/fps-normalizes each clip', () => {
    const g = graphFor([{ source: 'a.mp4', duration: 3 }], [true]);
    expect(g.filterComplex).toContain('[0:v]trim=start=0:duration=3');
    expect(g.filterComplex).toContain('scale=1280:720:force_original_aspect_ratio=decrease');
    expect(g.filterComplex).toContain('pad=1280:720');
    expect(g.filterComplex).toContain('fps=30');
  });

  it('builds an xfade chain with the planned offset for crossfades', () => {
    const g = graphFor(
      [{ source: 'a.mp4', duration: 3, transition: { type: 'dissolve', duration: 0.5 } }, { source: 'b.mp4', duration: 3 }],
      [true, true],
    );
    expect(g.filterComplex).toContain('xfade=transition=dissolve:duration=0.5:offset=2.5[vout]');
    expect(g.videoLabel).toBe('[vout]');
  });

  it('uses concat for all-hard-cut timelines', () => {
    const g = graphFor([{ source: 'a.mp4', duration: 2 }, { source: 'b.mp4', duration: 2 }], [true, true]);
    expect(g.filterComplex).toContain('concat=n=2:v=1:a=0[vout]');
    expect(g.filterComplex).not.toContain('xfade');
  });

  it('rejects a mixed hard-cut + crossfade timeline (v1)', () => {
    expect(() =>
      graphFor(
        [
          { source: 'a.mp4', duration: 2, transition: { type: 'fade', duration: 0.5 } },
          { source: 'b.mp4', duration: 2 }, // hard cut
          { source: 'c.mp4', duration: 2 },
        ],
        [true, true, true],
      ),
    ).toThrow();
  });
});

describe('buildComposeGraph — audio', () => {
  it('synthesizes silence for a clip with no audio stream, normalized to 48k stereo', () => {
    const g = graphFor([{ source: 'a.mp4', duration: 3 }], [false]);
    expect(g.filterComplex).toContain('anullsrc=r=48000:cl=stereo,atrim=duration=3');
    expect(g.filterComplex).toContain('aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo');
  });

  it('normalizes every audio leaf so combiners do not fail on rate/layout mismatch', () => {
    const g = graphFor(
      [{ source: 'a.mp4', duration: 2 }, { source: 'b.mp4', duration: 2 }],
      [true, false], // mixed: one real, one silent
      [{ source: 'm.mp3', role: 'music' }],
    );
    // both clip audios + the bed carry the canonical aformat
    expect((g.filterComplex.match(/aformat=sample_fmts=fltp:channel_layouts=stereo/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('crossfades clip audio to mirror the video', () => {
    const g = graphFor(
      [{ source: 'a.mp4', duration: 3, transition: { type: 'dissolve', duration: 0.5 } }, { source: 'b.mp4', duration: 3 }],
      [true, true],
    );
    expect(g.filterComplex).toContain('acrossfade=d=0.5[aprog]');
  });

  it('mixes + sidechain-ducks a music bed under the program audio', () => {
    const g = graphFor(
      [{ source: 'a.mp4', duration: 4 }],
      [true],
      [{ source: 'music.mp3', role: 'music', duck: { amount: -12 } }],
    );
    expect(g.inputs.map((x) => x.source)).toContain('music.mp3'); // bed added as an input
    expect(g.filterComplex).toContain('sidechaincompress');
    expect(g.filterComplex).toContain('amix=inputs=2');
    expect(g.audioLabel).toBe('[aout]');
  });

  it('mixes a music bed without ducking when no duck is set', () => {
    const g = graphFor([{ source: 'a.mp4', duration: 4 }], [true], [{ source: 'm.mp3', role: 'music' }]);
    expect(g.filterComplex).toContain('amix=inputs=2');
    expect(g.filterComplex).not.toContain('sidechaincompress');
  });
});

describe('buildComposeGraph — image/GIF overlays', () => {
  const withOverlay = (overlay: import('../src/compose/schema.js').ImageOverlay) => {
    const s: VixelSpec = {
      version: 1,
      output: out,
      tracks: [
        { type: 'video', clips: [{ source: 'a.mp4', duration: 5 }] },
        { type: 'overlay', items: [overlay] },
      ],
    };
    return buildComposeGraph({ spec: s, plan: planTimeline([{ source: 'a.mp4', duration: 5 }]), clipHasAudio: [true] });
  };

  it('composites a logo: scaled, positioned by anchor, timed via enable', () => {
    const g = withOverlay({ kind: 'image', source: 'logo.png', at: 0, duration: 5, position: 'top-right', width: 0.2 });
    // input added with -loop 1 (still image), scaled to 20% of canvas width (1280*0.2=256)
    expect(g.inputs.map((i) => i.source)).toContain('logo.png');
    expect(g.inputs.find((i) => i.source === 'logo.png')?.options).toEqual(['-loop', '1']);
    expect(g.filterComplex).toContain('scale=256:-1');
    expect(g.filterComplex).toContain("overlay=x=W-w-W*0.05:y=H*0.05:enable='between(t,0,5)'");
    expect(g.videoLabel).toBe('[ovv0]');
  });

  it('loops a GIF source with -ignore_loop 0', () => {
    const g = withOverlay({ kind: 'image', source: 'sticker.gif', at: 1, duration: 2, position: { x: 0.5, y: 0.8 } });
    expect(g.inputs.find((i) => i.source === 'sticker.gif')?.options).toEqual(['-ignore_loop', '0']);
    expect(g.filterComplex).toContain("overlay=x=(W*0.5)-(w/2):y=(H*0.8)-(h/2):enable='between(t,1,3)'");
  });

  it('applies opacity via colorchannelmixer', () => {
    const g = withOverlay({ kind: 'image', source: 'wm.png', at: 0, duration: 5, opacity: 0.5 });
    expect(g.filterComplex).toContain('colorchannelmixer=aa=0.5');
  });

  it('fades an overlay in/out (alpha, keyed to its on-screen window)', () => {
    const g = withOverlay({ kind: 'image', source: 'l.png', at: 1, duration: 3, in: 'fadeIn', out: 'fadeOut' });
    expect(g.filterComplex).toContain('format=rgba');
    expect(g.filterComplex).toContain('fade=t=in:st=1:d=0.4:alpha=1');
    expect(g.filterComplex).toContain('fade=t=out:st=3.6:d=0.4:alpha=1'); // 1+3−0.4
  });

  it('animates a keyframed motion path → quoted overlay x/y time-expressions', () => {
    const g = withOverlay({
      kind: 'image', source: 'sticker.png', at: 2, duration: 3,
      motion: [{ t: 0, x: 0.1, y: 0.1 }, { t: 3, x: 0.8, y: 0.8, easing: 'easeOut' }],
    });
    // local time = (t − at); x/y compiled + quoted (commas inside the expr)
    expect(g.filterComplex).toContain("overlay=x='(W*(");
    expect(g.filterComplex).toContain('(t-2)'); // local time offset by `at`
    expect(g.filterComplex).toContain("-(w/2)':y='(H*(");
    expect(g.filterComplex).toContain('between(t,2,5)'); // still timed to its window
  });
});

describe('buildComposeGraph — clip animation', () => {
  it('applies a video-safe zoompan (d=1) for ken-burns/zoom', () => {
    const clips: Clip[] = [{ source: 'a.mp4', duration: 3, animation: { preset: 'kenBurns', direction: 'in', amount: 0.2 } }];
    const g = buildComposeGraph({
      spec: { version: 1, output: out, tracks: [{ type: 'video', clips }] },
      plan: planTimeline(clips),
      clipHasAudio: [true],
    });
    expect(g.filterComplex).toContain("zoompan=z='min(1+0.2*on/");
    expect(g.filterComplex).toContain(':d=1:'); // d=1 → video-safe (not d=frames)
    expect(g.filterComplex).toContain('scale=2560:-2'); // prescale W*2
  });

  it('pans (constant zoom, moving x) for a pan direction', () => {
    const clips: Clip[] = [{ source: 'a.mp4', duration: 2, animation: { preset: 'pan', direction: 'left' } }];
    const g = buildComposeGraph({
      spec: { version: 1, output: out, tracks: [{ type: 'video', clips }] },
      plan: planTimeline(clips),
      clipHasAudio: [true],
    });
    expect(g.filterComplex).toContain("x='(iw-iw/zoom)*on/");
  });
});
