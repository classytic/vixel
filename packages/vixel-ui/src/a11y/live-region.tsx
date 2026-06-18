/**
 * Live-region announcer — the editor's screen-reader voice.
 * ==========================================================
 * One polite `aria-live` region per editor + a `useAnnounce()` hook. Behavior
 * primitives (timeline item actions, drag commits) call `announce()` so a
 * non-sighted user hears the result of an action ("Deleted", "Moved to 1.2s") —
 * the accessibility layer pragmatic-drag-and-drop's `live-region` package provides,
 * adapted to our React-19 context model. Headless: the region is visually hidden
 * via inline style (no CSS dependency), so any host inherits it for free.
 *
 * Safe to call without a provider (returns a no-op) — keeps tests/headless render
 * paths from needing the provider.
 */
'use client';

import { createContext, use, useCallback, useState, type CSSProperties, type ReactNode } from 'react';

type Announce = (message: string) => void;

const LiveRegionContext = createContext<Announce | null>(null);

// Standard visually-hidden (sr-only) style — present for assistive tech, invisible + zero-footprint on screen.
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  // Clear then set on the next frame so re-announcing the SAME text still fires
  // (assistive tech ignores an unchanged live region).
  const announce = useCallback<Announce>((msg) => {
    setMessage('');
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setMessage(msg));
    else setMessage(msg);
  }, []);

  return (
    <LiveRegionContext.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
        {message}
      </div>
    </LiveRegionContext.Provider>
  );
}

const noop: Announce = () => {};

/** Announce a message politely to assistive tech. No-op outside a {@link LiveRegionProvider}. */
export function useAnnounce(): Announce {
  return use(LiveRegionContext) ?? noop;
}
