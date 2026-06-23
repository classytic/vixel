import { describe, it, expect, vi } from 'vitest';
import type { VixelSpec } from '@classytic/vixel-schema';
import { createEditorStore, createEditorActions } from './createEditorStore.js';
import { resolveSelection, resolveSeam } from '../../../shared/utils/selection.js';

function sampleSpec(): VixelSpec {
  return {
    version: 1,
    output: { width: 1080, height: 1920, fps: 30 },
    tracks: [
      {
        type: 'visual',
        sequential: true,
        clips: [
          { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 3 },
          { media: { kind: 'video', source: 'b.mp4' }, at: 3, duration: 2 },
        ],
      },
    ],
  };
}

describe('editor store', () => {
  it('seeds derived duration from the spec (Σ clip durations)', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    expect(store.getState().durationSec).toBe(5);
    expect(store.getState().pxPerSec).toBe(100);
    expect(store.getState().features.transitions).toBe(true);
  });

  it('setTrackHidden hides EVERY clip in the lane (not just the head)', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store, {});
    actions.setTrackHidden(0, true);
    let lane = store.getState().spec.tracks[0] as { clips: { hidden?: boolean }[] };
    expect(lane.clips.every((c) => c.hidden === true)).toBe(true); // all clips, not clips[0]
    actions.setTrackHidden(0, false);
    lane = store.getState().spec.tracks[0] as { clips: { hidden?: boolean }[] };
    expect(lane.clips.every((c) => c.hidden === false)).toBe(true);
  });

  it('setTrackMuted mutes every video clip in a visual lane', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store, {});
    actions.setTrackMuted(0, true);
    const lane = store.getState().spec.tracks[0] as { clips: { muted?: boolean }[] };
    expect(lane.clips.every((c) => c.muted === true)).toBe(true);
  });

  it('applies a feature subset over the defaults', () => {
    const store = createEditorStore({ spec: sampleSpec(), features: { effects: false } });
    expect(store.getState().features.effects).toBe(false);
    expect(store.getState().features.captions).toBe(true);
  });

  it('updateClip is immutable, recomputes duration, and fires onChange', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const before = store.getState().spec;
    const beforeSnapshot = JSON.parse(JSON.stringify(before)); // deep copy of the pre-edit spec
    const onChange = vi.fn();
    const actions = createEditorActions(store, { onChange });

    actions.updateClip(0, 0, { duration: 4 });

    const after = store.getState().spec;
    expect(after).not.toBe(before); // new reference
    expect(before).toEqual(beforeSnapshot); // previous spec object not mutated in place
    const track = after.tracks[0];
    expect(track.type).toBe('visual');
    if (track.type === 'visual') expect(track.clips[0]?.duration).toBe(4);
    expect(store.getState().durationSec).toBe(6);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('selection is identity-stable — follows its clip across a structural edit', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store, {});
    const t0 = store.getState().spec.tracks[0];
    if (t0.type !== 'visual') throw new Error('expected a visual lane');
    const targetId = t0.clips[1]!.id; // the SECOND clip
    expect(targetId).toBeTruthy();

    actions.select({ kind: 'clip', trackIndex: 0, itemIndex: 1 });
    expect(store.getState().selection?.id).toBe(targetId);

    // Remove the FIRST clip → the selected clip shifts from index 1 to index 0.
    actions.removeClip(0, 0);
    const sel = store.getState().selection;
    expect(sel?.id).toBe(targetId); // same item, by identity (the stored ref is id-only)
    // The id resolves to the NEW position (was 1, now 0) — no dangling/wrong-clip.
    expect(resolveSelection(store.getState().spec, sel)?.itemIndex).toBe(0);
  });

  it('stores selection as a pure id ref (no positional fields to drift)', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store, {});
    actions.select({ kind: 'clip', trackIndex: 0, itemIndex: 1 });
    const sel = store.getState().selection!;
    expect(Object.keys(sel).sort()).toEqual(['id', 'kind']); // no trackIndex/itemIndex
  });

  it('seam selection is id-stable — survives an edit that renumbers clips', () => {
    // Three clips so a transition can sit on the 2nd→3rd seam (gap 1).
    const spec: VixelSpec = {
      version: 1,
      output: { width: 1080, height: 1920, fps: 30 },
      tracks: [
        {
          type: 'visual',
          sequential: true,
          clips: [
            { media: { kind: 'video', source: 'a.mp4' }, at: 0, duration: 2 },
            { media: { kind: 'video', source: 'b.mp4' }, at: 2, duration: 2 },
            { media: { kind: 'video', source: 'c.mp4' }, at: 4, duration: 2 },
          ],
        },
      ],
    };
    const store = createEditorStore({ spec });
    const actions = createEditorActions(store, {});
    actions.selectSeam({ trackIndex: 0, gap: 1 }); // seam after clip[1]
    const beforeId = store.getState().selectedSeam!.afterClipId;
    const t0 = store.getState().spec.tracks[0];
    const clip1Id = t0.type === 'visual' ? t0.clips[1]!.id : undefined;
    expect(beforeId).toBe(clip1Id); // seam keyed on the clip BEFORE it

    actions.removeClip(0, 0); // clip[1] becomes index 0 — positions renumber
    const seam = store.getState().selectedSeam;
    expect(seam?.afterClipId).toBe(beforeId); // same seam, by identity
    expect(resolveSeam(store.getState().spec, seam)?.gap).toBe(0); // resolves to the new gap
  });

  it('seam selection clears when one of its clips is deleted', () => {
    const store = createEditorStore({ spec: sampleSpec() }); // 2 clips → seam at gap 0
    const actions = createEditorActions(store, {});
    actions.selectSeam({ trackIndex: 0, gap: 0 });
    expect(store.getState().selectedSeam).not.toBeNull();
    actions.removeClip(0, 1); // delete the 2nd clip → no following clip → seam invalid
    expect(store.getState().selectedSeam).toBeNull();
  });

  it('selection clears when its selected clip is deleted', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store, {});
    actions.select({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    expect(store.getState().selection?.id).toBeTruthy();
    actions.removeClip(0, 0); // delete the selected clip itself
    expect(store.getState().selection).toBeNull();
  });

  it('dispatch applies an id-addressed command, labels the undo step, and undo reverts it', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store, {});
    const t0 = store.getState().spec.tracks[0];
    if (t0.type !== 'visual') throw new Error('expected visual');
    const id = t0.clips[0]!.id!;

    actions.dispatch({ type: 'removeClip', clipId: id });
    const after = store.getState().spec.tracks[0];
    expect(after.type === 'visual' && after.clips.length).toBe(1);
    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().undoLabel).toBe('Delete clip');

    actions.undo();
    const reverted = store.getState().spec.tracks[0];
    expect(reverted.type === 'visual' && reverted.clips.length).toBe(2);
    expect(store.getState().redoLabel).toBe('Delete clip');
  });

  it('setPlayhead clamps to [0, duration]', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store);
    actions.setPlayhead(999);
    expect(store.getState().playheadSec).toBe(5);
    actions.setPlayhead(-10);
    expect(store.getState().playheadSec).toBe(0);
  });

  it('requestExport hands the current spec to the host', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const onExport = vi.fn();
    const actions = createEditorActions(store, { onExport });
    actions.requestExport();
    expect(onExport).toHaveBeenCalledWith(store.getState().spec);
  });
});

describe('editor history (undo / redo)', () => {
  const durOf = (s: ReturnType<typeof createEditorStore>) => {
    const t = s.getState().spec.tracks[0];
    return t.type === 'visual' ? t.clips[0]?.duration : undefined;
  };

  it('undo restores the previous spec; redo re-applies it; flags track availability', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store);
    expect(store.getState().canUndo).toBe(false);

    actions.updateClip(0, 0, { duration: 4 });
    expect(durOf(store)).toBe(4);
    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().canRedo).toBe(false);

    actions.undo();
    expect(durOf(store)).toBe(3); // back to the seed
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);

    actions.redo();
    expect(durOf(store)).toBe(4);
    expect(store.getState().canRedo).toBe(false);
  });

  it('a new edit after undo clears the redo stack', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store);
    actions.updateClip(0, 0, { duration: 4 });
    actions.undo();
    expect(store.getState().canRedo).toBe(true);
    actions.updateClip(0, 0, { duration: 7 });
    expect(store.getState().canRedo).toBe(false); // future dropped
    expect(durOf(store)).toBe(7);
  });

  it('rapid edits within the coalesce window collapse into ONE undo step', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store);
    // performance.now() advances trivially across these synchronous calls (< 600ms),
    // so the burst coalesces: a single undo reverts the whole sweep to the seed.
    for (let d = 4; d <= 9; d++) actions.updateClip(0, 0, { duration: d });
    expect(durOf(store)).toBe(9);
    actions.undo();
    expect(durOf(store)).toBe(3); // one step back to before the burst
    expect(store.getState().canUndo).toBe(false);
  });

  it('undo nulls a selection that now dangles (undo of an add)', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store);
    actions.addClipInNewLane({ media: { kind: 'text', text: 'hi' }, at: 0, duration: 2 });
    actions.select({ kind: 'clip', trackIndex: 1, itemIndex: 0 });
    actions.undo(); // removes the new lane → selection (track 1) dangles
    expect(store.getState().selection).toBeNull();
  });

  it('clearHistory drops undo/redo', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const actions = createEditorActions(store);
    actions.updateClip(0, 0, { duration: 4 });
    actions.clearHistory();
    expect(store.getState().canUndo).toBe(false);
    actions.undo();
    expect(durOf(store)).toBe(4); // nothing to undo
  });
});
