/**
 * Demo reel builder — showcases the new "CapCut dynamics" primitives.
 * Renders to .demo/out/. Run: node .demo/build-demo.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compose, beatSyncSpec, detectBeats } from '../dist/compose/index.js';
import { speedRamp, motionEffect, Source } from '../dist/index.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(__dirname, 'src');
const OUT = join(__dirname, 'out');
const reels = join(ROOT, 'test', 'samples', '1-reels-9x16.mp4');

const W = 720, H = 1280, FPS = 30;
const OUTPUTS = [];

await mkdir(SRC, { recursive: true });
await mkdir(OUT, { recursive: true });

const enc = (p, extra = []) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', ...extra, p];

// ── sources ────────────────────────────────────────────────────────────────
console.log('carving sources…');
const starts = [0.5, 4, 8.5, 13];
const segs = [];
for (let i = 0; i < starts.length; i++) {
  const p = join(SRC, `seg${i}.mp4`);
  await exec('ffmpeg', ['-y', '-ss', String(starts[i]), '-t', '2.2', '-i', reels, '-vf', `scale=${W}:${H}`, ...enc(p)]);
  segs.push(p);
}
const motion = join(SRC, 'motion.mp4');
await exec('ffmpeg', ['-y', '-ss', '6', '-t', '3', '-i', reels, '-vf', `scale=${W}:${H}`, ...enc(motion)]);

const logo = join(SRC, 'logo.png');
await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0xE91E63:s=230x80', '-frames:v', '1', logo]);

const beatTrack = join(SRC, 'beat.wav');
await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*60*t)*exp(-14*mod(t,0.5))':d=8:s=44100", beatTrack]);

const output = { width: W, height: H, fps: FPS };

// ── 1. transition presets + logo overlay ────────────────────────────────────
try {
  console.log('demo 1: transitions…');
  const out = join(OUT, '01-transitions.mp4');
  const r = await compose(
    {
      version: 1,
      output,
      tracks: [
        {
          type: 'video',
          clips: [
            { source: segs[0], duration: 2, transition: { type: 'zoom-blur', duration: 0.5 } },
            { source: segs[1], duration: 2, transition: { type: 'whip-pan', duration: 0.4 } },
            { source: segs[2], duration: 2, transition: { type: 'glitch', duration: 0.4 } },
            { source: segs[3], duration: 2 },
          ],
        },
        { type: 'overlay', items: [{ kind: 'image', source: logo, at: 0, duration: 7.5, position: 'top-right', width: 0.28, opacity: 0.9, in: 'fadeIn' }] },
      ],
    },
    out,
    { preset: 'veryfast', crf: 22 },
  );
  OUTPUTS.push(['01 transitions  (zoom-blur · whip-pan · glitch)', out, r.durationSec]);
} catch (e) { console.error('demo 1 FAILED:', e.message); }

// ── 2. speed ramp (slow-mo) ─────────────────────────────────────────────────
try {
  console.log('demo 2: speed ramp…');
  const out = join(OUT, '02-speed-ramp.mp4');
  const src = await Source.fromFile(motion);
  const r = await speedRamp(src, out, {
    segments: [{ throughSec: 1, speed: 1 }, { throughSec: 2, speed: 0.3 }, { throughSec: 3, speed: 2 }],
    fps: FPS, preset: 'veryfast', crf: 22,
  });
  OUTPUTS.push(['02 speed-ramp   (1x → 0.3x slow-mo → 2x)', out, r.newDuration]);
} catch (e) { console.error('demo 2 FAILED:', e.message); }

// ── 3. motion effects montage (labeled) ─────────────────────────────────────
try {
  console.log('demo 3: motion effects…');
  const effects = ['glitch', 'shake', 'zoom-punch', 'rgb-split'];
  const fxClips = [];
  for (let i = 0; i < effects.length; i++) {
    const src = await Source.fromFile(segs[i]);
    const p = join(SRC, `fx-${effects[i]}.mp4`);
    await motionEffect(src, p, { effect: effects[i], intensity: 0.7, preset: 'veryfast', crf: 22 });
    fxClips.push(p);
  }
  const out = join(OUT, '03-effects.mp4');
  const r = await compose(
    {
      version: 1,
      output,
      tracks: [
        { type: 'video', clips: fxClips.map((source) => ({ source, duration: 2 })) },
        {
          type: 'overlay',
          items: effects.map((fx, i) => ({
            kind: 'text', at: i * 2, duration: 2, text: fx, position: 'bottom',
            style: { fontSize: 72, bold: true, fillColor: '#FFFFFF', outlineColor: '#000000' },
          })),
        },
      ],
    },
    out,
    { preset: 'veryfast', crf: 22 },
  );
  OUTPUTS.push(['03 effects      (glitch · shake · zoom-punch · rgb-split)', out, r.durationSec]);
} catch (e) { console.error('demo 3 FAILED:', e.message); }

// ── 4. beat-sync auto-cut + music bed ───────────────────────────────────────
try {
  console.log('demo 4: beat sync…');
  const { beats, bpm } = await detectBeats({ inputPath: beatTrack, duration: 8 }, { sensitivity: 1.0 });
  console.log(`   detected ${beats.length} beats (~${bpm} BPM)`);
  const spec = beatSyncSpec({ sources: segs, beats, output, audioSource: beatTrack });
  const out = join(OUT, '04-beat-sync.mp4');
  const r = await compose(spec, out, { preset: 'veryfast', crf: 22 });
  OUTPUTS.push([`04 beat-sync    (${beats.length} cuts on ~${bpm} BPM)`, out, r.durationSec]);
} catch (e) { console.error('demo 4 FAILED:', e.message); }

// ── 5. hero showcase: transitions + active-word caption + logo + music ───────
try {
  console.log('demo 5: hero showcase…');
  const out = join(OUT, '05-showcase.mp4');
  const cue = (text, s, words) => ({ text, startMs: s, endMs: s + words.at(-1).endMs, words: words.map((w) => ({ text: w.t, startMs: s + w.s, endMs: s + w.endMs })) });
  const r = await compose(
    {
      version: 1,
      output,
      tracks: [
        {
          type: 'video',
          clips: [
            { source: segs[0], duration: 2, transition: { type: 'zoom-blur', duration: 0.5 }, animation: { preset: 'kenBurns', direction: 'in', amount: 0.12 } },
            { source: segs[2], duration: 2, transition: { type: 'dissolve', duration: 0.5 } },
            { source: segs[3], duration: 2 },
          ],
        },
        { type: 'audio', items: [{ source: beatTrack, role: 'music', gain: 0.5 }] },
        {
          type: 'overlay',
          items: [
            { kind: 'image', source: logo, at: 0, duration: 5, position: 'top-right', width: 0.28, opacity: 0.9, in: 'fadeIn' },
            {
              kind: 'text', at: 0, duration: 5, text: 'made with vixel', position: 'bottom',
              style: { fontSize: 78, bold: true, fillColor: '#FFFFFF', highlightColor: '#39FF14', outlineColor: '#000000', animation: 'highlight' },
              cues: [
                cue('made with vixel', 200, [{ t: 'made', s: 0, endMs: 500 }, { t: 'with', s: 500, endMs: 950 }, { t: 'vixel', s: 950, endMs: 1700 }]),
                cue('capcut grade', 2200, [{ t: 'capcut', s: 0, endMs: 700 }, { t: 'grade', s: 700, endMs: 1500 }]),
                cue('pure ffmpeg', 3500, [{ t: 'pure', s: 0, endMs: 600 }, { t: 'ffmpeg', s: 600, endMs: 1400 }]),
              ],
            },
          ],
        },
      ],
    },
    out,
    { preset: 'veryfast', crf: 21 },
  );
  OUTPUTS.push(['05 showcase     (transitions + ken-burns + active-word caption + music)', out, r.durationSec]);
} catch (e) { console.error('demo 5 FAILED:', e.message); }

console.log('\n──────── demo outputs ────────');
for (const [label, path, dur] of OUTPUTS) console.log(`✓ ${label}\n    ${path}  (${dur?.toFixed?.(2)}s)`);
console.log(`\n${OUTPUTS.length}/5 demos rendered → ${OUT}`);
