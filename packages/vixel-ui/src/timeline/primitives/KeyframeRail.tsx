/**
 * `<KeyframeRail>` — the ◆ diamonds drawn along a clip, now INTERACTIVE: drag to
 * retime, click to seek, double-/alt-click (or Delete when focused) to remove. A thin
 * default skin over {@link useKeyframeRail} (the behavior primitive) — headless in
 * spirit: position + interaction are owned here, the *look* is the consumer's via
 * `className` (the rail) and `markerClassName` (each ◆), or fully replaced via
 * `renderMarker` (the Base-UI-style escape hatch).
 *
 * Composes with `<TimelineClip>`: drop it among the clip's children. The rail is
 * `pointer-events:none` so empty gaps still hit the clip (select/drag); only the ◆
 * targets are interactive (and stop propagation so a keyframe drag isn't a clip drag).
 */
'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useKeyframeRail, type KeyframeMarkerBinding, type KeyframeMarkerState } from '../controller/hooks/useKeyframeRail.js';
import type { TimelineItem } from '../types.js';

export interface KeyframeRailProps {
  item: TimelineItem;
  /** Class on the rail container (a thin strip across the clip). */
  className?: string;
  /** Class on each ◆ — a string, or a function of the marker's state (active/dragging). */
  markerClassName?: string | ((state: KeyframeMarkerState) => string);
  /** Full escape hatch: render your own marker from the binding (position + handlers). */
  renderMarker?: (binding: KeyframeMarkerBinding) => ReactNode;
  /** Inline style for the rail container (e.g. override `bottom`/`height`). */
  style?: CSSProperties;
}

const RAIL_STYLE: CSSProperties = {
  position: 'absolute',
  insetInline: 0,
  bottom: 3,
  height: 12,
  pointerEvents: 'none', // empty rail passes clicks through to the clip
  zIndex: 10,
};

// The ◆ grab target. `ew-resize` (↔), never a grab-hand — it only moves horizontally.
const MARKER_STYLE: CSSProperties = {
  position: 'absolute',
  top: 2,
  width: 9,
  height: 9,
  transform: 'translateX(-50%) rotate(45deg)',
  borderRadius: 1,
  pointerEvents: 'auto',
  cursor: 'ew-resize',
  touchAction: 'none',
};

export function KeyframeRail({ item, className, markerClassName, renderMarker, style }: KeyframeRailProps) {
  const rail = useKeyframeRail(item);
  if (!rail.enabled || rail.markers.length === 0) return null;

  return (
    <div data-vixel-keyframe-rail="" className={className} style={{ ...RAIL_STYLE, ...style }}>
      {rail.markers.map((b) => {
        if (renderMarker) return renderMarker(b);
        const cls = typeof markerClassName === 'function' ? markerClassName(b.state) : markerClassName;
        return (
          <span
            key={b.key}
            role="button"
            tabIndex={0}
            aria-label={`Keyframe at ${b.state.t.toFixed(2)}s — drag to move, double-click to remove`}
            data-vixel-keyframe=""
            data-active={b.state.active || undefined}
            data-dragging={b.state.dragging || undefined}
            className={cls}
            style={{ ...MARKER_STYLE, left: `${b.leftPct}%` }}
            onPointerDown={b.handlers.onPointerDown}
            onDoubleClick={b.handlers.onDoubleClick}
            onKeyDown={b.handlers.onKeyDown}
          />
        );
      })}
    </div>
  );
}
