import { useState } from 'react';
import { VixelEditor } from '@classytic/vixel-ui';
import type { FeatureConfig, VixelSpec } from '@classytic/vixel-ui';
import {
  Timeline,
  TimeRuler,
  Playhead,
  TimelineTrack,
  TimelineClip,
  useTimelineTracks,
  useTimelineGeometry,
} from '@classytic/vixel-ui/timeline';
import { PlayButton, TimeDisplay, ExportButton } from '@classytic/vixel-ui/transport';
import { PixiPreview } from '@classytic/vixel-ui/preview';
import {
  cn,
  timelineVariants,
  trackVariants,
  clipVariants,
  playheadVariants,
  rulerVariants,
  transportButtonVariants,
} from '@classytic/vixel-ui/shared';
import { sampleSpec } from './sampleSpec';

/** Track stack — a component so it can read the timeline geometry. */
function TimelineBody() {
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
                <span className="block truncate">
                  {item.selectionKind} {item.index + 1}
                </span>
              </TimelineClip>
            )}
          </TimelineTrack>
        ))}
      </div>
      <Playhead className={cn(playheadVariants())} />
    </div>
  );
}

const FEATURE_KEYS: (keyof FeatureConfig)[] = [
  'transitions',
  'kenBurns',
  'captions',
  'overlays',
  'multiTrackAudio',
  'effects',
];

export default function App() {
  const [spec, setSpec] = useState<VixelSpec>(sampleSpec);
  const [features, setFeatures] = useState<FeatureConfig>({
    transitions: true,
    kenBurns: true,
    captions: true,
    overlays: true,
    multiTrackAudio: false,
    effects: false,
  });
  const [log, setLog] = useState('');

  const toggle = (k: keyof FeatureConfig) => setFeatures((f) => ({ ...f, [k]: !f[k] }));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">
          @classytic/vixel-ui <span className="text-white/40">demo</span>
        </h1>
        <p className="text-sm text-white/50">
          Headless editor primitives + WebGL <code>PixiPreview</code> over a real{' '}
          <code>VixelSpec</code>. Click a clip to select · drag the red playhead to scrub · Play to
          watch.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-white/70">
        <span className="text-white/40">features (client subset):</span>
        {FEATURE_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!features[k]} onChange={() => toggle(k)} />
            {k}
          </label>
        ))}
      </div>

      <VixelEditor
        key={JSON.stringify(features)}
        spec={spec}
        features={features}
        onChange={setSpec}
        onExport={(s) =>
          setLog(`export → ${s.tracks.length} tracks · ${JSON.stringify(s.output)}`)
        }
        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-zinc-950 p-4"
      >
        <div className="flex items-center gap-3">
          <PlayButton className={cn(transportButtonVariants({ variant: 'primary', size: 'sm' }))} />
          <TimeDisplay className="font-mono text-xs text-white/70" />
          <span className="flex-1" />
          <ExportButton className={cn(transportButtonVariants({ variant: 'default', size: 'sm' }))}>
            Export spec
          </ExportButton>
        </div>

        <PixiPreview className="w-full overflow-hidden rounded-lg border border-white/10" />

        <Timeline className={cn(timelineVariants(), 'h-44 rounded-lg p-2')}>
          <TimelineBody />
        </Timeline>
      </VixelEditor>

      {log && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-emerald-400">
          {log}
        </pre>
      )}
    </div>
  );
}
