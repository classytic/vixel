/**
 * `<PlayButton>` — toggles preview playback. Headless: pass children (or a
 * children-as-function receiving `{ isPlaying }`) to control the label/icon.
 *
 * @example
 * ```tsx
 * <PlayButton>{({ isPlaying }) => (isPlaying ? <PauseIcon /> : <PlayIcon />)}</PlayButton>
 * ```
 */
'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEditorState, useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';

export interface PlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode | ((state: { isPlaying: boolean }) => ReactNode);
}

export function PlayButton({ children, onClick, ...props }: PlayButtonProps) {
  const isPlaying = useEditorState((s) => s.isPlaying);
  const actions = useEditorActions();

  const content = typeof children === 'function' ? children({ isPlaying }) : children;

  return (
    <button
      {...props}
      type="button"
      aria-label={isPlaying ? 'Pause' : 'Play'}
      aria-pressed={isPlaying}
      data-vixel-play=""
      data-state={isPlaying ? 'playing' : 'paused'}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) actions.togglePlay();
      }}
    >
      {content ?? (isPlaying ? '❚❚' : '▶')}
    </button>
  );
}
