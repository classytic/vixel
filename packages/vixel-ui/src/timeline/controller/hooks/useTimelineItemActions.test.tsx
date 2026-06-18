import { describe, it, expect } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { VixelSpec, VisualClip } from '@classytic/vixel-schema';
import { createEditorStore, createEditorActions } from '../../../editor/controller/store/createEditorStore.js';
import { EditorStoreContext, EditorActionsContext } from '../../../editor/controller/context/EditorContext.js';
import { useTimelineItemActions, type ItemActionTarget } from './useTimelineItemActions.js';

// ── fixtures ────────────────────────────────────────────────────────────────
const img = (at: number, duration = 3): VisualClip => ({ media: { kind: 'image', source: 's' }, at, duration });
const fx = (id: string, at: number, duration = 3): VisualClip => ({ media: { kind: 'effect', effect: { id } }, at, duration });

function makeSpec(): VixelSpec {
  return {
    version: 1,
    output: { width: 1080, height: 1920, fps: 30 },
    tracks: [
      { type: 'visual', sequential: true, clips: [img(0, 3), img(3, 3)] }, // 0: main lane
      { type: 'visual', clips: [fx('contrast', 0, 3)] }, // 1: effect lane
      { type: 'audio', items: [{ source: 'a.mp3', at: 0, in: 0, out: 5, gain: 0 }] }, // 2: audio
    ],
  };
}

/** A renderHook harness wired with a live editor store + actions provider. */
function harness(spec = makeSpec()) {
  const store = createEditorStore({ spec });
  const actions = createEditorActions(store);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      EditorStoreContext.Provider,
      { value: store },
      createElement(EditorActionsContext.Provider, { value: actions }, children),
    );
  const render = (target: ItemActionTarget | null) =>
    renderHook(({ t }: { t: ItemActionTarget | null }) => useTimelineItemActions(t), {
      wrapper,
      initialProps: { t: target },
    });
  return { store, actions, render };
}

const clipsOf = (store: ReturnType<typeof createEditorStore>, ti: number) => {
  const t = store.getState().spec.tracks[ti];
  return t?.type === 'visual' ? t.clips : [];
};
const visualLanes = (store: ReturnType<typeof createEditorStore>) =>
  store.getState().spec.tracks.filter((t) => t.type === 'visual').length;

describe('useTimelineItemActions', () => {
  it('null target → unavailable, every command is a safe no-op', () => {
    const { store, render } = harness();
    const { result } = render(null);
    expect(result.current.available).toBe(false);
    expect(result.current.canSplit).toBe(false);
    act(() => result.current.remove()); // must not throw / must not mutate
    expect(clipsOf(store, 0)).toHaveLength(2);
  });

  it('resolves a clip target with the right flags', () => {
    const { render } = harness();
    const { result } = render({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    expect(result.current.available).toBe(true);
    expect(result.current.isClip).toBe(true);
    expect(result.current.isAudio).toBe(false);
    expect(result.current.hasAudio).toBe(false); // an image has no audio track
  });

  it('remove() deletes the clip', () => {
    const { store, render } = harness();
    const { result } = render({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    act(() => result.current.remove());
    expect(clipsOf(store, 0)).toHaveLength(1);
  });

  it('remove() on the last effect clip auto-prunes its lane', () => {
    const { store, render } = harness();
    expect(visualLanes(store)).toBe(2);
    const { result } = render({ kind: 'clip', trackIndex: 1, itemIndex: 0 });
    act(() => result.current.remove());
    expect(visualLanes(store)).toBe(1); // effect lane gone
  });

  it('toggleHide() flips the clip hidden flag', () => {
    const { store, render } = harness();
    const { result } = render({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    expect(result.current.hidden).toBe(false);
    act(() => result.current.toggleHide());
    expect(clipsOf(store, 0)[0]!.hidden).toBe(true);
  });

  it('duplicate() adds a clip to the lane', () => {
    const { store, render } = harness();
    const { result } = render({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    act(() => result.current.duplicate());
    expect(clipsOf(store, 0).length).toBe(3);
  });

  it('canSplit follows the playhead; split() cuts the clip in two', () => {
    const { store, render } = harness();
    const { result } = render({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    expect(result.current.canSplit).toBe(false); // playhead at 0 (clip edge)
    act(() => store.setState({ playheadSec: 1.5 })); // inside clip 0 [0,3]
    expect(result.current.canSplit).toBe(true);
    act(() => result.current.split());
    expect(clipsOf(store, 0).length).toBe(3); // 2 → 3 (clip 0 split into two)
  });

  it('nudge() reorders on a sequential lane (clamped at the ends)', () => {
    // Distinguishable durations so a reorder is observable after the lane reflows
    // its butt-joined positions (both clips otherwise reflow to the same `at`).
    const spec = makeSpec();
    const lane0 = spec.tracks[0];
    if (lane0.type === 'visual') lane0.clips = [img(0, 2), img(2, 4)];
    const { store, render } = harness(spec);
    const { result } = render({ kind: 'clip', trackIndex: 0, itemIndex: 0 });
    expect(clipsOf(store, 0).map((c) => c.duration)).toEqual([2, 4]);
    act(() => result.current.nudge(1)); // move clip 0 right → order [4,2]
    const after = clipsOf(store, 0);
    expect(after.length).toBe(2); // reorder, not add
    expect(after.map((c) => c.duration)).toEqual([4, 2]);
    // at the left edge a left-nudge is a clamped no-op (order unchanged).
    const { result: head } = render({ kind: 'clip', trackIndex: 0, itemIndex: 1 });
    act(() => head.current.nudge(1)); // index 1 is already last → clamp
    expect(clipsOf(store, 0).map((c) => c.duration)).toEqual([4, 2]);
  });

  it('nudge() shifts `at` by a step on a free (non-sequential) effect lane', () => {
    const { store, render } = harness();
    const { result } = render({ kind: 'clip', trackIndex: 1, itemIndex: 0 });
    act(() => result.current.nudge(1));
    expect(clipsOf(store, 1)[0]!.at).toBeCloseTo(0.1, 5);
    act(() => result.current.nudge(-1)); // back toward 0
    expect(clipsOf(store, 1)[0]!.at).toBeCloseTo(0, 5);
    act(() => result.current.nudge(-1)); // clamped at 0, never negative
    expect(clipsOf(store, 1)[0]!.at).toBe(0);
  });

  it('audio item: muted reflects gain, toggleMute drops to −60 and restores', () => {
    const { store, render } = harness();
    const { result } = render({ kind: 'audio', trackIndex: 2, itemIndex: 0 });
    expect(result.current.isAudio).toBe(true);
    expect(result.current.hasAudio).toBe(true);
    expect(result.current.muted).toBe(false);
    act(() => result.current.toggleMute());
    const t = store.getState().spec.tracks[2];
    expect(t.type === 'audio' && t.items[0]!.gain).toBe(-60);
    act(() => result.current.toggleMute()); // unmute → restores pre-mute gain (0)
    const t2 = store.getState().spec.tracks[2];
    expect(t2.type === 'audio' && t2.items[0]!.gain).toBe(0);
  });
});
