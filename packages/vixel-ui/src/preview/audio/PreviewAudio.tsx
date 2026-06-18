'use client';

/**
 * `<PreviewAudio>` — live audio playback for the editor preview. The Pixi preview
 * renders VIDEO frames only, so audio-track items + transition SFX would be silent
 * until export. This plays one `<audio>` element per source, synced to the playhead,
 * with volume driven by the SAME `gainKeyframes` envelope the export mixer uses — so
 * what you hear while scrubbing/playing matches what the engine mixes on export.
 *
 * Headless (renders null): mount it once inside `<VixelEditor>`, next to the preview.
 * The host supplies the audio sources (incl. any transition SFX it registered); this
 * component owns only the scheduling + `<audio>` lifecycle. (Browser autoplay policy
 * is satisfied because playback starts from the Play-button gesture.)
 */
import { useEffect, useRef } from 'react';
import { useEditorState } from '../../editor/controller/hooks/useEditorStore.js';
import { collectScheduledAudio, audioFrameAt } from './schedule.js';

export function PreviewAudio() {
  const spec = useEditorState((s) => s.spec);
  const playhead = useEditorState((s) => s.playheadSec);
  const isPlaying = useEditorState((s) => s.isPlaying);
  const els = useRef<Map<string, HTMLAudioElement>>(new Map());

  const items = collectScheduledAudio(spec);
  const keySig = items.map((x) => x.key).join('|');

  // Create / dispose `<audio>` elements as the set of sources changes.
  useEffect(() => {
    const want = new Set(items.map((x) => x.key));
    for (const [k, el] of els.current) {
      if (!want.has(k)) {
        el.pause();
        el.removeAttribute('src');
        el.remove();
        els.current.delete(k);
      }
    }
    for (const it of items) {
      if (!els.current.has(it.key)) {
        // No crossOrigin: plain playback needs no CORS, and forcing it blocks sources
        // that don't send CORS headers (sample-reading for export is a separate path).
        const a = new Audio(it.src);
        a.preload = 'auto';
        a.setAttribute('data-vixel-audio', it.key);
        a.style.display = 'none';
        document.body.appendChild(a);
        els.current.set(it.key, a);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  // Tear down on unmount.
  useEffect(() => {
    const map = els.current;
    return () => {
      for (const [, el] of map) {
        el.pause();
        el.removeAttribute('src');
        el.remove();
      }
      map.clear();
    };
  }, []);

  // Sync every render (the playhead ticks each frame while playing): start/stop each
  // element, correct large drift, and apply the sampled envelope as volume.
  useEffect(() => {
    for (const it of items) {
      const el = els.current.get(it.key);
      if (!el) continue;
      const f = audioFrameAt(it, playhead, isPlaying);
      if (f.shouldPlay) {
        if (Math.abs(el.currentTime - f.seekTo) > 0.3) {
          try {
            el.currentTime = f.seekTo;
          } catch {
            /* not seekable yet */
          }
        }
        el.volume = f.volume;
        if (el.paused) el.play().catch(() => {});
      } else if (!el.paused) {
        el.pause();
      }
    }
  });

  return null;
}
