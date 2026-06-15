/**
 * `<TimeRuler>` — evenly-spaced time ticks across the composition. Headless:
 * pass a render-function to fully control tick markup, or rely on the default
 * absolutely-positioned ticks (styled via `data-*`).
 */
'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useTimelineGeometry } from '../controller/hooks/useTimeline.js';
import { formatClock } from '../../shared/utils/time.js';

export interface RulerTick {
  sec: number;
  px: number;
  label: string;
}

export interface TimeRulerProps extends Omit<ComponentProps<'div'>, 'children'> {
  /** Target pixels between ticks (default 80). The step snaps to a 1/2/5×10ⁿ value. */
  tickSpacingPx?: number;
  children?: ReactNode | ((ticks: RulerTick[]) => ReactNode);
}

/** Snap a raw seconds-per-tick to a human 1 / 2 / 5 × 10ⁿ value. */
function niceStep(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const f = target / pow;
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nice * pow;
}

export function TimeRuler({ tickSpacingPx = 80, children, className, style, ...props }: TimeRulerProps) {
  const { pxPerSec, durationSec, secToPx } = useTimelineGeometry();

  const step = niceStep(tickSpacingPx / Math.max(pxPerSec, 0.0001));
  const ticks: RulerTick[] = [];
  for (let sec = 0; sec <= durationSec + 1e-6; sec += step) {
    ticks.push({ sec, px: secToPx(sec), label: formatClock(sec) });
  }

  if (typeof children === 'function') return <>{children(ticks)}</>;

  return (
    <div
      className={className}
      data-vixel-ruler=""
      style={{ position: 'relative', width: secToPx(durationSec), ...style }}
      {...props}
    >
      {children ??
        ticks.map((t) => (
          <span
            key={t.sec}
            data-vixel-tick=""
            style={{ position: 'absolute', left: t.px, transform: 'translateX(-50%)' }}
          >
            {t.label}
          </span>
        ))}
    </div>
  );
}
