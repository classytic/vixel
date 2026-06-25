/**
 * @classytic/vixel-agent — the host-mountable agent tool surface over a VixelSpec.
 * ============================================================================
 * Framework-free. A host implements ONE seam ({@link AgentContext}) and gets a set of
 * editing + perception tools an LLM drives — exposed as an AI-SDK ToolSet (in-process
 * arc-ai) and/or arc MCP bridges (external Claude/Cursor) from the SAME definitions.
 *
 * @example
 * ```ts
 * import { toAiSdkTools, vixelAgentInstructions } from '@classytic/vixel-agent';
 * const agent = await createAgent({ model, instructions: vixelAgentInstructions, tools: toAiSdkTools(ctx) });
 * ```
 */
export * from './context.js';
export * from './tool-spec.js';
export * from './tools.js';
export * from './serialize.js';
export * from './adapters.js';
export * from './instructions.js';
