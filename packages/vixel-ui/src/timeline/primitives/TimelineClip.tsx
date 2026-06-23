/**
 * `<TimelineClip>` — a positioned, selectable, **draggable** block for a
 * {@link TimelineItem}. Body drag moves it (reorder for video clips, reposition
 * for overlays/audio); the left/right edges are trim handles. Width + offset come
 * from the timeline geometry. Headless — style via `className` / `data-*`
 * (`data-selected`, `data-dragging`; handles are `data-vixel-trim-start/end`).
 */
'use client';

import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { useTimelineGeometry } from '../controller/hooks/useTimeline.js';
import { useClipDrag } from '../controller/hooks/useClipDrag.js';
import { useEditorState } from '../../editor/controller/hooks/useEditorStore.js';
import { useTimelineItemActions } from '../controller/hooks/useTimelineItemActions.js';
import type { TimelineItem } from '../types.js';

export interface TimelineClipProps extends Omit<ComponentProps<'div'>, 'children'> {
  item: TimelineItem;
  /** Render drag-to-trim handles (default true; never shown for audio). */
  trimHandles?: boolean;
  /**
   * Class applied to BOTH trim handles (`data-vixel-trim-start/end`). The
   * primitive only positions the 8px grab zone + sets `cursor:ew-resize`; the
   * visible affordance (a grabber bar, edge bracket, hover reveal) is the
   * consumer's skin — pass it here so it lives in one place, not duplicated per
   * edge. Handles also carry `data-trim="start|end"` for fine-grained styling.
   */
  handleClassName?: string;
  children?:
    | ReactNode
    | ((state: { selected: boolean; dragging: boolean; item: TimelineItem }) => ReactNode);
}

const HANDLE_BASE: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 8,
  cursor: 'ew-resize',
  touchAction: 'none',
  zIndex: 2,
};

export function TimelineClip({
  item,
  trimHandles = true,
  handleClassName,
  children,
  className,
  style,
  onPointerDown,
  onKeyDown,
  ...props
}: TimelineClipProps) {
  const { secToPx } = useTimelineGeometry();
  const drag = useClipDrag(item);
  // Keyboard ops go through the SAME behavior primitive as the menu/toolbar/inspector
  // (select/delete/move) — one source of truth, with screen-reader announcements.
  const a = useTimelineItemActions({ kind: item.selectionKind, trackIndex: item.trackIndex, itemIndex: item.index });
  const selected = useEditorState(
    (s) => !!item.id && s.selection?.kind === item.selectionKind && s.selection.id === item.id,
  );

  const showTrim = trimHandles && item.selectionKind !== 'audio';
  const content =
    typeof children === 'function' ? children({ selected, dragging: drag.dragging, item }) : children;

  return (
    <div
      {...props}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${item.selectionKind} ${item.index + 1}`}
      className={className}
      data-vixel-clip=""
      data-kind={item.selectionKind}
      data-selected={selected}
      data-dragging={drag.dragging || undefined}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          a.select();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          a.remove();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          a.nudge(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          a.nudge(1);
        }
      }}
      style={{
        position: 'absolute',
        left: secToPx(item.startSec),
        width: secToPx(item.durationSec),
        top: 0,
        bottom: 0,
        boxSizing: 'border-box',
        touchAction: 'none',
        transform: drag.offsetPx ? `translateX(${drag.offsetPx}px)` : undefined,
        // A clip shows the normal arrow at rest (CapCut/Premiere) — the always-on
        // open-grab-hand read as "broken/heavy". The closed-hand appears only while a
        // move is actually in progress; the trim edges own `ew-resize` themselves.
        cursor: drag.dragging ? 'grabbing' : 'default',
        ...style,
      }}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        if (e.defaultPrevented) return;
        a.select();
        drag.body.onPointerDown(e);
      }}
      onPointerMove={drag.body.onPointerMove}
      onPointerUp={drag.body.onPointerUp}
    >
      {showTrim && (
        <div
          data-vixel-trim-start=""
          data-trim="start"
          aria-hidden="true"
          className={handleClassName}
          style={{ ...HANDLE_BASE, left: 0 }}
          {...drag.startHandle}
        />
      )}
      {content}
      {showTrim && (
        <div
          data-vixel-trim-end=""
          data-trim="end"
          aria-hidden="true"
          className={handleClassName}
          style={{ ...HANDLE_BASE, right: 0 }}
          {...drag.endHandle}
        />
      )}
    </div>
  );
}
