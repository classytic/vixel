import type { VixelSpec } from '@classytic/vixel/compose';

/**
 * A small real composition: three CORS-enabled stock photos (picsum) with
 * ken-burns, plus two timed text overlays. Enough to see clip layout, fit,
 * motion, overlays, scrubbing, and playback in PixiPreview.
 */
export const sampleSpec: VixelSpec = {
  version: 1,
  output: { width: 1280, height: 720, fps: 30, background: '#0b0b12' },
  tracks: [
    {
      type: 'video',
      clips: [
        {
          source: 'https://picsum.photos/seed/vixel-a/1280/720',
          duration: 3,
          fit: 'cover',
          animation: { preset: 'kenBurns', direction: 'in', amount: 0.18 },
        },
        {
          source: 'https://picsum.photos/seed/vixel-b/1280/720',
          duration: 3,
          fit: 'cover',
          animation: { preset: 'pan', direction: 'left', amount: 0.14 },
        },
        {
          source: 'https://picsum.photos/seed/vixel-c/1280/720',
          duration: 3,
          fit: 'cover',
          animation: { preset: 'zoom', direction: 'out', amount: 0.18 },
        },
      ],
      // First-class gl-transitions — real GLSL in the Pixi preview (3D cube + glitch).
      // The engine approximates these via xfade on the fast tier; @classytic/vixel-render-pixi
      // renders them exactly on the server.
      transitions: [
        { between: [0, 1], transition: { id: 'cube', duration: 0.6 } },
        { between: [1, 2], transition: { id: 'glitch', duration: 0.5 } },
      ],
    },
    {
      type: 'overlay',
      items: [
        {
          kind: 'text',
          at: 0.3,
          duration: 2.6,
          text: 'VIXEL',
          position: 'center',
          in: 'fadeIn',
          out: 'fadeOut',
          style: { color: '#ffffff', fontSize: 140 },
        },
        {
          kind: 'text',
          at: 3.3,
          duration: 5.4,
          text: 'agentic video, edited',
          position: 'bottom',
          in: 'fadeIn',
          out: 'fadeOut',
          style: { color: '#a5b4fc', fontSize: 64 },
        },
      ],
    },
  ],
};
