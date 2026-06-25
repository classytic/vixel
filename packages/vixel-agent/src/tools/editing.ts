/**
 * Editing tools — each PRODUCES id-addressed {@link EditorCommand}s and hands them to
 * `ctx.applyEdit` as one undoable step. The host reduces + persists; vixel-agent never
 * touches a store. Times are SECONDS (the contract's native unit). Edits are free and
 * undoable — the agent shouldn't ask permission for them (unlike paid generation).
 */
import { z } from 'zod';
import { totalDurationSec, type VisualClip } from '@classytic/vixel-schema';
import type { VixelToolSpec } from '../tool-spec.js';
import type { EditorCommand } from '../context.js';
import { serializeTimeline } from '../serialize.js';

export const addClip: VixelToolSpec = {
  name: 'add_clip',
  description:
    'Add a media/text clip to the timeline. kind is video|image|text. For video/image pass ' +
    'source (a URL/asset ref); for text pass text. Appends to the first compatible lane (a new ' +
    'one is created if needed). Returns the post-edit timeline so you get the new clip id.',
  inputSchema: z.object({
    kind: z.enum(['video', 'image', 'text']),
    source: z.string().optional().describe('Asset URL/ref for video|image.'),
    text: z.string().optional().describe('Text content for kind=text.'),
    atSec: z.number().describe('Timeline start (seconds).'),
    durationSec: z.number().describe('On-screen length (seconds).'),
  }),
  execute: async (args: { kind: 'video' | 'image' | 'text'; source?: string; text?: string; atSec: number; durationSec: number }, ctx) => {
    const media: VisualClip['media'] =
      args.kind === 'text'
        ? { kind: 'text', text: args.text ?? '' }
        : { kind: args.kind, source: args.source ?? '' };
    const clip: VisualClip = { media, at: Math.max(0, args.atSec), duration: Math.max(0.05, args.durationSec) };
    const res = await ctx.applyEdit([{ type: 'addClip', clip }], 'Add clip');
    return { ok: true, timeline: serializeTimeline(res.spec) };
  },
};

export const setClipProperties: VixelToolSpec = {
  name: 'set_clip_properties',
  description:
    'Update a clip by id: durationSec, volume (0–1), muted, opacity (0–1), or loop (video — ' +
    'repeat the source to fill its duration). Only the fields you pass change.',
  inputSchema: z.object({
    clipId: z.string(),
    durationSec: z.number().optional(),
    volume: z.number().optional(),
    muted: z.boolean().optional(),
    opacity: z.number().optional(),
    loop: z.boolean().optional().describe('Video: loop the source to fill the clip duration.'),
  }),
  execute: async (
    args: { clipId: string; durationSec?: number; volume?: number; muted?: boolean; opacity?: number; loop?: boolean },
    ctx,
  ) => {
    const spec = await ctx.getSpec();
    const patch: Record<string, unknown> = {};
    if (args.durationSec != null) patch.duration = Math.max(0.05, args.durationSec);
    if (args.volume != null) patch.volume = args.volume;
    if (args.muted != null) patch.muted = args.muted;
    if (args.opacity != null) patch.transform = { opacity: args.opacity };
    if (args.loop != null) {
      // loop lives on video media — fold it into a media patch off the current clip.
      for (const t of spec.tracks) {
        if (t.type !== 'visual') continue;
        const c = t.clips.find((x) => x.id === args.clipId);
        if (c && c.media.kind === 'video') patch.media = { ...c.media, loop: args.loop };
      }
    }
    const res = await ctx.applyEdit([{ type: 'updateClip', clipId: args.clipId, patch }], 'Edit clip');
    return { ok: true, durationSec: totalDurationSec(res.spec) };
  },
};

export const splitClip: VixelToolSpec = {
  name: 'split_clip',
  description: 'Split a clip into two at atSec (must be strictly inside the clip).',
  inputSchema: z.object({ clipId: z.string(), atSec: z.number() }),
  execute: async (args: { clipId: string; atSec: number }, ctx) => {
    const res = await ctx.applyEdit([{ type: 'splitClip', clipId: args.clipId, atSec: args.atSec }], 'Split clip');
    return { ok: true, timeline: serializeTimeline(res.spec) };
  },
};

export const removeClip: VixelToolSpec = {
  name: 'remove_clip',
  description: 'Remove a clip by id (its linked partner, if any, goes with it).',
  inputSchema: z.object({ clipId: z.string() }),
  execute: async (args: { clipId: string }, ctx) => {
    const res = await ctx.applyEdit([{ type: 'removeClip', clipId: args.clipId }], 'Delete clip');
    return { ok: true, durationSec: totalDurationSec(res.spec) };
  },
};

export const rippleDelete: VixelToolSpec = {
  name: 'ripple_delete',
  description:
    'Cut one or more time ranges out of a lane and CLOSE the gaps (link-aware) — the fast path ' +
    'for filler-word / dead-air removal. Ranges are [startSec, endSec] pairs on trackId. Get ' +
    'ranges from get_transcript word times.',
  inputSchema: z.object({
    trackId: z.string(),
    ranges: z.array(z.tuple([z.number(), z.number()])).describe('[startSec, endSec] pairs (seconds).'),
  }),
  execute: async (args: { trackId: string; ranges: [number, number][] }, ctx) => {
    const res = await ctx.applyEdit([{ type: 'rippleDelete', trackId: args.trackId, ranges: args.ranges }], 'Ripple delete');
    return { ok: true, durationSec: totalDurationSec(res.spec) };
  },
};

export const linkClips: VixelToolSpec = {
  name: 'link_clips',
  description: 'Couple clips/audio items into one link group (by id) so edits carry them together (J/L cuts).',
  inputSchema: z.object({ ids: z.array(z.string()).min(2) }),
  execute: async (args: { ids: string[] }, ctx) => {
    await ctx.applyEdit([{ type: 'linkClips', ids: args.ids }], 'Link');
    return { ok: true };
  },
};

const MARKER_KINDS = ['cut', 'chapter', 'beat', 'note'] as const;

export const addMarker: VixelToolSpec = {
  name: 'add_marker',
  description: 'Drop a timeline marker (a "cut here" / chapter / beat anchor) at a time. Survives export; you can act on it later.',
  inputSchema: z.object({
    atSec: z.number(),
    label: z.string().optional(),
    kind: z.enum(MARKER_KINDS).optional(),
    color: z.string().optional().describe("'#RRGGBB' accent."),
  }),
  execute: async (
    args: { atSec: number; label?: string; kind?: (typeof MARKER_KINDS)[number]; color?: string },
    ctx,
  ) => {
    const command: EditorCommand = {
      type: 'addMarker',
      marker: { at: Math.max(0, args.atSec), label: args.label, kind: args.kind, color: args.color },
    };
    const res = await ctx.applyEdit([command], 'Add marker');
    return { ok: true, markers: res.spec.markers };
  },
};

export const removeMarker: VixelToolSpec = {
  name: 'remove_marker',
  description: 'Remove a timeline marker by id.',
  inputSchema: z.object({ markerId: z.string() }),
  execute: async (args: { markerId: string }, ctx) => {
    const res = await ctx.applyEdit([{ type: 'removeMarker', markerId: args.markerId }], 'Remove marker');
    return { ok: true, markers: res.spec.markers };
  },
};
