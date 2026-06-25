/**
 * The canonical tool shape. A {@link VixelToolSpec} is transport-agnostic: a name, an
 * agent-facing description, a zod input schema, and a pure-ish executor that runs
 * against the injected {@link AgentContext}. The adapters in `./adapters` bind these to
 * an AI-SDK ToolSet (arc-ai, in-process) and to arc MCP bridges (external) — one
 * definition, both transports.
 */
import type { ZodType } from 'zod';
import type { AgentContext } from './context.js';

export interface VixelToolSpec {
  /** snake_case tool name the model calls. */
  name: string;
  /** What it does + when to use it + units (seconds) — the model reads this. */
  description: string;
  /** Zod schema for the model's arguments (validated at the transport boundary). */
  inputSchema: ZodType;
  /** Run the tool against the host context. Returns JSON-able data for the model. */
  execute: (args: any, ctx: AgentContext) => Promise<unknown>;
}
