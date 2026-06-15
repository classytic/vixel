/**
 * `<PreviewSurface>` — a proxy-video preview bound to the editor playhead.
 *
 * vixel renders server-side (ffmpeg), so accurate WYSIWYG preview = scrub a
 * low-res proxy MP4 vixel produced for this spec (its `editorProxy` profile).
 * Pass that proxy URL as `src`; this element keeps the proxy's `currentTime` in
 * sync with the playhead and reports playback back into the store. For richer
 * playback (HLS/captions) swap this for `@classytic/react-media`'s `<Video>` —
 * same store wiring.
 */
'use client';

import { useEffect, useRef } from 'react';
import type { VideoHTMLAttributes } from 'react';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';

const SYNC_TOLERANCE_S = 0.05;

export interface PreviewSurfaceProps extends VideoHTMLAttributes<HTMLVideoElement> {
  /** Proxy MP4 URL for the current spec (from vixel's `editorProxy` render). */
  src?: string;
}

export function PreviewSurface({ src, ...props }: PreviewSurfaceProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const playheadSec = useEditorState((s) => s.playheadSec);
  const isPlaying = useEditorState((s) => s.isPlaying);
  const actions = useEditorActions();

  // Drive play/pause from the store.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isPlaying) void el.play().catch(() => {});
    else el.pause();
  }, [isPlaying]);

  // While paused, follow the playhead (scrub). While playing, let the video run
  // and report its time back to the store.
  useEffect(() => {
    const el = ref.current;
    if (!el || isPlaying) return;
    if (Math.abs(el.currentTime - playheadSec) > SYNC_TOLERANCE_S) {
      el.currentTime = playheadSec;
    }
  }, [playheadSec, isPlaying]);

  return (
    <video
      {...props}
      ref={ref}
      src={src}
      data-vixel-preview=""
      onTimeUpdate={(e) => {
        props.onTimeUpdate?.(e);
        if (isPlaying) actions.setPlayhead(e.currentTarget.currentTime);
      }}
      onEnded={(e) => {
        props.onEnded?.(e);
        actions.pause();
      }}
    />
  );
}
