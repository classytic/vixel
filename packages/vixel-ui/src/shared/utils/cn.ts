/**
 * Class-name utility — clsx + tailwind-merge (the shadcn `cn`). Lets primitives
 * and consumers merge conditional + Tailwind classes with last-wins resolution.
 * `clsx` and `tailwind-merge` are optional deps (installed by default).
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type { ClassValue };

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
