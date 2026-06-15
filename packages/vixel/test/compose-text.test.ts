/**
 * In-compose text overlays — golden unit tests (pure ASS, no ffmpeg).
 * Verifies multiple BYO-styled, positioned text overlays compile to one ASS doc.
 */

import { describe, it, expect } from 'vitest';
import { buildTextOverlayAss } from '../src/compose/text-overlay.js';
import type { TextOverlay } from '../src/compose/schema.js';

const canvas = { width: 1080, height: 1920 };

describe('buildTextOverlayAss', () => {
  it('authors a named, positioned style + dialogue per overlay', () => {
    const overlays: TextOverlay[] = [
      { kind: 'text', text: 'TITLE', at: 0, duration: 2, position: 'top', style: { fillColor: '#FF0000', fontFamily: 'Bangers' } },
      { kind: 'text', text: 'subtitle', at: 2, duration: 2, position: { x: 0.5, y: 0.9 }, style: { fontFamily: 'Inter' } },
    ];
    const ass = buildTextOverlayAss(overlays, canvas);

    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Style: ov0,Bangers'); // first overlay's named style
    expect(ass).toContain('Style: ov1,Inter');
    // anchor 'top' → alignment numpad 8 on ov0's style line
    expect(ass.split('\n').find((l) => l.startsWith('Style: ov0'))!.split(',')[18]).toBe('8');
    // normalized {0.5,0.9} → absolute \pos centered (anchor numpad 5)
    expect(ass).toContain('\\pos(540,1728)');
    expect(ass.split('\n').find((l) => l.startsWith('Style: ov1'))!.split(',')[18]).toBe('5');
    // dialogues reference their style
    expect(ass).toMatch(/Dialogue: 0,[^,]+,[^,]+,ov0,/);
    expect(ass).toMatch(/Dialogue: 0,[^,]+,[^,]+,ov1,/);
  });

  it('expands word-timed cues using the caption animation mode', () => {
    const ass = buildTextOverlayAss(
      [
        {
          kind: 'text',
          text: 'hi there',
          at: 0,
          duration: 1,
          position: 'bottom',
          style: { animation: 'word-by-word' },
          cues: [
            { text: 'hi there', startMs: 0, endMs: 1000, words: [
              { text: 'hi', startMs: 0, endMs: 500 },
              { text: 'there', startMs: 500, endMs: 1000 },
            ] },
          ],
        },
      ],
      canvas,
    );
    // word-by-word → one Dialogue per word
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0]).toContain('hi');
    expect(dialogues[1]).toContain('there');
  });

  it('applies overlay fadeIn/fadeOut via \\fad', () => {
    const ass = buildTextOverlayAss(
      [{ kind: 'text', text: 'hi', at: 0, duration: 2, position: 'bottom', in: 'fadeIn', out: 'fadeOut' }],
      canvas,
    );
    expect(ass).toContain('\\fad(400,400)');
  });
});
