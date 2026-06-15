# Viral Faceless Short — Reference Workflow

> A concrete blueprint for a 9:16 Ghibli-style nature short. Shows exactly where
> **Prism / providers** generate content vs where **vixel** assembles it.
>
> Guiding rule: **the agent orchestrates, providers generate, vixel renders.**
> vixel never fetches content or makes taste calls — it executes mechanical
> ffmpeg steps with the parameters the agent chooses.

---

## The two engines (don't confuse them)

| Layer | Engine | Examples |
|---|---|---|
| **Generative** — hallucinates new motion | a diffusion model | image-to-video: Kling / Veo / Runway / Leonardo Motion / SVD |
| **Mechanical** — deterministic transforms | ffmpeg (vixel) | Ken Burns, glow, parallax, captions, mix, grade, fades, loudness |

A river that *actually flows* = generative. A still scene that *feels cinematic*
(push-in + glow + drifting fog) = mechanical. A short uses **both**.

---

## Pipeline

```
┌─ PRISM (agent + providers) ──────────────────────────────────────────────┐
│ 1. brief → script + shot list            (LLM)                            │
│ 2. per shot: 9:16 still image            (image model: flux / nano-banana)│
│ 3. VO narration                          (ElevenLabs / Gemini TTS)        │
│ 4. word-timed captions (.srt)            (Whisper / forced alignment)     │
│ 5. pick "hero" shots → image-to-video    (Kling / Veo provider)  ── alive │
│ 6. pick "filler" shots → leave as stills                                  │
│    (optional) depth map per still        (Depth Anything / MiDaS)         │
└───────────────────────────────────────────────────────────────────────────┘
                              │ assets handed to vixel
┌─ VIXEL (mechanical render + assembly) ───────────────────────────────────┐
│ A. filler stills → motion:                                                │
│      kenBurns()           slow zoom/pan          OR                        │
│      parallax3d(depth)    2.5D "3D photo" move   (if a depth map exists)  │
│ B. every clip → mood:     glow() + adjustColor()/applyLut()               │
│ C. join clips:            concatWithTransitions()  (xfade/dissolve)        │
│ D. burn captions:         burnCaptions(srt)                               │
│ E. audio bed:             mixAudio(voiceover + music, ducked)             │
│ F. top & tail:            fade(in/out)                                     │
│ G. platform loudness:     normalizeLoudness('youtube')  → -14 LUFS        │
│ H. final container        9:16 H.264 mp4                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

## vixel side, as code

```typescript
import {
  kenBurns, parallax3d, glow, adjustColor,
  concatWithTransitions, burnCaptions, mixAudio, fade, normalizeLoudness,
  pipeline,
} from '@classytic/vixel';

// A. Stills → motion (filler shots the agent chose not to send to i2v)
const fillerClips = await Promise.all(
  fillerStills.map((s, i) =>
    s.depthMap
      ? parallax3d(s.image, `seg-${i}.mp4`, { duration: 4, depthMap: s.depthMap, mode: 'sway', width: 1080, height: 1920 })
      : kenBurns(s.image, `seg-${i}.mp4`, { duration: 4, direction: i % 2 ? 'out' : 'in', width: 1080, height: 1920 }),
  ),
);

// heroClips = the i2v provider's output (already video) — gathered by the agent.
const allClips = interleave(heroClips, fillerClips); // VideoSource[] with durations

// C. Join with dissolves
await concatWithTransitions(allClips, 'joined.mp4', {
  transition: 'dissolve', duration: 0.6, width: 1080, height: 1920, audio: false,
});

// B/D/E/F/G — mood + captions + audio + polish, chained
await pipeline('joined.mp4', { onProgress: (p) => report(p.overall) })
  .glow({ sigma: 10, intensity: 0.35 })            // dreamy bloom
  .adjust({ contrast: 1.05, saturation: 1.15 })    // gentle grade
  .captions({ subtitlePath: 'captions.srt', forceStyle: 'Fontsize=30,Outline=2' })
  .mixAudio({ voiceover: 'vo.mp3', music: 'bed.mp3' }) // music ducks under VO
  .fade({ fadeIn: 0.6, fadeOut: 1.0 })
  .run('final.mp4');

// G. Loudness to platform target (separate — it does a measure pass)
await normalizeLoudness({ inputPath: 'final.mp4', duration: total }, 'final-yt.mp4', { preset: 'youtube' });
```

## What stays the host/agent's job (NOT vixel)

- Script, shot list, pacing, which transition where, which LUT, how much glow
- Image generation, image-to-video generation, depth estimation
- Voiceover (TTS) and caption *timing* (Whisper) — vixel only **burns** the SRT
- Thumbnail, title, upload, scheduling

## Quality notes

- Mix hero (generative, alive) + filler (mechanical, poster) shots — all-generative is
  expensive and all-mechanical feels static. The blend is what reads as "produced".
- `parallax3d` is a 2.5D approximation; keep `amplitude` ≤ ~15px or depth edges smear.
- Run `normalizeLoudness` last so the bed+VO mix hits the platform target as a whole.
- Use `.toCommands()` on the pipeline to inspect/cost every ffmpeg call before rendering.
