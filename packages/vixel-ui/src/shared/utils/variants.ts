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

/* Themeable via the STANDARD shadcn token set — the consumer defines the values
 * (`--card`, `--primary`, `--chart-*`, `--ring`, …) in their own `@theme`, so this
 * reference skin inherits each app's palette instead of a hardcoded zinc/indigo. */

/** The timeline scroll area / track stack. */
export const timelineVariants = cva(
  'vixel-timeline relative w-full overflow-x-auto bg-card select-none',
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
export const trackVariants = cva('vixel-track relative w-full [contain:layout_style_paint]', {
  variants: {
    kind: {
      visual: 'h-14 bg-muted/40',
      audio: 'h-10 bg-muted/30',
    },
  },
  defaultVariants: { kind: 'visual' },
});
export type TrackVariants = VariantProps<typeof trackVariants>;

/** A clip / audio block on the timeline. Type color via chart tokens. */
export const clipVariants = cva(
  'vixel-clip absolute inset-y-1 box-border rounded-md border border-transparent px-2 py-1 text-xs text-white overflow-hidden cursor-grab transition-shadow data-[selected=true]:ring-2 data-[selected=true]:ring-ring data-[selected=true]:z-10',
  {
    variants: {
      kind: {
        clip: 'bg-chart-1 hover:brightness-110',
        audio: 'bg-chart-3 hover:brightness-110',
      },
    },
    defaultVariants: { kind: 'clip' },
  },
);
export type ClipVariants = VariantProps<typeof clipVariants>;

/** The draggable playhead marker. */
export const playheadVariants = cva(
  'vixel-playhead absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-primary z-20 cursor-ew-resize data-[dragging=true]:opacity-80',
  {
    variants: {
      head: {
        none: '',
        diamond:
          "before:content-[''] before:absolute before:-top-1 before:left-1/2 before:-translate-x-1/2 before:h-2 before:w-2 before:rotate-45 before:bg-primary",
      },
    },
    defaultVariants: { head: 'diamond' },
  },
);
export type PlayheadVariants = VariantProps<typeof playheadVariants>;

/** The time ruler strip. */
export const rulerVariants = cva(
  'vixel-ruler relative h-6 border-b border-border text-[10px] text-muted-foreground',
);
export type RulerVariants = VariantProps<typeof rulerVariants>;

/** Transport buttons (play / pause / export). */
export const transportButtonVariants = cva(
  'vixel-btn inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'text-foreground/90 hover:text-foreground hover:bg-accent rounded-md',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 rounded-md',
        ghost: 'text-muted-foreground hover:text-foreground',
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
