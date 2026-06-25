/**
 * Re-export shim — the VixelSpec geometry + immutable edit helpers now live in
 * `@classytic/vixel-schema` (the headless edit core, so a Node agent / server pipeline
 * applies edits without pulling React). This file keeps the historical
 * `vixel-ui/shared/utils/spec` import path working for every internal consumer.
 */
export {
  isVisualTrack,
  isAudioTrack,
  layoutLane,
  laneSeams,
  reflowSequential,
  totalDurationSec,
  MAX_TRANSITION_OVERLAP_FRACTION,
  MIN_TRANSITION_DURATION,
  MUTE_DB,
  withTrack,
  withClipPatch,
  withTrackHidden,
  withTrackMuted,
  withClipMoved,
  withClipRemoved,
  withAudioPatch,
  withAudioRemoved,
  withTrackMoved,
  withClipInserted,
  withClipInNewLane,
  laneFreeAt,
  isEffectLane,
  pruneEmptyLanes,
  withClipAutoPlaced,
  withClipMovedToLane,
  withClipSplit,
  withClipDuplicated,
  withClipMovedToNewLane,
  withClipAppended,
  withAudioItemAppended,
  withOutputPatch,
  withTransition,
} from '@classytic/vixel-schema';
export type { ClipLayout, LaneSeam } from '@classytic/vixel-schema';
