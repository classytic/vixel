/**
 * Composite EVERY overlay in the library onto one base clip + build a labeled
 * contact sheet, for visual review of all presets at once.
 *
 *   node scripts/overlay-grid.mjs <base.mp4> <outDir>
 *
 * SAFE: each overlay() call is bounded (shortest=1 in the filter) AND gets a
 * 30s timeout, so a bad asset can't run away. Renders comps → one labeled
 * frame each → tiles them into <outDir>/grid.png.
 */
import { overlay } from '../dist/index.js';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const OV = 'D:/projects/creative/prism/assets/overlays';
const base = process.argv[2];
const outDir = process.argv[3];
if (!base || !outDir) { console.error('usage: overlay-grid.mjs <base.mp4> <outDir>'); process.exit(1); }
await fs.mkdir(outDir, { recursive: true });

const sh = (args) => new Promise((res, rej) => {
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  let err = ''; p.stderr?.on('data', (d) => { err += d; });
  p.on('close', (c) => c === 0 ? res() : rej(new Error(err.slice(-300))));
  p.on('error', rej);
});

const manifest = JSON.parse(await fs.readFile(`${OV}/manifest.json`, 'utf8'));
const src = { inputPath: base, duration: 3, width: 1080, height: 1920 };

let i = 0;
for (const a of manifest.assets) {
  const comp = join(outDir, `comp-${a.id}.mp4`);
  try {
    await overlay(src, comp, {
      overlayPath: `${OV}/${a.file}`, blend: a.blend, opacity: a.opacity,
      width: 1080, height: 1920, timeout: 30_000, // hard cap per render
    });
    const frame = join(outDir, `f${String(i).padStart(2, '0')}.png`);
    // Labeled, uniform-size frame for clean tiling.
    await sh(['-ss', '1.5', '-i', comp, '-frames:v', '1',
      '-vf', `scale=240:426,drawtext=text='${a.id}':x=6:y=6:fontsize=15:fontcolor=yellow:box=1:boxcolor=black@0.75`, frame]);
    console.log(`ok ${a.id}`);
    i++;
  } catch (e) {
    console.log(`FAIL ${a.id}: ${e.message}`);
  }
}

if (i > 0) {
  const cols = 6, rows = Math.ceil(i / cols);
  await sh(['-framerate', '1', '-i', join(outDir, 'f%02d.png'), '-frames:v', '1',
    '-vf', `tile=${cols}x${rows}:padding=6:color=0x111111`, join(outDir, 'grid.png')]);
  console.log(`\nGrid: ${join(outDir, 'grid.png')}  (${i} overlays, ${cols}x${rows})`);
}
