/**
 * `<MarkerRail>` — the timeline marker strip. Renders each {@link Marker} as an
 * absolutely-positioned pin at its `at`, aligned to the same time axis as the ruler /
 * playhead (via {@link useTimelineGeometry}). Headless-but-styled like the other
 * timeline primitives: a render-prop for full control, else default pins styled via
 * `data-*` (`data-vixel-marker`, `data-kind`) + `markerClassName`.
 *
 * Default interactions: click a pin → seek to it; right-click → remove it;
 * double-click the empty rail → add a marker there. All go through {@link useMarkers}
 * (the id-addressed commands), so they're undoable and shared with any toolbar/keymap.
 */
'use client';

import { Fragment } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { Marker } from '@classytic/vixel-schema';
import { useTimelineGeometry } from '../controller/hooks/useTimeline.js';
import { useMarkers } from '../controller/hooks/useMarkers.js';

/** One marker resolved to its x position (px) on the rail. */
export interface MarkerState {
  marker: Marker;
  px: number;
}

/** Per-marker actions handed to a custom {@link MarkerRailProps.renderMarker}. */
export interface MarkerApi {
  /** Seek the playhead to this marker. */
  seek: () => void;
  /** Remove this marker. */
  remove: () => void;
  /** Rename this marker. */
  rename: (label: string) => void;
  /** Patch any of the marker's fields (kind / color / at / …). */
  update: (patch: Partial<Omit<Marker, 'id'>>) => void;
  /** Move this marker to a new time (seconds, clamped ≥ 0). */
  setTime: (sec: number) => void;
}

export interface MarkerRailProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Full control: render the resolved markers yourself (no container/add wiring). */
  children?: (markers: MarkerState[]) => ReactNode;
  /** Per-pin custom render — KEEPS the rail container + double-click-to-add. Receives
   *  the marker and its bound actions (seek/remove/rename). The common customization. */
  renderMarker?: (state: MarkerState, api: MarkerApi) => ReactNode;
  /** Per-pin className for the DEFAULT pin (ignored when `renderMarker` is given). */
  markerClassName?: string;
  /** Click a pin → seek the playhead to it (default true). */
  seekOnClick?: boolean;
  /** Double-click the empty rail → add a marker there (default true). */
  addOnDoubleClick?: boolean;
}

export function MarkerRail({
  className,
  style,
  children,
  renderMarker,
  markerClassName,
  seekOnClick = true,
  addOnDoubleClick = true,
  ...props
}: MarkerRailProps) {
  const { secToPx, durationSec, clientXToSec } = useTimelineGeometry();
  const { markers, add, remove, seekTo, rename, update } = useMarkers();

  const states: MarkerState[] = markers.map((m) => ({ marker: m, px: secToPx(m.at) }));

  if (typeof children === 'function') return <>{children(states)}</>;

  const apiFor = (s: MarkerState): MarkerApi => ({
    seek: () => seekTo(s.marker),
    remove: () => s.marker.id && remove(s.marker.id),
    rename: (label) => s.marker.id && rename(s.marker.id, label),
    update: (patch) => s.marker.id && update(s.marker.id, patch),
    setTime: (sec) => s.marker.id && update(s.marker.id, { at: Math.max(0, sec) }),
  });

  return (
    <div
      className={className}
      data-vixel-marker-rail=""
      style={{ position: 'relative', width: secToPx(durationSec), ...style }}
      onDoubleClick={addOnDoubleClick ? (e) => add(clientXToSec(e.clientX)) : undefined}
      {...props}
    >
      {renderMarker &&
        states.map((s) => <Fragment key={s.marker.id ?? s.marker.at}>{renderMarker(s, apiFor(s))}</Fragment>)}
      {!renderMarker &&
        states.map((s) => (
          <button
          key={s.marker.id ?? s.marker.at}
          type="button"
          data-vixel-marker=""
          data-kind={s.marker.kind ?? 'note'}
          aria-label={s.marker.label ? `Marker: ${s.marker.label}` : `Marker at ${s.marker.at.toFixed(2)}s`}
          title={s.marker.label}
          onClick={() => seekOnClick && seekTo(s.marker)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (s.marker.id) remove(s.marker.id);
          }}
          className={markerClassName}
          style={{
            position: 'absolute',
            left: s.px,
            top: 0,
            transform: 'translateX(-50%)',
            ...(s.marker.color ? ({ ['--vixel-marker-color']: s.marker.color } as React.CSSProperties) : {}),
          }}
        >
          {s.marker.label}
        </button>
      ))}
    </div>
  );
}
