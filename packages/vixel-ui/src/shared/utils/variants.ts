/**
 * CVA variant definitions — the Tailwind styling layer for vixel-ui.
 * =======================================================
 * The same pattern as `@classytic/react-media`'s `variants.ts`: centralized,
 * typed `cva` variant sets so consumers (or our styled wrappers) get a polished
 * default look while the underlying primitives stay headless. Pair with `cn`.
 *
 * @example
 * ```tsx
 * import { clipVariants, cn } from '@classytic/vixel-ui/shared';
 * <TimelineClip item={item} className={cn(clipVariants({ kind: item.selectionKind }))} />
 * ```
 */
import { cva, type VariantProps } from 'class-variance-authority';

/** The timeline scroll area / track stack. */
export const timelineVariants = cva(
  'vixel-timeline relative w-full overflow-x-auto bg-zinc-950 select-none',
  {
    variants: {
      density: {
        compact: 'gap-px',
        comfortable: 'gap-1',
      },
    },
    defaultVariants: { density: 'comfortable' },
  },
);
export type TimelineVariants = VariantProps<typeof timelineVariants>;

/** A single track row, themed by media kind. `[contain]` isolates clip-drag
 *  reflow to the row (per modern-web-guidance: interactions in complex layouts). */
export const trackVariants = cva('vixel-track relative w-full [contain:layout_paint]', {
  variants: {
    kind: {
      video: 'h-14 bg-zinc-900/60',
      overlay: 'h-10 bg-zinc-900/40',
      audio: 'h-10 bg-zinc-900/40',
    },
  },
  defaultVariants: { kind: 'video' },
});
export type TrackVariants = VariantProps<typeof trackVariants>;

/** A clip / overlay / audio block on the timeline. */
export const clipVariants = cva(
  'vixel-clip absolute inset-y-1 box-border rounded-md border px-2 py-1 text-xs text-white/90 overflow-hidden cursor-grab transition-shadow data-[selected=true]:ring-2 data-[selected=true]:ring-white data-[selected=true]:z-10',
  {
    variants: {
      kind: {
        clip: 'bg-indigo-600 border-indigo-400/40 hover:bg-indigo-500',
        overlay: 'bg-amber-600 border-amber-400/40 hover:bg-amber-500',
        audio: 'bg-emerald-700 border-emerald-400/40 hover:bg-emerald-600',
      },
    },
    defaultVariants: { kind: 'clip' },
  },
);
export type ClipVariants = VariantProps<typeof clipVariants>;

/** The draggable playhead marker. */
export const playheadVariants = cva(
  'vixel-playhead absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-red-500 z-20 cursor-ew-resize data-[dragging=true]:bg-red-400',
  {
    variants: {
      head: {
        none: '',
        diamond:
          "before:content-[''] before:absolute before:-top-1 before:left-1/2 before:-translate-x-1/2 before:h-2 before:w-2 before:rotate-45 before:bg-red-500",
      },
    },
    defaultVariants: { head: 'diamond' },
  },
);
export type PlayheadVariants = VariantProps<typeof playheadVariants>;

/** The time ruler strip. */
export const rulerVariants = cva(
  'vixel-ruler relative h-6 border-b border-white/10 text-[10px] text-white/50',
);
export type RulerVariants = VariantProps<typeof rulerVariants>;

/** Transport buttons (play / pause / export). */
export const transportButtonVariants = cva(
  'vixel-btn inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'text-white/90 hover:text-white hover:bg-white/10 rounded-md',
        primary: 'bg-indigo-500 text-white hover:bg-indigo-600 rounded-md',
        ghost: 'text-white/70 hover:text-white',
      },
      size: {
        sm: 'h-7 px-2 text-xs [&_svg]:size-4',
        md: 'h-9 px-3 text-sm [&_svg]:size-5',
        lg: 'h-11 px-4 text-base [&_svg]:size-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);
export type TransportButtonVariants = VariantProps<typeof transportButtonVariants>;
