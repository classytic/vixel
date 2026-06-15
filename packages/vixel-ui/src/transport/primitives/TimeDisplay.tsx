/**
 * `<TimeDisplay>` — current playhead / total duration as NLE timecode
 * (`MM:SS:FF`). Headless: pass a children-as-function for custom markup.
 */
'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useShallowEditorState } from '../../editor/controller/hooks/useEditorStore.js';
import { formatTimecode, resolveFps } from '../../shared/utils/time.js';

export interface TimeDisplayState {
  playheadSec: number;
  durationSec: number;
  fps: number;
  /** `current / total` pre-formatted timecode. */
  text: string;
}

export interface TimeDisplayProps extends Omit<ComponentProps<'span'>, 'children'> {
  children?: ReactNode | ((state: TimeDisplayState) => ReactNode);
}

export function TimeDisplay({ children, ...props }: TimeDisplayProps) {
  const { playheadSec, durationSec, fps } = useShallowEditorState((s) => ({
    playheadSec: s.playheadSec,
    durationSec: s.durationSec,
    fps: resolveFps(s.spec.output.fps),
  }));

  const text = `${formatTimecode(playheadSec, fps)} / ${formatTimecode(durationSec, fps)}`;
  const state: TimeDisplayState = { playheadSec, durationSec, fps, text };
  const content = typeof children === 'function' ? children(state) : (children ?? text);

  return (
    <span {...props} data-vixel-time="">
      {content}
    </span>
  );
}
