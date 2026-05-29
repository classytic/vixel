/**
 * Demo: build a faceless reel you can actually watch.
 * Uses test/test.mp4 frames as stand-in stills (no Prism here).
 * Output is NOT cleaned up — open demo-output/reel.mp4.
 *
 *   node scripts/demo-reel.mjs
 */
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  trimVideo, extractFrameAt, extractAudio,
  kenBurns, parallax3d, glow, concatWithTransitions,
  normalizeLoudness, pipeline, spawnFFmpeg, probeVideo,
} from '../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'test', 'test.mp4');
const OUT = join(ROOT, 'demo-output');
const W = 540, H = 960, FPS = 24;
const f = (n) => join(OUT, n);

await fs.mkdir(OUT, { recursive: true });
console.log('Preparing stand-in assets from test.mp4 ...');

await extractFrameAt({ inputPath: SRC, duration: 60 }, 0.5, f('s1.png'), { width: 960 });
await extractFrameAt({ inputPath: SRC, duration: 60 }, 1.5, f('s2.png'), { width: 960 });
await extractFrameAt({ inputPath: SRC, duration: 60 }, 2.5, f('s3.png'), { width: 960 });
await extractFrameAt({ inputPath: SRC, duration: 60 }, 3.5, f('s4.png'), { width: 960 });
await spawnFFmpeg('ffmpeg', ['-y', '-i', f('s2.png'), '-frames:v', '1',
  '-vf', "geq=lum='X/W*255':cb=128:cr=128,format=gray", f('depth.png')]);

const aclip = f('aclip.mp4');
await trimVideo({ inputPath: SRC, duration: 60 }, aclip, { start: 0, end: 8, method: 'accurate' });
await extractAudio({ inputPath: aclip, duration: 8 }, f('vo.m4a'), { format: 'aac' });
await extractAudio({ inputPath: aclip, duration: 8 }, f('music.m4a'), { format: 'aac' });

console.log('Beat 1: Ken Burns + glow ...');
await kenBurns(f('s1.png'), f('seg1-kb.mp4'), { duration: 2, direction: 'in', width: W, height: H, fps: FPS });
await glow({ inputPath: f('seg1-kb.mp4'), duration: 2 }, f('seg1.mp4'), { sigma: 8, intensity: 0.35, highlightsOnly: true });

console.log('Beat 2: parallax3d + glow ...');
await parallax3d(f('s2.png'), f('seg2-px.mp4'), { duration: 2, depthMap: f('depth.png'), mode: 'sway', amplitude: 8, width: W, height: H, fps: FPS });
await glow({ inputPath: f('seg2-px.mp4'), duration: 2 }, f('seg2.mp4'), { sigma: 8, intensity: 0.3 });

console.log('Beat 3: Ken Burns montage ...');
await kenBurns(f('s3.png'), f('seg3.mp4'), { duration: 1.5, direction: 'in', width: W, height: H, fps: FPS });
await kenBurns(f('s4.png'), f('seg4.mp4'), { duration: 1.5, direction: 'out', width: W, height: H, fps: FPS });

console.log('Joining with dissolves ...');
const segs = [
  { inputPath: f('seg1.mp4'), duration: 2, width: W, height: H },
  { inputPath: f('seg2.mp4'), duration: 2, width: W, height: H },
  { inputPath: f('seg3.mp4'), duration: 1.5, width: W, height: H },
  { inputPath: f('seg4.mp4'), duration: 1.5, width: W, height: H },
];
const joined = await concatWithTransitions(segs, f('joined.mp4'), {
  transition: 'dissolve', duration: 0.5, width: W, height: H, fps: FPS, audio: false,
});

console.log('Grade + ducked audio + fades ...');
await pipeline({ inputPath: f('joined.mp4'), duration: joined.totalDuration, width: W, height: H })
  .glow({ sigma: 6, intensity: 0.25 })
  .adjust({ contrast: 1.05, saturation: 1.15 })
  .mixAudio({ voiceover: f('vo.m4a'), music: f('music.m4a') })
  .fade({ fadeIn: 0.5, fadeOut: 0.8 })
  .run(f('mixed.mp4'));

console.log('Loudness ...');
const mp = await probeVideo(f('mixed.mp4'));
await normalizeLoudness({ inputPath: f('mixed.mp4'), duration: mp.duration }, f('reel.mp4'), { preset: 'youtube' });

const final = await probeVideo(f('reel.mp4'));
const { size } = await fs.stat(f('reel.mp4'));
console.log('\n✅ Reel ready:');
console.log('   ' + f('reel.mp4'));
console.log(`   ${final.width}x${final.height}, ${final.duration.toFixed(1)}s, ${(size / 1024).toFixed(0)} KB, audio=${final.hasAudio}`);
