/**
 * `<StandardEditor>` — a ready-to-use, Tailwind-styled editor.
 *
 * The `@classytic/react-media` `StandardPlayer` equivalent: a REFERENCE
 * COMPOSITION that wires the headless primitives + cva `variants` into a
 * drop-in editor (toolbar · preview · timeline). Use it as-is, or copy it as the
 * starting point for a bespoke layout.
 *
 * @example
 * ```tsx
 * <StandardEditor spec={spec} features={{ transitions: true }} onChange={save} onExport={render} />
 * ```
 */
'use client';

import { VixelEditor } from '../editor/index.js';
import {
  Timeline,
  TimeRuler,
  Playhead,
  TimelineTrack,
  TimelineClip,
  useTimelineTracks,
  useTimelineGeometry,
  type TimelineItem,
} from '../timeline/index.js';
import { PlayButton, TimeDisplay, ExportButton, PreviewSurface } from '../transport/index.js';
import { cn } from '../shared/utils/cn.js';
import {
  timelineVariants,
  trackVariants,
  clipVariants,
  playheadVariants,
  rulerVariants,
  transportButtonVariants,
} from '../shared/utils/variants.js';
import type { VixelEditorProps } from '../types.js';

export interface StandardEditorProps extends Omit<VixelEditorProps, 'children'> {
  /** Proxy MP4 URL (vixel `editorProxy`) for the preview surface. */
  proxySrc?: string;
}

const labelFor = (item: TimelineItem) => `${item.selectionKind} ${item.index + 1}`;

/** The track stack — a component so it can read the timeline geometry. */
function StandardTimelineBody() {
  const tracks = useTimelineTracks();
  const { secToPx, durationSec } = useTimelineGeometry();
  const width = Math.max(secToPx(durationSec), 1);

  return (
    <div className="relative" style={{ width }}>
      <TimeRuler className={cn(rulerVariants())} />
      <div className="relative mt-1 flex flex-col gap-1">
        {tracks.map((t) => (
          <TimelineTrack
            key={t.index}
            track={t}
            className={cn(trackVariants({ kind: t.type }), 'rounded')}
            style={{ width }}
          >
            {(item) => (
              <TimelineClip item={item} className={cn(clipVariants({ kind: item.selectionKind }))}>
                <span className="block truncate">{labelFor(item)}</span>
              </TimelineClip>
            )}
          </TimelineTrack>
        ))}
      </div>
      <Playhead className={cn(playheadVariants())} />
    </div>
  );
}

export function StandardEditor({ proxySrc, className, ...editorProps }: StandardEditorProps) {
  return (
    <VixelEditor
      {...editorProps}
      className={cn('flex flex-col gap-2 rounded-xl bg-zinc-950 p-3 text-white', className)}
    >
      <div className="flex items-center gap-2">
        <PlayButton className={cn(transportButtonVariants({ variant: 'primary', size: 'sm' }))} />
        <TimeDisplay className="font-mono text-xs text-white/70" />
        <span className="flex-1" />
        <ExportButton className={cn(transportButtonVariants({ variant: 'default', size: 'sm' }))}>
          Export
        </ExportButton>
      </div>

      {proxySrc != null && (
        <PreviewSurface
          src={proxySrc}
          className="aspect-video w-full rounded-md bg-black object-contain"
        />
      )}

      <Timeline className={cn(timelineVariants(), 'h-44 p-2')}>
        <StandardTimelineBody />
      </Timeline>
    </VixelEditor>
  );
}
