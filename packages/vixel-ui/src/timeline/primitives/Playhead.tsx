/**
 * `<Playhead>` — the scrubber. An absolutely-positioned marker at the current
 * playhead, draggable to seek. Headless: style the marker yourself.
 */
'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import { useTimelineGeometry } from '../controller/hooks/useTimeline.js';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';

export interface PlayheadProps extends ComponentProps<'div'> {}

export function Playhead({ className, style, ...props }: PlayheadProps) {
  const { secToPx, clientXToSec } = useTimelineGeometry();
  const playheadSec = useEditorState((s) => s.playheadSec);
  const actions = useEditorActions();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      {...props}
      role="slider"
      aria-label="Playhead"
      aria-valuenow={playheadSec}
      tabIndex={0}
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
