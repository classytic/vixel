'use client';

import { createContext } from 'react';

/** Geometry shared by all timeline primitives (provided by {@link Timeline}). */
export interface TimelineGeometry {
  /** Horizontal scale. */
  pxPerSec: number;
  /** Total composition duration in seconds. */
  durationSec: number;
  /** Measured track-area width in pixels. */
  widthPx: number;
  /** Seconds → pixels. */
  secToPx: (sec: number) => number;
  /** Pixels (relative to the track area) → seconds. */
  pxToSec: (px: number) => number;
  /** A pointer's `clientX` → seconds (reads the live container rect). */
  clientXToSec: (clientX: number) => number;
}

export const TimelineContext = createContext<TimelineGeometry | null>(null);
