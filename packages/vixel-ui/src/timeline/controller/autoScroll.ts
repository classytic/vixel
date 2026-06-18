/**
 * Edge auto-scroll while dragging — when the pointer nears the timeline's top or
 * bottom edge mid-drag, scroll the lane area so off-screen lanes (e.g. the base
 * track at the bottom, or a new overlay lane) become reachable as a drop target.
 * Premiere/CapCut do this; without it a drop target below the fold can't be hit.
 */
'use client';

const EDGE_PX = 40; // distance from an edge that triggers scrolling
const STEP_PX = 14; // scroll amount per pointer move

/** Scroll the timeline lane area if `clientY` is within {@link EDGE_PX} of an edge. */
export function autoScrollTimelineEdge(clientY: number): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector<HTMLElement>('[data-vixel-timeline]');
  if (!el || el.scrollHeight <= el.clientHeight) return;
  const r = el.getBoundingClientRect();
  if (clientY < r.top + EDGE_PX) el.scrollTop = Math.max(0, el.scrollTop - STEP_PX);
  else if (clientY > r.bottom - EDGE_PX) el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + STEP_PX);
}
