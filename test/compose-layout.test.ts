/**
 * Layout — unit tests for the resolution-independent positioning model.
 * The whole point: an agent emits anchors / normalized coords, never pixels.
 */

import { describe, it, expect } from 'vitest';
import { overlayXY, overlayWidthPx } from '../src/compose/layout.js';

describe('overlayXY (anchors → ffmpeg overlay expressions)', () => {
  it('centers by default', () => {
    expect(overlayXY('center')).toEqual({ x: '(W-w)/2', y: '(H-h)/2' });
    expect(overlayXY(undefined)).toEqual({ x: '(W-w)/2', y: '(H-h)/2' });
  });

  it('insets edge anchors by the margin (using W,H,w,h so size is auto)', () => {
    expect(overlayXY('bottom')).toEqual({ x: '(W-w)/2', y: 'H-h-H*0.05' });
    expect(overlayXY('top-right')).toEqual({ x: 'W-w-W*0.05', y: 'H*0.05' });
    expect(overlayXY('bottom-left')).toEqual({ x: 'W*0.05', y: 'H-h-H*0.05' });
  });

  it('honours a custom margin fraction', () => {
    expect(overlayXY('top', 0.1)).toEqual({ x: '(W-w)/2', y: 'H*0.1' });
  });

  it('treats a normalized {x,y} as the overlay CENTER (resolution-independent)', () => {
    expect(overlayXY({ x: 0.5, y: 0.9 })).toEqual({ x: '(W*0.5)-(w/2)', y: '(H*0.9)-(h/2)' });
    expect(overlayXY({ x: 0.5, y: 0.5 })).toEqual({ x: '(W*0.5)-(w/2)', y: '(H*0.5)-(h/2)' });
  });
});

describe('overlayWidthPx (canvas-fraction → pixels)', () => {
  it('resolves a fraction of the canvas width', () => {
    expect(overlayWidthPx(1000, 0.2, undefined)).toBe(200);
    expect(overlayWidthPx(1080, 0.5, undefined)).toBe(540);
  });

  it('defaults to 25% when no width is given', () => {
    expect(overlayWidthPx(1000, undefined, undefined)).toBe(250);
  });

  it('applies the scale multiplier', () => {
    expect(overlayWidthPx(1000, 0.2, 2)).toBe(400);
  });
});
