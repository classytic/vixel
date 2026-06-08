/**
 * Captions / ASS generation — unit tests (pure, no ffmpeg).
 *
 * Pins the load-bearing ASS footguns: color byte-swap, centisecond time format,
 * style-line fields, and word-level karaoke timing (the \k sum MUST equal the
 * line duration, including silent gaps — the #1 karaoke desync bug).
 */

import { describe, it, expect } from 'vitest';
import {
  hexToAssBgr,
  msToAssTime,
  buildStyleLine,
  buildCueText,
  cueEvents,
  buildAss,
} from '../src/captions/ass.js';
import { CAPTION_PRESETS } from '../src/captions/presets.js';
import { burnCaptions } from '../src/captions/burn.js';
import { Source } from '../src/primitives/source.js';
import { isConfigError } from '../src/errors.js';
import type { CaptionCue, TextStyle } from '../src/captions/types.js';
import type { VideoMetadata } from '../src/core/probe.js';

describe('hexToAssBgr', () => {
  it('byte-swaps RGB → BGR', () => {
    expect(hexToAssBgr('#FF0000')).toBe('0000FF'); // red
    expect(hexToAssBgr('#00FF00')).toBe('00FF00'); // green
    expect(hexToAssBgr('#0000FF')).toBe('FF0000'); // blue
    expect(hexToAssBgr('FFD400')).toBe('00D4FF'); // tolerant of missing '#'
  });

  it('expands #RGB shorthand', () => {
    expect(hexToAssBgr('#fff')).toBe('FFFFFF');
    expect(hexToAssBgr('f00')).toBe('0000FF'); // red shorthand
  });

  it('rejects malformed colors (closes the comma-into-CSV vector)', () => {
    for (const bad of ['red', '#12', 'a,b,c', '#ggffaa', '']) {
      expect(() => hexToAssBgr(bad), bad).toThrow();
    }
  });
});

describe('msToAssTime', () => {
  it('formats centiseconds h:mm:ss.cc', () => {
    expect(msToAssTime(0)).toBe('0:00:00.00');
    expect(msToAssTime(1500)).toBe('0:00:01.50');
    expect(msToAssTime(61_230)).toBe('0:01:01.23');
    expect(msToAssTime(3_661_000)).toBe('1:01:01.00');
  });
});

describe('buildStyleLine', () => {
  it('emits font, size, opaque colors, alignment numpad, and outline border', () => {
    const line = buildStyleLine({ fontFamily: 'Inter', fontSize: 80, alignment: 'bottom' });
    expect(line).toMatch(/^Style: Default,Inter,80,/);
    expect(line).toContain('&H00'); // opaque colors
    expect(line.split(',')[18]).toBe('2'); // Alignment field = bottom (numpad 2)
    expect(line.split(',')[15]).toBe('1'); // BorderStyle = outline
  });

  it('uses an opaque box border when a box is set', () => {
    const line = buildStyleLine({ box: { color: '#000000' } });
    expect(line.split(',')[15]).toBe('3'); // BorderStyle = opaque box
  });

  it('always emits exactly 23 fields (CSV shape is fixed)', () => {
    expect(buildStyleLine({}).split(',')).toHaveLength(23);
  });

  it('neutralizes a comma/newline in fontFamily (no CSV/style injection)', () => {
    const line = buildStyleLine({ fontFamily: 'Arial, Bold\nStyle: Evil,1,2' });
    // The injection is neutralized: still exactly 23 columns, single line, and
    // the malicious comma/newline became spaces (so no extra Style: row).
    expect(line.split(',')).toHaveLength(23);
    expect(line).not.toMatch(/[\r\n]/);
    expect(line.split(',')[1]).not.toContain(','); // Fontname field carries no comma
    expect(line.split('\n')).toHaveLength(1); // no injected second Style line
  });
});

describe('buildCueText — karaoke', () => {
  const cue: CaptionCue = {
    text: 'Hello world',
    startMs: 0,
    endMs: 800,
    words: [
      { text: 'Hello', startMs: 0, endMs: 300 },
      { text: 'world', startMs: 300, endMs: 800 },
    ],
  };

  it('emits per-word \\kf with centisecond durations summing to the line length', () => {
    const text = buildCueText(cue, { animation: 'karaoke' });
    expect(text).toContain('{\\kf30}Hello'); // 300ms → 30cs
    expect(text).toContain('{\\kf50}world'); // 500ms → 50cs
    // sum of \k values must equal (endMs−startMs)/10 = 80cs
    const sum = [...text.matchAll(/\\kf?(\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(sum).toBe(80);
  });

  it('inserts a silent \\k for a leading gap (keeps the sweep in sync)', () => {
    const gapped: CaptionCue = {
      text: 'late',
      startMs: 0,
      endMs: 500,
      words: [{ text: 'late', startMs: 100, endMs: 500 }],
    };
    const text = buildCueText(gapped, { animation: 'karaoke' });
    expect(text).toContain('{\\k10}'); // 100ms leading gap
    const sum = [...text.matchAll(/\\kf?(\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(sum).toBe(50); // 10 gap + 40 word = 50cs = 500ms
  });

  it('pop animation times each word with \\t relative to line start', () => {
    const text = buildCueText(cue, { animation: 'pop' });
    expect(text).toContain('\\fscx70'); // start scale
    expect(text).toContain('\\t(300,'); // second word pops at its 300ms start
  });

  it('defaults to karaoke when words are present and no animation given', () => {
    expect(buildCueText(cue, {})).toContain('{\\kf');
  });

  it('fades the whole line when there are no words', () => {
    const text = buildCueText({ text: 'plain', startMs: 0, endMs: 1000 }, { animation: 'fade' });
    expect(text).toContain('{\\fad(150,150)}plain');
  });

  it('keeps Σ\\k ≤ line duration for adversarial word lists (no desync/negatives)', () => {
    const sumOf = (t: string) => [...t.matchAll(/\\kf?(\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    const lineCs = (c: CaptionCue) => Math.round((c.endMs - c.startMs) / 10);
    const adversarial: CaptionCue[] = [
      // out-of-order
      { text: 'x', startMs: 0, endMs: 800, words: [
        { text: 'b', startMs: 400, endMs: 800 }, { text: 'a', startMs: 0, endMs: 400 }] },
      // overlapping (start < prev end)
      { text: 'x', startMs: 0, endMs: 600, words: [
        { text: 'a', startMs: 0, endMs: 500 }, { text: 'b', startMs: 300, endMs: 600 }] },
      // word ending after the cue
      { text: 'x', startMs: 0, endMs: 500, words: [{ text: 'a', startMs: 0, endMs: 9000 }] },
      // word before the cue
      { text: 'x', startMs: 1000, endMs: 1500, words: [{ text: 'a', startMs: 0, endMs: 200 }] },
      // zero-duration word
      { text: 'x', startMs: 0, endMs: 500, words: [{ text: 'a', startMs: 250, endMs: 250 }] },
    ];
    for (const cue of adversarial) {
      const text = buildCueText(cue, { animation: 'karaoke' });
      expect(sumOf(text)).toBeLessThanOrEqual(lineCs(cue));
      expect(text).not.toMatch(/\\kf?-/); // never a negative centisecond value
    }
  });
});

describe('burnCaptions guards + filter escaping', () => {
  const meta: VideoMetadata = {
    duration: 5, width: 1080, height: 1920, bitrate: 5000, fps: 30, codec: 'h264', hasAudio: true,
  };
  const src = Source.fromMetadata('in.mp4', meta);
  const cues: CaptionCue[] = [{ text: 'hi', startMs: 0, endMs: 500, words: [{ text: 'hi', startMs: 0, endMs: 500 }] }];

  it('escapes a single quote in fontsDir (no filtergraph breakout)', async () => {
    let vf = '';
    await burnCaptions(src, cues, 'out.mp4', {
      dryRun: true,
      fontsDir: "/fonts/O'Brien",
      onCommand: (c) => {
        const i = c.args.indexOf('-vf');
        vf = i >= 0 ? c.args[i + 1] ?? '' : '';
      },
    });
    expect(vf).toContain("'\\''"); // the quote was neutralized
    expect(vf).toMatch(/^ass='/);
  });

  it('rejects empty cues', async () => {
    await expect(burnCaptions(src, [], 'out.mp4', { dryRun: true })).rejects.toSatisfy(isConfigError);
  });

  it('rejects when no canvas can be resolved', async () => {
    const noDims = { inputPath: 'in.mp4', duration: 5 }; // VideoSource without width/height
    await expect(burnCaptions(noDims, cues, 'out.mp4', { dryRun: true })).rejects.toSatisfy(isConfigError);
  });
});

describe('CapCut-style modes', () => {
  const cue: CaptionCue = {
    text: 'big bold words',
    startMs: 0,
    endMs: 900,
    words: [
      { text: 'big', startMs: 0, endMs: 300 },
      { text: 'bold', startMs: 300, endMs: 600 },
      { text: 'words', startMs: 600, endMs: 900 },
    ],
  };

  it('highlight: each word ramps to the accent color + scales, then reverts', () => {
    const text = buildCueText(cue, { animation: 'highlight', fillColor: '#FFFFFF', highlightColor: '#39FF14' });
    expect(text).toContain('\\1c&H14FF39&'); // highlight color (BGR of 39FF14)
    expect(text).toContain('\\1c&HFFFFFF&'); // reverts to fill
    expect(text).toContain(`\\fscx112`); // scales up
    expect(text).toMatch(/\\t\(0,80,/); // first word ramps at its window
  });

  it('word-by-word: one Dialogue event PER word', () => {
    const events = cueEvents(cue, { animation: 'word-by-word' });
    expect(events).toHaveLength(3);
    expect(events.map((e) => [e.startMs, e.endMs])).toEqual([[0, 300], [300, 600], [600, 900]]);
    expect(events[0]!.text).toContain('big');
    expect(events[0]!.text).toContain('\\fad('); // each word fades/pops in
  });

  it('highlight-box: one event per word AND a boxed style (BorderStyle 3)', () => {
    const events = cueEvents(cue, { animation: 'highlight-box' });
    expect(events).toHaveLength(3);
    const line = buildStyleLine({ animation: 'highlight-box', highlightColor: '#FFE600' });
    expect(line.split(',')[15]).toBe('3'); // opaque box border implied by the mode
  });

  it('single-event modes still produce one event', () => {
    expect(cueEvents(cue, { animation: 'karaoke' })).toHaveLength(1);
    expect(cueEvents(cue, { animation: 'highlight' })).toHaveLength(1);
  });
});

describe('buildAss', () => {
  it('emits a complete ASS document', () => {
    const style: TextStyle = CAPTION_PRESETS['tiktok-bold'];
    const ass = buildAss(
      [{ text: 'hi', startMs: 0, endMs: 1000, words: [{ text: 'hi', startMs: 0, endMs: 1000 }] }],
      style,
      { width: 1080, height: 1920 },
    );
    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('[V4+ Styles]');
    expect(ass).toContain('Style: Default,Montserrat,120');
    expect(ass).toContain('[Events]');
    expect(ass).toMatch(/Dialogue: 0,0:00:00.00,0:00:01.00,Default/);
  });
});
