/**
 * `<Timeline>` — the scrollable track area. Measures its own width, computes
 * geometry from the editor's zoom (`pxPerSec`) + duration, and provides both via
 * {@link TimelineContext}. Children may be a render-function receiving the
 * derived {@link TrackView}[].
 *
 * @example
 * ```tsx
 * <Timeline className="relative h-40">
 *   {(tracks) => tracks.map((t) => <TimelineTrack key={t.index} track={t}>{…}</TimelineTrack>)}
 * </Timeline>
 * ```
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { TimelineContext, type TimelineGeometry } from '../controller/context/TimelineContext.js';
import { useTimelineTracks } from '../controller/hooks/useTimeline.js';
import { useShallowEditorState } from '../../editor/controller/hooks/useEditorStore.js';
import type { TrackView } from '../types.js';

export interface TimelineProps extends Omit<ComponentProps<'div'>, 'children'> {
  children?: ReactNode | ((tracks: TrackView[]) => ReactNode);
}

export function Timeline({ children, className, style, ...props }: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);

  const { pxPerSec, durationSec } = useShallowEditorState((s) => ({
    pxPerSec: s.pxPerSec,
    durationSec: s.durationSec,
  }));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidthPx(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo<TimelineGeometry>(
    () => ({
      pxPerSec,
      durationSec,
      widthPx,
      secToPx: (sec) => sec * pxPerSec,
      pxToSec: (px) => px / pxPerSec,
      clientXToSec: (clientX) => {
        const rect = ref.current?.getBoundingClientRect();
        const x = rect ? clientX - rect.left + ref.current!.scrollLeft : 0;
        return x / pxPerSec;
      },
    }),
    [pxPerSec, durationSec, widthPx],
  );

  const tracks = useTimelineTracks();
  const content = typeof children === 'function' ? children(tracks) : children;

  return (
    <TimelineContext.Provider value={geometry}>
      <div
        ref={ref}
        className={className}
        data-vixel-timeline=""
        data-duration={durationSec}
        style={{ position: 'relative', overflowX: 'auto', ...style }}
        {...props}
      >
        {content}
      </div>
    </TimelineContext.Provider>
  );
}
