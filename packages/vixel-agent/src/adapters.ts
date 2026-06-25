/**
 * Transport adapters — bind the {@link vixelToolSpecs} to the two surfaces the
 * classytic stack already trades in, with NO `ai` / `@classytic/arc` import (the shapes
 * are structural, so this package stays dependency-light):
 *   • {@link toAiSdkTools} → an AI-SDK `ToolSet` for an in-process arc-ai agent
 *     (`createAgent({ tools })`).
 *   • {@link toMcpBridges} → arc `McpBridge[]` for external Claude/Cursor over MCP
 *     (`mcpPlugin({ extraTools: buildMcpToolsFromBridges(...) })`).
 * Same specs, both transports.
 */
import type { ZodType } from 'zod';
import type { AgentContext } from './context.js';
import type { VixelToolSpec } from './tool-spec.js';
import { vixelToolSpecs } from './tools.js';

/** Structural AI-SDK tool (matches what `ai`'s `tool()` returns; no import needed). */
export interface AiSdkTool {
  description: string;
  inputSchema: ZodType;
  execute: (args: unknown) => Promise<unknown>;
}

/** Bind the specs to a host context → an AI-SDK ToolSet (pass as arc-ai `tools`). */
export function toAiSdkTools(
  ctx: AgentContext,
  specs: VixelToolSpec[] = vixelToolSpecs,
): Record<string, AiSdkTool> {
  const out: Record<string, AiSdkTool> = {};
  for (const s of specs) {
    out[s.name] = { description: s.description, inputSchema: s.inputSchema, execute: (args) => s.execute(args, ctx) };
  }
  return out;
}

/** Structural arc `McpBridge` (matches `@classytic/arc/mcp`; no import needed). */
export interface McpBridge {
  name: string;
  description: string;
  /** Flat zod shape arc's `defineTool`/`createMcpServer` expects. */
  inputSchema: Record<string, ZodType>;
  /** Build a fresh tool per MCP request from its auth/session context. */
  buildTool: (mcpCtx: unknown) => AiSdkTool;
}

/**
 * Bridge the specs to arc MCP bridges. `buildCtx` makes a per-request
 * {@link AgentContext} from the MCP session (org / user / project scope), so each call
 * is correctly tenant-scoped. Pass the result to arc's `buildMcpToolsFromBridges`.
 */
export function toMcpBridges(
  buildCtx: (mcpCtx: unknown) => AgentContext,
  specs: VixelToolSpec[] = vixelToolSpecs,
): McpBridge[] {
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    inputSchema: zodShape(s.inputSchema),
    buildTool: (mcpCtx) => {
      const ctx = buildCtx(mcpCtx);
      return { description: s.description, inputSchema: s.inputSchema, execute: (args) => s.execute(args, ctx) };
    },
  }));
}

/** Extract a ZodObject's flat field shape (arc wants flat, not a wrapped object). */
function zodShape(schema: ZodType): Record<string, ZodType> {
  const shape = (schema as { shape?: unknown }).shape;
  return shape && typeof shape === 'object' ? (shape as Record<string, ZodType>) : {};
}
