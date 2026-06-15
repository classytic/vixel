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
          transition: { type: 'fade', duration: 0.5 },
        },
        {
          source: 'https://picsum.photos/seed/vixel-b/1280/720',
          duration: 3,
          fit: 'cover',
          animation: { preset: 'pan', direction: 'left', amount: 0.14 },
          transition: { type: 'dissolve', duration: 0.5 },
        },
        {
          source: 'https://picsum.photos/seed/vixel-c/1280/720',
          duration: 3,
          fit: 'cover',
          animation: { preset: 'zoom', direction: 'out', amount: 0.18 },
        },
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
