/**
 * ISF (Interactive Shader Format) → vixel effect adapter.
 * ========================================================
 * Converts an ISF shader (a `/*{ …json… }*\/` header + GLSL) into a vixel `shader`
 * {@link EffectDescriptor} so the large MIT-licensed ISF / Vidvox libraries become
 * BYO packs that render through the same Pixi (+ libplacebo) path as native effects.
 * Pure string/JSON transforms — zero deps, opt-in subpath (like `/validate`).
 *
 * SCOPE (v1): single-pass ISF effects. INPUTS map as:
 *   - `float`           → a vixel `number` param, bound LIVE (`{{name}}` token).
 *   - `image`           → a vixel `texture` param (sampled via `texture(name, uv)`).
 *   - `bool`/`long`/`color`/`point2D` → baked as a typed GLSL `#define` (so the ISF
 *     body's bare uniform names resolve at the right type); also surfaced as a
 *     `bind:'literal'` param for display (live editing of these = a follow-up that
 *     needs vixel int/bool/vec2/vec4 uniform binding).
 * NOT yet: multi-pass `PASSES` (vixel has `passes[]`, but ISF target-buffer graphs
 * need a mapping pass), persistent/feedback buffers, WebGPU. `convertIsf` throws a
 * clear error on multi-pass so a caller can skip it rather than mis-render.
 */
import type { EffectDescriptor, EffectParam } from './effects/contract.js';
import { glFloat } from './shader-wrap.js';

/** One entry of an ISF `INPUTS` array (the fields we read). */
export interface IsfInput {
  NAME: string;
  TYPE: 'float' | 'bool' | 'long' | 'color' | 'point2D' | 'image' | 'event' | 'audio' | 'audioFFT' | string;
  DEFAULT?: number | boolean | number[];
  MIN?: number;
  MAX?: number;
  LABEL?: string;
  VALUES?: number[];
  LABELS?: string[];
}

/** The parsed ISF JSON header (the fields we read). */
export interface IsfMeta {
  ISFVSN?: string;
  DESCRIPTION?: string;
  CREDIT?: string;
  CATEGORIES?: string[];
  INPUTS?: IsfInput[];
  PASSES?: unknown[];
}

export interface IsfConvertOptions {
  /** The effect id (must be unique in the catalog). */
  id: string;
  name?: string;
  surface?: 'filter' | 'effect';
  category?: string;
  /** Override input default values by NAME (else the ISF `DEFAULT` is used). */
  values?: Record<string, number | boolean | number[]>;
}

/** Split an ISF source into its JSON header + the GLSL body. */
export function parseIsf(src: string): { meta: IsfMeta; glsl: string } {
  const m = src.match(/\/\*([\s\S]*?)\*\//);
  if (!m) throw new Error('ISF: no `/*{ … }*/` metadata header found.');
  const inner = m[1];
  const start = inner.indexOf('{');
  const end = inner.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('ISF: metadata header is not a JSON object.');
  let meta: IsfMeta;
  try {
    meta = JSON.parse(inner.slice(start, end + 1)) as IsfMeta;
  } catch (e) {
    throw new Error(`ISF: metadata JSON failed to parse — ${(e as Error).message}`);
  }
  return { meta, glsl: src.slice((m.index ?? 0) + m[0].length) };
}

const RX = (name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

function rgbaArrToHex(c: number[]): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/**
 * Convert an ISF shader source into a vixel `shader` {@link EffectDescriptor}.
 * Throws on multi-pass ISF (declares `PASSES` with >1 entry) — not yet supported.
 */
export function convertIsf(src: string, opts: IsfConvertOptions): EffectDescriptor {
  const { meta, glsl: rawGlsl } = parseIsf(src);
  if (Array.isArray(meta.PASSES) && meta.PASSES.length > 1) {
    throw new Error(`ISF "${opts.id}": multi-pass shaders (PASSES) are not supported yet.`);
  }

  const params: EffectParam[] = [];
  const defines: string[] = [];
  const floatNames: string[] = [];

  for (const inp of meta.INPUTS ?? []) {
    const name = inp.NAME;
    if (!name) continue;
    const val = opts.values?.[name] ?? inp.DEFAULT;
    switch (inp.TYPE) {
      case 'float':
        floatNames.push(name);
        params.push({
          name, type: 'number', label: inp.LABEL ?? name,
          ...(typeof val === 'number' ? { default: val } : {}),
          ...(typeof inp.MIN === 'number' ? { min: inp.MIN } : {}),
          ...(typeof inp.MAX === 'number' ? { max: inp.MAX } : {}),
        });
        break;
      case 'bool':
        defines.push(`#define ${name} ${val ? 'true' : 'false'}`);
        params.push({ name, type: 'boolean', label: inp.LABEL ?? name, default: !!val, bind: 'literal' });
        break;
      case 'long': {
        const n = typeof val === 'number' ? Math.round(val) : 0;
        defines.push(`#define ${name} ${n}`);
        if (inp.LABELS?.length) {
          params.push({ name, type: 'enum', label: inp.LABEL ?? name, options: inp.LABELS, default: inp.LABELS[(inp.VALUES ?? []).indexOf(n)] ?? inp.LABELS[0], bind: 'literal' });
        } else {
          params.push({ name, type: 'number', label: inp.LABEL ?? name, default: n, bind: 'literal' });
        }
        break;
      }
      case 'color': {
        const c = Array.isArray(val) ? val : [1, 1, 1, 1];
        defines.push(`#define ${name} vec4(${glFloat(c[0] ?? 0)}, ${glFloat(c[1] ?? 0)}, ${glFloat(c[2] ?? 0)}, ${glFloat(c[3] ?? 1)})`);
        params.push({ name, type: 'color', label: inp.LABEL ?? name, default: rgbaArrToHex(c), bind: 'literal' });
        break;
      }
      case 'point2D': {
        const p = Array.isArray(val) ? val : [0, 0];
        defines.push(`#define ${name} vec2(${glFloat(p[0] ?? 0)}, ${glFloat(p[1] ?? 0)})`);
        break;
      }
      case 'image':
        params.push({ name, type: 'texture', label: inp.LABEL ?? name });
        break;
      default:
        /* event / audio / unknown → ignored (no GLSL binding) */
        break;
    }
  }

  // Strip ISF/driver lines vixel re-provides (version, precision) + rename the entry
  // point so we can wrap it into the canonical `vixelEffect`.
  let body = rawGlsl
    .replace(/^\s*#version[^\n]*\n/gm, '')
    .replace(/^\s*precision\s+\w+\s+float\s*;\s*$/gm, '')
    .replace(/\bvoid\s+main\s*\(/, 'void isf_main(');

  // Live float inputs → vixel `{{token}}`s (so they bind as live uniforms).
  for (const name of floatNames) body = body.replace(RX(name), `{{${name}}}`);

  const usesTime = /\bTIME\b/.test(body);
  const usesRenderSize = /\bRENDERSIZE\b/.test(body) || /\bIMG_PIXEL\b/.test(body) || /\bIMG_SIZE\b/.test(body);

  const preamble = [
    'vec2 vixel_uv;',
    'vec4 isf_out_color;',
    ...(usesRenderSize ? ['uniform vec4 uInputSize;', '#define RENDERSIZE (uInputSize.xy)'] : []),
    '#define gl_FragColor isf_out_color',
    '#define isf_FragNormCoord vixel_uv',
    '#define inputImage uTexture',
    '#define IMG_THIS_PIXEL(i) vixelSample(vixel_uv)',
    '#define IMG_THIS_NORM_PIXEL(i) vixelSample(vixel_uv)',
    '#define IMG_NORM_PIXEL(i, c) texture(i, c)',
    '#define IMG_PIXEL(i, c) texture(i, (c) / RENDERSIZE)',
    '#define IMG_SIZE(i) RENDERSIZE',
    ...(usesTime ? ['#define TIME uTime'] : []),
    ...defines,
  ].join('\n');

  const source = `${preamble}\n${body}\nvec4 vixelEffect(vec2 uv){ vixel_uv = uv; isf_main(); return isf_out_color; }`;

  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    kind: 'shader',
    surface: opts.surface ?? 'effect',
    ...(opts.category ?? meta.CATEGORIES?.[0] ? { category: opts.category ?? meta.CATEGORIES![0] } : {}),
    ...(meta.DESCRIPTION ? { description: meta.DESCRIPTION } : {}),
    ...(params.length ? { params } : {}),
    // ISF runs in Pixi (preview + in-browser export); the ffmpeg engine has no ISF path.
    unsupported: ['ffmpeg'],
    source,
  };
}
