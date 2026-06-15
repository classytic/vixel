/**
 * Primitive descriptors — the machine-readable contract.
 * ======================================================
 * Modeled on OpenFX/frei0r (typed params + input arity), minus the negotiation
 * overkill an ffmpeg backend can't use (RoD/RoI/clip-preference). A descriptor
 * lets an agent or an editor UI *enumerate* a primitive and its parameters and
 * drive vixel without hardcoding — the "contract as data" principle.
 *
 * See DESIGN.md, "Primitive descriptors + input arity".
 */

export type ParamType = 'number' | 'boolean' | 'color' | 'position' | 'choice' | 'string';

export interface VixelParam {
  name: string;
  type: ParamType;
  default: unknown;
  /** Hard clamp (value range). */
  min?: number;
  max?: number;
  /** UI slider range — independent of the clamp (OFX displayMin/Max). */
  displayMin?: number;
  displayMax?: number;
  /** Semantic hint for hosts/UI (OFX doubleType; `spatial` = 0–1 maps to frame size). */
  semantic?: 'plain' | 'angle' | 'scale' | 'time' | 'spatial';
  /**
   * Unit of the value, so an agent can reason about magnitude and a UI can label
   * the control. (Shotcut's `units` field — confirmed load-bearing by two NLEs.)
   */
  unit?: 'px' | 'deg' | 's' | 'ms' | 'hz' | 'db' | 'fraction' | 'percent';
  /** Granularity — the increment a slider steps by / an agent should reason in. */
  step?: number;
  /** Whether this attribute can be keyframed (only set where ffmpeg can honor it). */
  animatable?: boolean;
  /** Allowed values for `type: 'choice'`. */
  options?: readonly string[];
  description?: string;
}

// Deliberately NOT modeled (Shotcut/Natron have them; they are GUI-host concerns,
// not agentic-engine contract): decimal precision, secret/enabled visibility,
// parent/group nesting, ganged properties, viewer-overlay labels. Two independent
// studies confirmed vixel's data-first descriptor is cleaner than burying these in
// a GUI layer — so the engine publishes intent, the host owns presentation.

/**
 * Input topology — frei0r's arity taxonomy, the cleanest model of effect shape.
 * `mixer2` is exactly the masks / chroma-key / blend family.
 */
export type PrimitiveArity =
  | 'source' // 0 inputs → 1 output  (generators: color, text, testsrc)
  | 'filter' // 1 input  → 1 output  (blur, glow, mask-by-shape)
  | 'mixer2' // 2 inputs → 1 output  (blend, chroma-key over bg, alpha matte)
  | 'mixer3'; // 3 inputs → 1 output (3-way composite)

export interface PrimitiveInput {
  name: string;
  optional?: boolean;
  /** Hint: this input is an alpha/luma matte (OFX isMask) — UI may offer roto sources. */
  isMask?: boolean;
}

export interface VixelPrimitiveDescriptor {
  /** Stable identifier, e.g. `vixel.compositing.chromaKey`. */
  id: string;
  name: string;
  arity: PrimitiveArity;
  params: readonly VixelParam[];
  inputs?: readonly PrimitiveInput[];
  description?: string;
}

/** Clamp a number to a param's [min, max] (no-op if unset). Pure helper for builders. */
export function clampParam(p: VixelParam, value: number): number {
  let v = value;
  if (typeof p.min === 'number') v = Math.max(p.min, v);
  if (typeof p.max === 'number') v = Math.min(p.max, v);
  return v;
}
