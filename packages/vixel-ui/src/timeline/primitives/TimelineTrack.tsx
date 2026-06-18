/**
 * `<TimelineTrack>` — one row. Pass a {@link TrackView} (from {@link Timeline}'s
 * render-function) and a render-function for its items.
 */
'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { TrackView, TimelineItem } from '../types.js';

export interface TimelineTrackProps extends Omit<ComponentProps<'div'>, 'children'> {
  track: TrackView;
  children?: ReactNode | ((item: TimelineItem) => ReactNode);
}

export function TimelineTrack({ track, children, className, style, ...props }: TimelineTrackProps) {
  return (
    <div
      className={className}
      data-vixel-track=""
      data-track-type={track.type}
      data-track-index={track.index}
      data-track-lane={track.lane}
      style={{ position: 'relative', ...style }}
      {...props}
    >
      {typeof children === 'function'
        ? track.items.map((item) => (
            <div key={`${item.trackIndex}:${item.index}`} style={{ display: 'contents' }}>
              {children(item)}
            </div>
          ))
        : children}
    </div>
  );
}
