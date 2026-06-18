/**
 * Tracks — the lane model.
 * ========================
 * Two lane kinds: a {@link VisualTrack} (any visual media — image/video/text/
 * shape/effect, mixed) and an {@link AudioTrack}. Lanes composite in array order
 * (later = on top). Transitions are first-class, stored on a visual lane between
 * adjacent clips ({@link SequenceTransition} in `./visual`). There is no separate
 * "base"/"overlay" distinction — see `./visual` for the model.
 */
import type { VisualTrack } from './visual.js';
import type { AudioItem } from './audio.js';

export interface AudioTrack {
  type: 'audio';
  items: AudioItem[];
}

export type Track = VisualTrack | AudioTrack;
