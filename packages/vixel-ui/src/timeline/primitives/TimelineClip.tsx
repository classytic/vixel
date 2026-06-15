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
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';
import type { TimelineItem } from '../types.js';

export interface TimelineClipProps extends Omit<ComponentProps<'div'>, 'children'> {
  item: TimelineItem;
  /** Render drag-to-trim handles (default true; never shown for audio). */
  trimHandles?: boolean;
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
  children,
  className,
  style,
  onPointerDown,
  ...props
}: TimelineClipProps) {
  const { secToPx } = useTimelineGeometry();
  const actions = useEditorActions();
  const drag = useClipDrag(item);
  const selected = useEditorState(
    (s) =>
      s.selection?.kind === item.selectionKind &&
      s.selection.trackIndex === item.trackIndex &&
      s.selection.itemIndex === item.index,
  );

  const showTrim = trimHandles && item.selectionKind !== 'audio';
  const content =
    typeof children === 'function' ? children({ selected, dragging: drag.dragging, item }) : children;

  return (
    <div
      {...props}
      role="button"
      tabIndex={0}
      className={className}
      data-vixel-clip=""
      data-kind={item.selectionKind}
      data-selected={selected}
      data-dragging={drag.dragging || undefined}
      style={{
        position: 'absolute',
        left: secToPx(item.startSec),
        width: secToPx(item.durationSec),
        top: 0,
        bottom: 0,
        boxSizing: 'border-box',
        touchAction: 'none',
        transform: drag.offsetPx ? `translateX(${drag.offsetPx}px)` : undefined,
        cursor: drag.dragging ? 'grabbing' : 'grab',
        ...style,
      }}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        if (e.defaultPrevented) return;
        actions.select({
          kind: item.selectionKind,
          trackIndex: item.trackIndex,
          itemIndex: item.index,
        });
        drag.body.onPointerDown(e);
      }}
      onPointerMove={drag.body.onPointerMove}
      onPointerUp={drag.body.onPointerUp}
    >
      {showTrim && (
        <div data-vixel-trim-start="" aria-hidden="true" style={{ ...HANDLE_BASE, left: 0 }} {...drag.startHandle} />
      )}
      {content}
      {showTrim && (
        <div data-vixel-trim-end="" aria-hidden="true" style={{ ...HANDLE_BASE, right: 0 }} {...drag.endHandle} />
      )}
    </div>
  );
}
