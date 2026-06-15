/** Single bounded overlay render for verification.
 *   node scripts/verify-overlay.mjs <base.mp4> <overlay.mp4> <out.mp4>
 */
import { overlay, probeVideo } from '../dist/index.js';

const [base, ov, out] = process.argv.slice(2);
const r = await overlay(
  { inputPath: base, duration: 3, width: 1080, height: 1920 },
  out,
  { overlayPath: ov, blend: 'screen', opacity: 0.4, width: 1080, height: 1920, timeout: 30000 },
);
const p = await probeVideo(out);
console.log(`OUT ${p.width}x${p.height} ${p.duration.toFixed(2)}s ${(r.fileSize / 1024 / 1024).toFixed(2)}MB`);
