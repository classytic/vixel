/**
 * Assemble BR-OPV-001 reel from 4 parallax segments + viral text overlay.
 *   node scripts/assemble-brihot-reel.mjs
 * Expects D:/projects/creative/prism-gpu/.work/reel/seg0..3.mp4 + captions.ass
 */
import { concatWithTransitions, pipeline, probeVideo } from '../dist/index.js';

const REEL = 'D:/projects/creative/prism-gpu/.work/reel';
const segs = [0, 1, 2, 3].map((i) => ({ inputPath: `${REEL}/seg${i}.mp4`, duration: 2.8, width: 1080, height: 1920 }));

console.log('Concatenating with dissolves ...');
const joined = await concatWithTransitions(segs, `${REEL}/joined.mp4`, {
  transition: 'dissolve', duration: 0.5, width: 1080, height: 1920, fps: 30, audio: false,
});
console.log('joined duration', joined.totalDuration);

console.log('Glow + grade + captions + fade ...');
await pipeline({ inputPath: `${REEL}/joined.mp4`, duration: joined.totalDuration, width: 1080, height: 1920 })
  .glow({ sigma: 8, intensity: 0.3, highlightsOnly: true, threshold: 160 })
  .adjust({ contrast: 1.06, saturation: 1.12 })
  .captions({ subtitlePath: `${REEL}/captions.ass` })
  .fade({ fadeIn: 0.4, fadeOut: 0.8 })
  .run(`${REEL}/reel.mp4`);

const f = await probeVideo(`${REEL}/reel.mp4`);
console.log(`\nREEL ready: ${REEL}/reel.mp4  (${f.width}x${f.height}, ${f.duration.toFixed(1)}s)`);
