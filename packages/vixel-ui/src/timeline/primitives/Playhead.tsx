/**
 * `<Playhead>` — the scrubber. An absolutely-positioned marker at the current
 * playhead, draggable to seek. Headless: style the marker yourself.
 */
'use client';

import { useState } from 'react';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTimelineGeometry } from '../controller/hooks/useTimeline.js';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';

export interface PlayheadProps extends ComponentProps<'div'> {}

export function Playhead({ className, style, ...props }: PlayheadProps) {
  const { secToPx, clientXToSec } = useTimelineGeometry();
  const playheadSec = useEditorState((s) => s.playheadSec);
  const durationSec = useEditorState((s) => s.durationSec);
  const actions = useEditorActions();
  const [dragging, setDragging] = useState(false);

  // Arrow keys seek; Shift = coarse (1s); Home/End jump to ends. Makes the scrubber
  // operable without a pointer (it advertises role="slider").
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const fine = 1 / 30; // ~one frame
    const coarse = 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = playheadSec - (e.shiftKey ? coarse : fine);
    else if (e.key === 'ArrowRight') next = playheadSec + (e.shiftKey ? coarse : fine);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = durationSec;
    if (next === null) return;
    e.preventDefault();
    actions.setPlayhead(next);
  };

  return (
    <div
      {...props}
      role="slider"
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={durationSec}
      aria-valuenow={playheadSec}
      aria-valuetext={`${playheadSec.toFixed(2)} of ${durationSec.toFixed(2)} seconds`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={className}
      data-vixel-playhead=""
      data-dragging={dragging || undefined}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: secToPx(playheadSec),
        cursor: 'ew-resize',
        touchAction: 'none',
        ...style,
      }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* best-effort */
        }
        setDragging(true);
        actions.setPlayhead(clientXToSec(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging) actions.setPlayhead(clientXToSec(e.clientX));
      }}
      onPointerUp={(e) => {
        setDragging(false);
        try {
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        } catch {
          /* best-effort */
        }
      }}
    />
  );
}
