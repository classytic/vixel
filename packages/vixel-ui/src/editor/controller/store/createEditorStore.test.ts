import { describe, it, expect, vi } from 'vitest';
import type { VixelSpec } from '@classytic/vixel-schema';
import { createEditorStore, createEditorActions } from './createEditorStore.js';

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

  it('applies a feature subset over the defaults', () => {
    const store = createEditorStore({ spec: sampleSpec(), features: { effects: false } });
    expect(store.getState().features.effects).toBe(false);
    expect(store.getState().features.captions).toBe(true);
  });

  it('updateClip is immutable, recomputes duration, and fires onChange', () => {
    const store = createEditorStore({ spec: sampleSpec() });
    const before = store.getState().spec;
    const onChange = vi.fn();
    const actions = createEditorActions(store, { onChange });

    actions.updateClip(0, 0, { duration: 4 });

    const after = store.getState().spec;
    expect(after).not.toBe(before); // new reference
    expect(before.tracks[0]).toEqual(sampleSpec().tracks[0]); // original untouched
    const track = after.tracks[0];
    expect(track.type).toBe('visual');
    if (track.type === 'visual') expect(track.clips[0]?.duration).toBe(4);
    expect(store.getState().durationSec).toBe(6);
    expect(onChange).toHaveBeenCalledTimes(1);
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
