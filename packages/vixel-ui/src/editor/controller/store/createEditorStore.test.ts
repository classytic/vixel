import { describe, it, expect, vi } from 'vitest';
import type { VixelSpec } from '@classytic/vixel-schema';
import { createEditorStore, createEditorActions } from './createEditorStore.js';

function sampleSpec(): VixelSpec {
  return {
    version: 1,
    output: { width: 1080, height: 1920, fps: 30 },
    tracks: [
      {
        type: 'video',
        clips: [
          { source: 'a.mp4', duration: 3 },
          { source: 'b.mp4', duration: 2 },
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
    expect(track.type).toBe('video');
    if (track.type === 'video') expect(track.clips[0]?.duration).toBe(4);
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
