/**
 * Shader adapter — run a community `shader`-kind effect server-side via ffmpeg's
 * libplacebo (Vulkan GPU; stock in full ffmpeg builds — no custom patch).
 * ========================================================================
 * A pack ships ONE canonical shader: `vec4 vixelEffect(vec2 uv)` that reads pixels
 * via `vixelSample(uv)`. The Pixi preview wraps it into a WebGL fragment
 * (vixel-ui scene.ts); here we wrap the SAME source into an mpv `.hook` for
 * libplacebo — one shader, identical on browser + server.
 *
 * The filter bracket uploads the frame to the GPU, runs the hook, and downloads:
 * `format=yuv420p,hwupload,libplacebo=custom_shader_path=…,hwdownload,format=yuv420p`.
 * The global `-init_hw_device vulkan` is added by the compose runner when any
 * shader effect is present.
 */

import { substituteParams } from '@classytic/vixel-schema';

/** Wrap a canonical vixel shader into an mpv `.hook` document for libplacebo. */
export function toLibplaceboHook(
  name: string,
  source: string,
  params?: Record<string, number | string | boolean>,
): string {
  const safe = name.replace(/[^\w-]/g, '') || 'effect';
  return [
    '//!HOOK MAIN',
    '//!BIND HOOKED',
    `//!DESC vixel-${safe}`,
    'vec4 vixelSample(vec2 uv) { return HOOKED_tex(uv); }',
    substituteParams(source, params),
    'vec4 hook() { return vixelEffect(HOOKED_pos); }',
    '',
  ].join('\n');
}

/** The libplacebo filter chain that runs a hook FILE (GPU upload→shader→download). */
export function libplaceboShaderFilter(hookPath: string): string {
  // Windows path in a filtergraph: forward slashes + double-escaped drive colon.
  const p = hookPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
  return `format=yuv420p,hwupload,libplacebo=custom_shader_path=${p},hwdownload,format=yuv420p`;
}

/** Global ffmpeg args to init the Vulkan device libplacebo needs. */
export const VULKAN_HW_ARGS = ['-init_hw_device', 'vulkan=vk:0', '-filter_hw_device', 'vk'];
