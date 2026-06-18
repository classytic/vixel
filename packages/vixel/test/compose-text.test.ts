/**
 * In-compose text overlays — golden unit tests (pure ASS, no ffmpeg).
 * Verifies multiple BYO-styled, positioned text overlays compile to one ASS doc.
 */

import { describe, it, expect } from 'vitest';
import { buildTextOverlayAss } from '../src/compose/text-overlay.js';
import { loopAt, TEXT_LOOP_PERIOD } from '../src/compose/schema.js';
import type { VisualClip } from '../src/compose/schema.js';

const canvas = { width: 1080, height: 1920 };

/** A text clip. Positioning is purely `transform.frame` now (legacy `position` is gone). */
const text = (over: Partial<VisualClip> & { media: VisualClip['media'] }): VisualClip => ({
  at: 0,
  duration: 2,
  ...over,
} as VisualClip);

describe('buildTextOverlayAss', () => {
  it('authors a named, frame-positioned style + dialogue per clip', () => {
    const overlays: VisualClip[] = [
      // A frame box → \pos at the box top, numpad shifted by style.align (center → 8).
      text({ media: { kind: 'text', text: 'TITLE', style: { fillColor: '#FF0000', fontFamily: 'Bangers' } }, transform: { frame: { x: 0, y: 0.05, w: 1, h: 0.2 } } }),
      // Right-aligned frame → numpad 9.
      text({ media: { kind: 'text', text: 'subtitle', style: { fontFamily: 'Inter', align: 'right' } }, at: 2, transform: { frame: { x: 0.4, y: 0.85, w: 0.5, h: 0.1 } } }),
    ];
    const ass = buildTextOverlayAss(overlays, canvas);

    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Style: ov0,Bangers'); // first clip's named style
    expect(ass).toContain('Style: ov1,Inter');
    // a frame box uses absolute \pos at the box top
    expect(ass).toMatch(/\\pos\(\d+,\d+\)/);
    // dialogues reference their style
    expect(ass).toMatch(/Dialogue: 0,[^,]+,[^,]+,ov0,/);
    expect(ass).toMatch(/Dialogue: 0,[^,]+,[^,]+,ov1,/);
  });

  it('emits a glow layer (blurred colored pass) BEHIND the sharp text', () => {
    const ass = buildTextOverlayAss(
      [text({ media: { kind: 'text', text: 'NEON', style: { glow: { color: '#39FF14', sigma: 8, intensity: 1 } } } })],
      canvas,
    );
    const dlgs = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dlgs).toHaveLength(2); // glow pass + sharp text
    // glow dialogue comes FIRST (drawn behind) and carries \blur + the glow color
    expect(dlgs[0]).toContain('\\blur8');
    expect(dlgs[0]).toContain('&H14FF39&'); // #39FF14 → ASS BBGGRR
    expect(dlgs[0]).toContain('NEON');
    expect(dlgs[1]).not.toContain('\\blur'); // the sharp text on top
  });

  it('emits a soft (blurred) drop-shadow layer behind the text + drops the hard Style shadow', () => {
    const ass = buildTextOverlayAss(
      [text({ media: { kind: 'text', text: 'SOFT', style: { shadow: { depth: 4, color: '#000000', blur: 6 } } } })],
      canvas,
    );
    const dlgs = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dlgs).toHaveLength(2); // shadow pass + sharp text
    expect(dlgs[0]).toContain('\\blur6');
    expect(dlgs[0]).toContain('\\shad4');
    expect(dlgs[0]).toContain('\\4a&H00&'); // shadow opaque; fill/outline hidden
    expect(dlgs[1]).not.toContain('\\blur'); // crisp text on top
    // the hard Style shadow (field index 17) is suppressed so it doesn't double up
    expect(ass.split('\n').find((l) => l.startsWith('Style: ov0'))!.split(',')[17]).toBe('0');
  });

  it('keeps a hard shadow (no blur) on the Style row with no extra layer', () => {
    const ass = buildTextOverlayAss(
      [text({ media: { kind: 'text', text: 'HARD', style: { shadow: { depth: 3, color: '#000000' } } } })],
      canvas,
    );
    expect(ass.split('\n').filter((l) => l.startsWith('Dialogue:'))).toHaveLength(1);
    expect(ass.split('\n').find((l) => l.startsWith('Style: ov0'))!.split(',')[17]).toBe('3');
  });

  it('expands word-timed cues using the caption animation mode', () => {
    const ass = buildTextOverlayAss(
      [
        text({
          duration: 1,
          media: {
            kind: 'text',
            text: 'hi there',
            style: { animation: 'word-by-word' },
            cues: [
              { text: 'hi there', startMs: 0, endMs: 1000, words: [
                { text: 'hi', startMs: 0, endMs: 500 },
                { text: 'there', startMs: 500, endMs: 1000 },
              ] },
            ],
          },
        }),
      ],
      canvas,
    );
    // word-by-word → one Dialogue per word
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0]).toContain('hi');
    expect(dialogues[1]).toContain('there');
  });

  it('applies boxless text fadeIn/fadeOut via \\fad', () => {
    const ass = buildTextOverlayAss(
      [text({ media: { kind: 'text', text: 'hi' }, enter: 'fadeIn', exit: 'fadeOut' })],
      canvas,
    );
    expect(ass).toContain('\\fad(400,400)');
  });

  const loopClip = (loop: VisualClip['loop']) =>
    text({ media: { kind: 'text', text: 'LOOP' }, duration: 2, loop, transform: { frame: { x: 0, y: 0.1, w: 1, h: 0.2 } } });

  it('renders a scale loop (pulse) as chained \\t() sampled from loopAt (parity)', () => {
    const ass = buildTextOverlayAss([loopClip('pulse')], canvas);
    // The keyframe at a quarter period IS a loopAt sample → exact value parity.
    const v = (loopAt('pulse', TEXT_LOOP_PERIOD / 4).scale * 100).toFixed(2);
    expect(ass).toContain(`\\fscx${v}\\fscy${v}`);
    expect(ass).toMatch(/\\t\(\d+,\d+,\\fscx/);
  });

  it('renders a rotation loop (wiggle) as chained \\t(\\frz)', () => {
    const ass = buildTextOverlayAss([loopClip('wiggle')], canvas);
    expect(ass).toMatch(/\\t\(\d+,\d+,\\frz-?\d/);
  });

  it('degrades a position loop (float) to static — ASS \\t cannot animate \\pos', () => {
    const ass = buildTextOverlayAss([loopClip('float')], canvas);
    expect(ass).not.toContain('\\t(');
    expect(ass).toMatch(/Dialogue:.*LOOP/); // still rendered, just without the loop
  });
});
