import { describe, it, expect } from 'vitest';
import {
  normalizeSpec,
  mintIds,
  totalDurationSec,
  addMarker as schemaAddMarker,
  removeMarker as schemaRemoveMarker,
  rippleDeleteRanges,
  linkElements,
  type VixelSpec,
  type VisualClip,
  type EditorCommand,
} from '@classytic/vixel-schema';
import { vixelToolSpecs } from './tools.js';
import { toAiSdkTools, toMcpBridges } from './adapters.js';
import type { AgentContext, ImageRef } from './context.js';

const byName = (n: string) => vixelToolSpecs.find((t) => t.name === n)!;

/** A tiny in-memory host: reduces the EditorCommands the tools emit via schema fns. */
function fakeContext(initial?: VixelSpec): AgentContext {
  let spec =
    initial ??
    normalizeSpec({
      version: 1,
      output: { width: 1920, height: 1080, fps: 30 },
      tracks: [
        {
          type: 'visual',
          id: 'main',
          clips: [
            { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
            { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 3 },
          ],
        },
      ],
    });

  const reduce = (s: VixelSpec, c: EditorCommand): VixelSpec => {
    switch (c.type) {
      case 'addMarker':
        return schemaAddMarker(s, c.marker);
      case 'removeMarker':
        return schemaRemoveMarker(s, c.markerId);
      case 'rippleDelete':
        return rippleDeleteRanges(s, c.trackId, c.ranges);
      case 'linkClips':
        return linkElements(s, c.ids, c.linkId);
      case 'addClip':
        return mintIds({
          ...s,
          tracks: s.tracks.map((t, i) => (t.type === 'visual' && i === 0 ? { ...t, clips: [...t.clips, c.clip] } : t)),
        });
      case 'updateClip':
        return {
          ...s,
          tracks: s.tracks.map((t) =>
            t.type === 'visual'
              ? { ...t, clips: t.clips.map((cl) => (cl.id === c.clipId ? ({ ...cl, ...c.patch } as VisualClip) : cl)) }
              : t,
          ),
        };
      default:
        return s;
    }
  };

  return {
    getSpec: async () => spec,
    applyEdit: async (commands, label) => {
      spec = commands.reduce(reduce, spec);
      return { spec, label };
    },
    render: async (frame): Promise<ImageRef> => ({ frame, url: `data:image/png;base64,FRAME${frame}` }),
    renderRange: async (a, b, n) =>
      Array.from({ length: n }, (_, i) => ({ frame: Math.round(a + ((b - a) * i) / n), url: 'data:,' })),
    capabilities: () => ({ canGenerate: false, canSearch: false, canTranscribe: false }),
  };
}

describe('vixel-agent tool surface', () => {
  it('exposes uniquely-named tools', () => {
    const names = vixelToolSpecs.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('get_timeline');
    expect(names).toContain('ripple_delete');
    expect(names).toContain('add_marker');
  });

  it('get_timeline serializes ids, duration, and omits defaults', async () => {
    const ctx = fakeContext();
    const t = (await byName('get_timeline').execute({}, ctx)) as {
      durationSec: number;
      tracks: { id: string; clips: { id: string; kind: string }[] }[];
    };
    expect(t.durationSec).toBe(6);
    expect(t.tracks[0]!.id).toBe('main');
    expect(t.tracks[0]!.clips).toHaveLength(2);
    expect(t.tracks[0]!.clips[0]).toMatchObject({ kind: 'video', at: 0, duration: 3 });
    // default-valued fields (volume 1, muted) are omitted
    expect(t.tracks[0]!.clips[0]).not.toHaveProperty('volume');
  });

  it('inspect_timeline renders one frame, or a range', async () => {
    const ctx = fakeContext();
    const one = (await byName('inspect_timeline').execute({ startSec: 1 }, ctx)) as { images: ImageRef[] };
    expect(one.images).toHaveLength(1);
    expect(one.images[0]!.frame).toBe(30); // 1s × 30fps
    const many = (await byName('inspect_timeline').execute({ startSec: 0, endSec: 2, maxFrames: 4 }, ctx)) as {
      images: ImageRef[];
    };
    expect(many.images).toHaveLength(4);
  });

  it('add_marker emits an addMarker command the host reduces', async () => {
    const ctx = fakeContext();
    const res = (await byName('add_marker').execute({ atSec: 2, label: 'Hook', kind: 'chapter' }, ctx)) as {
      markers: { label: string; id: string }[];
    };
    expect(res.markers).toHaveLength(1);
    expect(res.markers[0]).toMatchObject({ label: 'Hook', kind: 'chapter' });
    expect(res.markers[0]!.id).toBeTruthy();
  });

  it('ripple_delete cuts a span and closes the gap', async () => {
    const ctx = fakeContext();
    const res = (await byName('ripple_delete').execute({ trackId: 'main', ranges: [[3, 6]] }, ctx)) as {
      durationSec: number;
    };
    expect(res.durationSec).toBe(3); // 6s − 3s removed
  });

  it('add_clip appends and returns the post-edit timeline with new ids', async () => {
    const ctx = fakeContext();
    const res = (await byName('add_clip').execute({ kind: 'text', text: 'Hi', atSec: 6, durationSec: 2 }, ctx)) as {
      timeline: { tracks: { clips: { id: string; kind: string }[] }[] };
    };
    const clips = res.timeline.tracks[0]!.clips;
    expect(clips).toHaveLength(3);
    expect(clips[2]).toMatchObject({ kind: 'text', at: 6, duration: 2 });
    expect(clips[2]!.id).toBeTruthy();
  });

  it('set_clip_properties patches a clip by id', async () => {
    const ctx = fakeContext();
    const spec = await ctx.getSpec();
    const t0 = spec.tracks[0] as { clips: { id: string }[] };
    const id = t0.clips[0]!.id;
    await byName('set_clip_properties').execute({ clipId: id, volume: 0.5, muted: true }, ctx);
    const after = (await ctx.getSpec()).tracks[0] as { clips: { volume?: number; muted?: boolean }[] };
    expect(after.clips[0]).toMatchObject({ volume: 0.5, muted: true });
  });

  it('get_transcript reports unavailable without a provider', async () => {
    const ctx = fakeContext();
    const res = (await byName('get_transcript').execute({}, ctx)) as { available: boolean };
    expect(res.available).toBe(false);
  });

  it('toAiSdkTools binds a context into a name-keyed ToolSet', async () => {
    const ctx = fakeContext();
    const tools = toAiSdkTools(ctx);
    expect(Object.keys(tools)).toContain('get_timeline');
    const r = (await tools.get_timeline!.execute({})) as { durationSec: number };
    expect(r.durationSec).toBe(6);
  });

  it('toMcpBridges exposes flat zod shapes + a per-request buildTool', async () => {
    const bridges = toMcpBridges(() => fakeContext());
    const ripple = bridges.find((b) => b.name === 'ripple_delete')!;
    expect(Object.keys(ripple.inputSchema)).toEqual(expect.arrayContaining(['trackId', 'ranges']));
    const tool = ripple.buildTool({ orgId: 'acme' });
    const r = (await tool.execute({ trackId: 'main', ranges: [[3, 6]] })) as { durationSec: number };
    expect(r.durationSec).toBe(3);
  });
});
