export {
  resolveFps,
  clamp,
  secToFrames,
  framesToSec,
  snapToFrame,
  formatTimecode,
  formatClock,
} from './utils/time.js';

export {
  isVisualTrack,
  isAudioTrack,
  layoutLane,
  reflowSequential,
  totalDurationSec,
  withTrack,
  withClipPatch,
  withClipMoved,
  withClipRemoved,
  withAudioPatch,
  withAudioRemoved,
  withTrackMoved,
  withClipInserted,
  withClipInNewLane,
  withClipMovedToLane,
  withClipMovedToNewLane,
  withClipSplit,
  withClipDuplicated,
  withClipAppended,
  withAudioItemAppended,
  withOutputPatch,
  withTransition,
} from './utils/spec.js';

export type { ClipLayout } from './utils/spec.js';

export { cn } from './utils/cn.js';
export type { ClassValue } from './utils/cn.js';

export { useTransformDrag, applyResize, applyResizeRotated, normalizeAngle } from './transform/useTransformDrag.js';
export type { TransformMode, TransformDragConfig } from './transform/useTransformDrag.js';

export {
  timelineVariants,
  trackVariants,
  clipVariants,
  playheadVariants,
  rulerVariants,
  transportButtonVariants,
} from './utils/variants.js';
export type {
  TimelineVariants,
  TrackVariants,
  ClipVariants,
  PlayheadVariants,
  RulerVariants,
  TransportButtonVariants,
} from './utils/variants.js';
