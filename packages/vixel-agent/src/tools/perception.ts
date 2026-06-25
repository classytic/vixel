/**
 * Perception tools — let the agent READ and SEE the composition before/after editing.
 *   • get_timeline   — the structural read (ids every other tool consumes).
 *   • describe_catalog — the closed effect/transition/theme vocabulary (no hallucinated ids).
 *   • inspect_timeline — the COMPOSITED frame the user sees (verify edits landed).
 *   • get_transcript — what the cut actually says, in timeline seconds (host-transcribed).
 */
import { z } from 'zod';
import { describeCatalog, timelineTranscript, type AsrWord } from '@classytic/vixel-schema';
import type { VixelToolSpec } from '../tool-spec.js';
import { serializeTimeline, fpsOf } from '../serialize.js';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const getTimeline: VixelToolSpec = {
  name: 'get_timeline',
  description:
    'Call once at the start of a session (or after an out-of-band change). Returns fps, ' +
    'resolution, total duration (seconds), every track and clip by stable id (default-valued ' +
    'fields omitted), and the markers. The ids here are what every other tool accepts — ' +
    "don't guess ids.",
  inputSchema: z.object({}),
  execute: async (_args, ctx) => serializeTimeline(await ctx.getSpec()),
};

export const describeCatalogTool: VixelToolSpec = {
  name: 'describe_catalog',
  description:
    'List the available effects, transitions, themes and templates as id + description. ' +
    'Pick by MEANING from this closed set; never invent an id (the renderer silently skips ' +
    'unknown ids).',
  inputSchema: z.object({}),
  execute: async () => describeCatalog(),
};

export const inspectTimeline: VixelToolSpec = {
  name: 'inspect_timeline',
  description:
    'See the COMPOSITED frame the user sees in preview — every track stacked with transforms/' +
    'opacity/keyframes, text + captions baked in. Use to VERIFY an edit landed (a PIP position, ' +
    'a title placement, layer order). Times are SECONDS. Pass startSec for one frame; add endSec ' +
    'to sample maxFrames across the span (a transition/sequence).',
  inputSchema: z.object({
    startSec: z.number().describe('Timeline time to render (seconds).'),
    endSec: z.number().optional().describe('Sample maxFrames across [startSec, endSec) instead of one frame.'),
    maxFrames: z.number().int().optional().describe('Frames to sample when endSec is set (default 6, max 12).'),
  }),
  execute: async (args: { startSec: number; endSec?: number; maxFrames?: number }, ctx) => {
    const spec = await ctx.getSpec();
    const fps = fpsOf(spec);
    const start = Math.max(0, Math.round(args.startSec * fps));
    if (args.endSec == null || !ctx.renderRange) {
      return { images: [await ctx.render(start, { scale: 0.5 })] };
    }
    const end = Math.max(start + 1, Math.round(args.endSec * fps));
    return { images: await ctx.renderRange(start, end, clamp(args.maxFrames ?? 6, 1, 12)) };
  },
};

export const getTranscript: VixelToolSpec = {
  name: 'get_transcript',
  description:
    'The spoken transcript of the CURRENT timeline, in timeline seconds — walks every audio/' +
    'video clip, maps each word through its trim/position, and drops trimmed-out words, so it ' +
    'reflects what is actually audible after cuts. Use for transcript-driven editing and to ' +
    'verify what remains. Requires a host transcription provider; reports if unavailable.',
  inputSchema: z.object({
    clipId: z.string().optional().describe('Scope to one clip ("what does this clip say?").'),
  }),
  execute: async (_args: { clipId?: string }, ctx) => {
    const transcribe = ctx.providers?.transcribe;
    if (!transcribe) return { available: false, reason: 'No transcription provider configured by the host.' };
    const spec = await ctx.getSpec();
    const wordsById = new Map<string, AsrWord[]>();
    for (const t of spec.tracks) {
      if (t.type === 'visual') {
        for (const c of t.clips) if (c.id && c.media.kind === 'video') wordsById.set(c.id, await transcribe({ clipId: c.id }));
      } else {
        for (const it of t.items) if (it.id) wordsById.set(it.id, await transcribe({ clipId: it.id }));
      }
    }
    return { segments: timelineTranscript(spec, wordsById) };
  },
};
