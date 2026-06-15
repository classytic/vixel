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
  isVideoTrack,
  isOverlayTrack,
  isAudioTrack,
  clipDuration,
  layoutVideoTrack,
  totalDurationSec,
  withTrack,
  withClipPatch,
  withClipMoved,
  withClipRemoved,
  withItemPatch,
  withItemRemoved,
} from './utils/spec.js';

export type { ClipLayout } from './utils/spec.js';

export { cn } from './utils/cn.js';
export type { ClassValue } from './utils/cn.js';

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
