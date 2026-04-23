/**
 * server/agents/planEngine/executor.ts
 *
 * Executes a validated Plan. Responsibilities:
 *  - Validate every step's args against the registered ToolSpec (Zod-like).
 *  - Evaluate policy per step; abort plan on any `deny`.
 *  - When dryRun=false and policy says `require_approval`, route to the
 *    approval subsystem and return `pending_approval`.
 *  - Execute allowed steps in dependency order, propagating prior outputs
 *    into later steps via `{{refs}}` (simple string interpolation).
 *  - Emit an ExecutionTrace with one span per attempted step.
 *
 * The executor does NOT know about the LLM, HTTP, or the DB. It delegates
 * everything through the ToolExecutionContext injected by the caller.
 */

import { randomUUID } from 'node:crypto';
import type {
  Plan,
  PlanStep,
  ExecutionSpan,
  ExecutionStatus,
  ExecutionTrace,
  ToolExecutionContext,
  ToolResult,
  PolicyDecision,
  RiskLevel,
} from './types.js';
import { toolRegistry } from './registry.js';
import { evaluatePlan, aggregateDecision } from './policy.js';
import { logger } from '../../utils/logger.js';
import { classifyRiskFromArgs, isToolBlocked } from './safety.js';

export interface ExecutorDeps {
  /** Create an approval request when policy says `require_approval`. Returns approval id. */
  createApproval: (input: {
    plan: Plan;
    step: PlanStep;
    decision: PolicyDecision;
    context: ToolExecutionContext;
  }) => Promise<string>;
  /** Persist the execution trace for observability. */
  persistTrace?: (trace: ExecutionTrace) => Promise<void>;
}

export interface ExecuteOptions {
  /** When true, no side-effectful tool runs; executor skips writes and returns `skipped_dry_run` on write steps. */
  dryRun?: boolean;
  /** Force all approval-requiring steps to be skipped instead of creating approvals. Used in shadow/test runs. */
  skipApprovals?: boolean;
}

/** Topologically sort plan steps by dependsOn. Throws on cycles or unknown refs. */
function topoSort(steps: PlanStep[]): PlanStep[] {
  const idToStep = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: PlanStep[] = [];

  const visit = (step: PlanStep) => {
    if (visited.has(step.id)) return;
    if (visiting.has(step.id)) throw new Error(`Cycle detected involving step ${step.id}`);
    visiting.add(step.id);
    for (const depId of step.dependsOn) {
      const dep = idToStep.get(depId);
      if (!dep) throw new Error(`Step ${step.id} depends on unknown step ${depId}`);
      visit(dep);
    }
    visiting.delete(step.id);
    visited.add(step.id);
    sorted.push(step);
  };

  for (const step of steps) visit(step);
  return sorted;
}

/**
 * Replace `{{stepId.path.to.value}}` placeholders in args with values from
 * previously completed spans. Intentionally narrow — we don't ship a full
 * template language; this covers >90% of real cases.
 */
function interpolateArgs(args: unknown, completed: Map<string, ExecutionSpan>): unknown {
  if (args === null || args === undefined) return args;
  if (typeof args === 'string') {
    const match = /^\{\{([a-zA-Z0-9_.]+)\}\}$/.exec(args);
    if (!match) return args;
    const [stepId, ...path] = match[1].split('.');
    const span = completed.get(stepId);
    if (!span || !span.result.ok) return args;
    let cursor: any = span.result.value;
    for (const key of path) {
      if (cursor === null || cursor === undefined) return undefined;
      cursor = cursor[key];
    }
    return cursor;
  }
  if (Array.isArray(args)) return args.map((v) => interpolateArgs(v, completed));
  if (typeof args === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
      out[k] = interpolateArgs(v, completed);
    }
    return out;
  }
  return args;
}

async function runStepWithTimeout(
  step: PlanStep,
  args: unknown,
  ctx: ToolExecutionContext,
  timeoutMs: number,
  runner: (args: unknown) => Promise<ToolResult>,
): Promise<ToolResult> {
  return await Promise.race([
    runner(args),
    new Promise<ToolResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            ok: false,
            error: `Tool ${step.tool} timed out after ${timeoutMs}ms`,
            errorCode: 'TIMEOUT',
          }),
        timeoutMs,
      ),
    ),
  ]);
}

function elevateRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
  const left = order.indexOf(a);
  const right = order.indexOf(b);
  return right > left ? b : a;
}

export async function executePlan(
  plan: Plan,
  context: ToolExecutionContext,
  deps: ExecutorDeps,
  options: ExecuteOptions = {},
): Promise<ExecutionTrace> {
  const startedAt = new Date().toISOString();
  const spans: ExecutionSpan[] = [];
  const approvalIds: string[] = [];
  const completed = new Map<string, ExecutionSpan>();

  const trace: ExecutionTrace = {
    planId: plan.planId,
    sessionId: plan.sessionId,
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    startedAt,
    endedAt: startedAt,
    status: 'success',
    spans,
    summary: '',
  };

  // 1. Evaluate policy for the entire plan upfront (async — may read DB rules).
  const decisions = await evaluatePlan(plan, toolRegistry, {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    hasPermission: context.hasPermission,
  });
  trace.policyDecisions = decisions;
  const verdict = aggregateDecision(decisions);

  if (verdict === 'deny') {
    const denied = decisions.filter((d) => d.action === 'deny');
    trace.status = 'rejected_by_policy';
    trace.summary = `Policy denied ${denied.length} step(s): ${denied.map((d) => `${d.tool} (${d.reason})`).join('; ')}`;
    trace.endedAt = new Date().toISOString();
    if (deps.persistTrace) await deps.persistTrace(trace);
    return trace;
  }

  // 2. Sort steps topologically.
  let ordered: PlanStep[];
  try {
    ordered = topoSort(plan.steps);
  } catch (err) {
    trace.status = 'failed';
    trace.summary = err instanceof Error ? err.message : String(err);
    trace.endedAt = new Date().toISOString();
    if (deps.persistTrace) await deps.persistTrace(trace);
    return trace;
  }

  // 3. Execute step by step, respecting per-step decisions.
  let anyFailed = false;
  let anyPendingApproval = false;

  for (const step of ordered) {
    const decision = decisions.find((d) => d.stepId === step.id);
    if (!decision) {
      anyFailed = true;
      spans.push(makeSyntheticSpan(step, 'unknown', {
        ok: false,
        error: 'No policy decision produced for step',
        errorCode: 'POLICY_MISSING',
      }));
      break;
    }

    const tool = toolRegistry.get(step.tool);
    if (!tool) {
      anyFailed = true;
      spans.push(makeSyntheticSpan(step, decision.riskLevel, {
        ok: false,
        error: `Tool ${step.tool} not registered`,
        errorCode: 'TOOL_NOT_FOUND',
      }));
      break;
    }

    if (isToolBlocked(tool.name)) {
      anyFailed = true;
      spans.push(makeSyntheticSpan(step, decision.riskLevel, {
        ok: false,
        error: `Tool ${tool.name} is disabled by Super Agent kill-switch`,
        errorCode: 'TOOL_BLOCKED',
      }));
      break;
    }

    // Step-level approval gate
    if (decision.action === 'require_approval') {
      if (options.skipApprovals) {
        spans.push(makeSyntheticSpan(step, decision.riskLevel, {
          ok: false,
          error: 'Skipped (approval required but skipApprovals=true)',
          errorCode: 'APPROVAL_SKIPPED',
        }));
        break;
      }
      try {
        const approvalId = await deps.createApproval({ plan, step, decision, context });
        approvalIds.push(approvalId);
        anyPendingApproval = true;
        spans.push(makeSyntheticSpan(step, decision.riskLevel, {
          ok: true,
          value: { approvalId, status: 'pending_approval' },
        }));
        break; // Stop executing; downstream steps depend on the approval outcome
      } catch (err) {
        anyFailed = true;
        spans.push(makeSyntheticSpan(step, decision.riskLevel, {
          ok: false,
          error: `Failed to create approval: ${err instanceof Error ? err.message : String(err)}`,
          errorCode: 'APPROVAL_CREATE_FAILED',
        }));
        break;
      }
    }

    // Dry-run short-circuit for writes/externals
    if (options.dryRun && tool.sideEffect !== 'read') {
      spans.push(makeSyntheticSpan(step, decision.riskLevel, {
        ok: true,
        value: { skipped: true, reason: 'dry-run' },
      }));
      continue;
    }

    // Validate args
    const interpolated = interpolateArgs(step.args, completed);
    const parsed = tool.args.parse(interpolated);
    if (!parsed.ok) {
      anyFailed = true;
      spans.push(makeSyntheticSpan(step, decision.riskLevel, {
        ok: false,
        error: `Invalid args: ${(parsed as { ok: false; error: string }).error}`,
        errorCode: 'INVALID_ARGS',
      }));
      break;
    }

    const runtimeRisk = elevateRisk(decision.riskLevel, classifyRiskFromArgs(tool.name, interpolated));

    // Execute
    const stepStart = Date.now();
    const stepStartIso = new Date(stepStart).toISOString();
    let result: ToolResult;
    try {
      result = await runStepWithTimeout(
        step,
        parsed.value,
        { ...context, dryRun: options.dryRun === true },
        tool.timeoutMs ?? 10_000,
        (args) => tool.run({ args, context: { ...context, dryRun: options.dryRun === true } }),
      );
    } catch (err) {
      result = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorCode: 'TOOL_THREW',
      };
    }
    const stepEnd = Date.now();

    const span: ExecutionSpan = {
      stepId: step.id,
      tool: step.tool,
      version: tool.version,
      startedAt: stepStartIso,
      endedAt: new Date(stepEnd).toISOString(),
      latencyMs: stepEnd - stepStart,
      args: parsed.value,
      result,
      riskLevel: runtimeRisk,
      dryRun: options.dryRun === true,
    };
    spans.push(span);
    completed.set(step.id, span);

    if (!result.ok) {
      anyFailed = true;
      logger.warn('PlanEngine step failed', {
        planId: plan.planId,
        stepId: step.id,
        tool: step.tool,
        error: result.error,
      });
      break;
    }
  }

  // 4. Determine final status
  let status: ExecutionStatus;
  if (anyPendingApproval) status = 'pending_approval';
  else if (anyFailed && spans.some((s) => s.result.ok)) status = 'partial';
  else if (anyFailed) status = 'failed';
  else status = 'success';

  trace.status = status;
  trace.endedAt = new Date().toISOString();
  trace.approvalIds = approvalIds.length > 0 ? approvalIds : undefined;
  trace.summary = buildSummary(status, spans, approvalIds);

  if (deps.persistTrace) {
    try {
      await deps.persistTrace(trace);
    } catch (err) {
      logger.error('PlanEngine failed to persist trace', err instanceof Error ? err : new Error(String(err)), {
        planId: plan.planId,
      });
    }
  }

  return trace;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSyntheticSpan(step: PlanStep, risk: string, result: ToolResult): ExecutionSpan {
  const now = new Date().toISOString();
  return {
    stepId: step.id,
    tool: step.tool,
    version: 'n/a',
    startedAt: now,
    endedAt: now,
    latencyMs: 0,
    args: step.args,
    result,
    riskLevel: (risk as any) ?? 'medium',
    dryRun: false,
  };
}

function buildSummary(status: ExecutionStatus, spans: ExecutionSpan[], approvalIds: string[]): string {
  const ok = spans.filter((s) => s.result.ok).length;
  const failed = spans.length - ok;
  switch (status) {
    case 'success':
      return `Executed ${spans.length} step(s) successfully.`;
    case 'partial':
      return `Executed ${ok} step(s); ${failed} failed.`;
    case 'failed':
      return `Execution failed after ${ok} successful step(s).`;
    case 'pending_approval':
      return `Waiting on ${approvalIds.length} approval(s) before continuing.`;
    case 'rejected_by_policy':
      return 'Plan rejected by policy engine.';
    case 'invalid_args':
      return 'Plan rejected due to invalid arguments.';
    case 'skipped_dry_run':
      return 'Dry run complete — no side effects executed.';
  }
}

/** Convenience factory: new UUIDv4 plan id. */
export function newPlanId(): string {
  return randomUUID();
}
