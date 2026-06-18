/**
 * @classytic/vixel-schema/validate — runtime validation of a {@link VixelSpec}.
 * ===========================================================================
 * The schema CORE stays zero-dependency (pure TypeScript types). Validation is an
 * OPT-IN subpath that pulls in zod (v4) only when imported, so consumers who just
 * author/transport specs never carry the dependency. Import it at trust boundaries
 * — an agent's emitted JSON, an API ingest, a pasted/imported project — to turn the
 * "rendered but silently wrong" failure mode (a bad effect id that the engine just
 * skips) into an explicit, actionable error BEFORE rendering.
 *
 * Two layers:
 *  1. STRUCTURAL — shape/types/enums/ranges of the contract (zod). Unknown keys are
 *     stripped, not rejected, so a spec authored against a NEWER schema still
 *     validates against an older validator (forward-compatible).
 *  2. SEMANTIC — every {@link EffectRef}/{@link TransitionRef} `id` must resolve in
 *     the live registries, and its params are range/type-checked against the
 *     descriptor metadata. This reuses the descriptors (no duplicated vocab) and is
 *     why a registered BYO pack's effects validate for free.
 *
 * @example
 * ```ts
 * import { parseSpec, safeParseSpec } from '@classytic/vixel-schema/validate';
 * const spec = parseSpec(json);                 // throws ZodError on bad input
 * const r = safeParseSpec(json);                // { success, data? , error? }
 * ```
 */
import { z } from 'zod';
import type { VixelSpec } from './spec.js';
import { getEffect, getTransition } from './pack.js';
import type { EffectParam } from './effects/contract.js';

// ── primitives ────────────────────────────────────────────────────────────────
const zHexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected a #RGB / #RRGGBB / #RRGGBBAA color');
const zFps = z.union([
  z.number().positive('fps must be > 0'),
  z.object({ num: z.number().positive(), den: z.number().positive() }),
]);
/** A ref's params bag — open by type; values are range/type-checked semantically below. */
const zParams = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));

const zEffectRef = z.object({ id: z.string().min(1), params: zParams.optional() });
const zTransitionRef = z.object({
  id: z.string().min(1),
  duration: z.number().nonnegative().optional(),
  easing: z.string().optional(),
  shake: z.number().optional(),
  params: zParams.optional(),
});

// ── media (discriminated by `kind`) ─────────────────────────────────────────────
const zSourceRef = z.union([
  z.string(),
  z.object({ kind: z.literal('external'), url: z.string() }),
  z.object({ kind: z.literal('generator'), generator: z.enum(['color', 'testsrc', 'smptebars']), params: z.object({ color: zHexColor.optional() }).optional() }),
  z.object({ kind: z.literal('missing'), hint: z.string().optional() }),
]);
const zBlend = z.enum(['normal', 'screen', 'multiply', 'overlay', 'darken', 'lighten']).optional();
const zMedia = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video'), source: zSourceRef, trimStart: z.number().nonnegative().optional(), blend: zBlend }),
  z.object({ kind: z.literal('image'), source: zSourceRef, blend: zBlend }),
  z.object({ kind: z.literal('text'), text: z.string() }).loose(),
  z.object({ kind: z.literal('shape') }).loose(),
  z.object({ kind: z.literal('effect'), effect: zEffectRef }),
]);

// ── clip / tracks ───────────────────────────────────────────────────────────────
// `.loose()` keeps optional sub-objects (transform/mask/enter/loop/animation…)
// forward-compatible — they're validated by the renderer, and over-strict mirroring
// here would just rot. The fields that cause SILENT, hard-to-debug failures (media
// kind, timing, effect/transition ids) ARE strict.
const zClip = z
  .object({
    id: z.string().optional(),
    media: zMedia,
    at: z.number().nonnegative('clip.at must be ≥ 0'),
    duration: z.number().positive('clip.duration must be > 0'),
    effects: z.array(zEffectRef).optional(),
    volume: z.number().min(0).max(1).optional(),
    hidden: z.boolean().optional(),
    muted: z.boolean().optional(),
  })
  .loose();

const zSequenceTransition = z.object({
  between: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  transition: zTransitionRef,
});

const zAudioItem = z
  .object({
    source: zSourceRef,
    at: z.number().nonnegative().optional(),
    in: z.number().nonnegative().optional(),
    out: z.number().nonnegative().optional(),
    gain: z.number().optional(),
  })
  .loose();

const zTrack = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visual'), clips: z.array(zClip), transitions: z.array(zSequenceTransition).optional(), sequential: z.boolean().optional() }),
  z.object({ type: z.literal('audio'), items: z.array(zAudioItem) }),
]);

/** The structural schema (no registry checks yet — those run in {@link refineSpec}). */
export const zVixelSpec = z.object({
  version: z.literal(1),
  output: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: zFps,
    background: zHexColor.optional(),
  }),
  tracks: z.array(zTrack),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── semantic (registry-derived) checks ──────────────────────────────────────────
function checkParam(p: EffectParam, value: unknown, path: (string | number)[], ctx: z.RefinementCtx): void {
  if (p.type === 'number') {
    if (typeof value !== 'number') { ctx.addIssue({ code: 'custom', message: `param "${p.name}" must be a number`, path }); return; }
    if (p.min != null && value < p.min) ctx.addIssue({ code: 'custom', message: `param "${p.name}" = ${value} is below min ${p.min}`, path });
    if (p.max != null && value > p.max) ctx.addIssue({ code: 'custom', message: `param "${p.name}" = ${value} is above max ${p.max}`, path });
  } else if (p.type === 'boolean' && typeof value !== 'boolean') {
    ctx.addIssue({ code: 'custom', message: `param "${p.name}" must be a boolean`, path });
  } else if ((p.type === 'color' || p.type === 'enum') && typeof value !== 'string') {
    ctx.addIssue({ code: 'custom', message: `param "${p.name}" must be a string`, path });
  }
}

/** Validate a resolved ref against its descriptor: id must exist; known params are
 *  range/type-checked. Unknown param keys are IGNORED (forward-compatible packs). */
function checkRef(
  kind: 'effect' | 'transition',
  ref: { id: string; params?: Record<string, unknown> },
  path: (string | number)[],
  ctx: z.RefinementCtx,
): void {
  const descriptor = kind === 'effect' ? getEffect(ref.id) : getTransition(ref.id);
  if (!descriptor) {
    ctx.addIssue({ code: 'custom', message: `unknown ${kind} id "${ref.id}" (not in the registry — register its pack or fix the id)`, path: [...path, 'id'] });
    return;
  }
  const params = (descriptor.params ?? []) as EffectParam[];
  for (const [name, value] of Object.entries(ref.params ?? {})) {
    const meta = params.find((p) => p.name === name);
    if (meta) checkParam(meta, value, [...path, 'params', name], ctx);
  }
}

/** Full spec validator: structure + registry semantics. */
export const vixelSpecSchema = zVixelSpec.superRefine((spec, ctx) => {
  spec.tracks.forEach((track, ti) => {
    if (track.type !== 'visual') return;
    track.clips.forEach((clip, ci) => {
      if (clip.media.kind === 'effect') checkRef('effect', clip.media.effect, ['tracks', ti, 'clips', ci, 'media', 'effect'], ctx);
      clip.effects?.forEach((e, ei) => checkRef('effect', e, ['tracks', ti, 'clips', ci, 'effects', ei], ctx));
    });
    track.transitions?.forEach((t, si) => checkRef('transition', t.transition, ['tracks', ti, 'transitions', si, 'transition'], ctx));
  });
});

// ── public API ──────────────────────────────────────────────────────────────────
export type SpecValidationError = z.ZodError;

/** Parse + validate, returning a typed {@link VixelSpec}. Throws {@link z.ZodError}. */
export function parseSpec(input: unknown): VixelSpec {
  return vixelSpecSchema.parse(input) as VixelSpec;
}

/** Non-throwing parse. `success` narrows `data` to a {@link VixelSpec}. */
export function safeParseSpec(input: unknown):
  | { success: true; data: VixelSpec }
  | { success: false; error: z.ZodError } {
  const r = vixelSpecSchema.safeParse(input);
  return r.success ? { success: true, data: r.data as VixelSpec } : { success: false, error: r.error };
}

/** Human-friendly validation: `{ valid, errors[] }` with `path: message` lines —
 *  ideal for surfacing to an agent (retry-on-mismatch) or a UI toast. */
export function validateSpec(input: unknown): { valid: boolean; errors: string[] } {
  const r = vixelSpecSchema.safeParse(input);
  if (r.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
  };
}

/** Pretty multi-line error string (zod v4 `prettifyError`) for logs. */
export function formatSpecError(error: z.ZodError): string {
  return z.prettifyError(error);
}
