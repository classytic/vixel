/**
 * `<ExportButton>` — asks the host to export the current spec (fires the
 * `onExport` passed to {@link VixelEditor}, which calls vixel's `compose`).
 */
'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEditorActions } from '../../editor/controller/hooks/useEditorStore.js';

export interface ExportButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode;
}

export function ExportButton({ children, onClick, ...props }: ExportButtonProps) {
  const actions = useEditorActions();
  return (
    <button
      {...props}
      type="button"
      data-vixel-export=""
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) actions.requestExport();
      }}
    >
      {children ?? 'Export'}
    </button>
  );
}
