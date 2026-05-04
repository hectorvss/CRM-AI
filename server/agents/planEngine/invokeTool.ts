/**
 * server/agents/planEngine/invokeTool.ts
 *
 * Unified single-tool dispatcher. Any surface (super agent, copilot,
 * workflow runtime, pipeline executor, scheduled action runner, frontend
 * via /api/tools/invoke) can call `invokeTool()` to execute one tool by
 * name with the same validation, permission check, dry-run, audit and
 * timeout guarantees as the planEngine executor.
 *
 * This is intentionally a thin wrapper around `toolRegistry.get(name).run()`
 * — it does NOT plan, retry, or compensate. For multi-step orchestration,
 * use `planEngine.execute()` instead.
 */

import { randomUUID } from 'crypto';
import { toolRegistry } from './registry.js';
import { isToolBlocked } from './safety.js';
import type { ToolExecutionContext, ToolResult, AuditEntry } from './types.js';
import { logger } from '../../utils/logger.js';

export interface InvokeToolInput {
  /** Fully qualified tool name (e.g. `linear.issue.create`). */
  toolName: string;
  /** Raw args (will be validated against the tool's schema). */
  args: unknown;
  /** Tenant scope. */
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  /** Permission checker bound to the request. */
  hasPermission: (perm: string) => boolean;
  /** When true, side-effectful tools should not actually mutate. */
  dryRun?: boolean;
  /** Optional correlation id for audit / tracing. */
  planId?: string;
  /** Optional audit sink — defaults to a logger.info. */
  audit?: (entry: AuditEntry) => Promise<void> | void;
  /** Hard timeout (ms). Default 15000. */
  timeoutMs?: number;
}

export type InvokeToolResult =
  | { ok: true; toolName: string; value: unknown; durationMs: number; dryRun: boolean }
  | { ok: false; toolName: string; error: string; errorCode: string; durationMs: number };

/**
 * Invoke a single tool by name. Returns a normalised result.
 *
 * Failure modes:
 *  - TOOL_NOT_FOUND      — toolName not in registry
 *  - TOOL_DEPRECATED     — caller invoked a deprecated tool name
 *  - TOOL_BLOCKED        — safety guard blocked it (incident kill-switch)
 *  - PERMISSION_DENIED   — caller lacks the required permission
 *  - INVALID_ARGS        — args failed schema validation
 *  - TIMEOUT             — runner exceeded `timeoutMs`
 *  - TOOL_ERROR          — runner threw or returned ok:false
 */
export async function invokeTool(input: InvokeToolInput): Promise<InvokeToolResult> {
  const start = Date.now();
  const audit = input.audit ?? (async (e: AuditEntry) => logger.info('tool.invoke.audit', e as any));
  const dryRun = input.dryRun === true;
  const timeoutMs = input.timeoutMs ?? 15_000;

  const tool = toolRegistry.get(input.toolName);
  if (!tool) {
    return { ok: false, toolName: input.toolName, error: `Tool not registered: ${input.toolName}`, errorCode: 'TOOL_NOT_FOUND', durationMs: Date.now() - start };
  }
  if (tool.deprecated) {
    return { ok: false, toolName: input.toolName, error: `Tool deprecated: ${input.toolName}`, errorCode: 'TOOL_DEPRECATED', durationMs: Date.now() - start };
  }
  if (isToolBlocked(input.toolName)) {
    return { ok: false, toolName: input.toolName, error: `Tool blocked by safety policy: ${input.toolName}`, errorCode: 'TOOL_BLOCKED', durationMs: Date.now() - start };
  }
  if (tool.requiredPermission && !input.hasPermission(tool.requiredPermission)) {
    return { ok: false, toolName: input.toolName, error: `Missing permission: ${tool.requiredPermission}`, errorCode: 'PERMISSION_DENIED', durationMs: Date.now() - start };
  }

  // Validate args against the tool's schema.
  const parsed = tool.args.parse(input.args ?? {});
  if (!parsed.ok) {
    const errMsg = (parsed as { ok: false; error: string; path?: string }).error;
    const errPath = (parsed as { ok: false; error: string; path?: string }).path;
    return { ok: false, toolName: input.toolName, error: `Invalid args: ${errMsg}${errPath ? ` (at ${errPath})` : ''}`, errorCode: 'INVALID_ARGS', durationMs: Date.now() - start };
  }

  // Block writes/externals on dry-run unless the tool opted in.
  if (dryRun && !tool.safeOnDryRun && (tool.sideEffect === 'write' || tool.sideEffect === 'external')) {
    return { ok: true, toolName: input.toolName, value: { simulated: true, reason: 'dry-run; side-effectful tool skipped' }, durationMs: Date.now() - start, dryRun: true };
  }

  const ctx: ToolExecutionContext = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    hasPermission: input.hasPermission,
    planId: input.planId ?? `invoke-${randomUUID()}`,
    audit,
    dryRun,
  };

  try {
    const res = await Promise.race<ToolResult>([
      tool.run({ args: parsed.value, context: ctx }),
      new Promise<ToolResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, error: `Tool ${input.toolName} timed out after ${timeoutMs}ms`, errorCode: 'TIMEOUT' }), timeoutMs),
      ),
    ]);

    await audit({
      action: 'tool.invoke',
      entityType: 'tool',
      entityId: input.toolName,
      metadata: { ok: res.ok, errorCode: res.errorCode, durationMs: Date.now() - start, dryRun },
    });

    if (res.ok) {
      return { ok: true, toolName: input.toolName, value: res.value, durationMs: Date.now() - start, dryRun };
    }
    return { ok: false, toolName: input.toolName, error: res.error ?? 'Tool returned ok=false', errorCode: res.errorCode ?? 'TOOL_ERROR', durationMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('invokeTool: tool threw', { tool: input.toolName, error: message });
    return { ok: false, toolName: input.toolName, error: message, errorCode: 'TOOL_ERROR', durationMs: Date.now() - start };
  }
}

/**
 * Convenience: list all tools available to a caller (delegates to registry).
 */
export function listAvailableTools(hasPermission: (p: string) => boolean) {
  return toolRegistry.listForCaller(hasPermission);
}
