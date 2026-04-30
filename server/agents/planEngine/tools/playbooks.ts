/**
 * server/agents/planEngine/tools/playbooks.ts
 *
 * ToolSpecs for discovering and executing predefined Plan Engine playbooks.
 *
 * Three tools:
 *   - playbook.list      → discover available playbooks
 *   - playbook.get       → fetch a playbook's full recipe (steps + parameters)
 *   - playbook.execute   → run a playbook end-to-end (each step still goes
 *                          through the same ToolSpec validation + audit path)
 *
 * The LLM is encouraged via the system prompt to call playbook.list when it
 * detects a multi-step scenario and to use a playbook recipe instead of
 * re-deriving the workflow.
 */

import { toolRegistry } from '../registry.js';
import { listPlaybooks, getPlaybook, interpolatePlaybookArgs } from '../playbookRegistry.js';
import type { ToolSpec, ToolResult } from '../types.js';
import { s } from '../schema.js';
import { logger } from '../../../utils/logger.js';

// ── playbook.list ────────────────────────────────────────────────────────────

export const playbookListTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'playbook.list',
  version: '1.0.0',
  description:
    'List the predefined operational playbooks the Super Agent can run. Each playbook is a deterministic ' +
    'multi-step recipe (e.g. customer recovery, fraud response, order cancellation + refund). Returns id, ' +
    'name, description, when-to-use guidance, tags, and risk hint. Call this FIRST when the user asks for a ' +
    'multi-step operation that may match an existing recipe.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  args: s.object({}),
  returns: s.any('Array of playbook summaries: { id, name, description, whenToUse, tags, riskHint }'),
  async run() {
    return { ok: true, value: listPlaybooks() };
  },
};

// ── playbook.get ─────────────────────────────────────────────────────────────

interface PlaybookGetArgs {
  playbookId: string;
}

export const playbookGetTool: ToolSpec<PlaybookGetArgs, unknown> = {
  name: 'playbook.get',
  version: '1.0.0',
  description:
    'Fetch the full definition of a playbook: parameter contract + ordered steps with rationale per step. ' +
    'Use this when you want to either (a) emit a multi-step plan based on the recipe, or (b) call playbook.execute.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  args: s.object({
    playbookId: s.string({ description: 'ID of the playbook (e.g. customer_recovery, fraud_response)' }),
  }),
  returns: s.any('Full playbook definition or { ok:false, error } if not found.'),
  async run({ args }) {
    const pb = getPlaybook(args.playbookId);
    if (!pb) return { ok: false, error: `Playbook "${args.playbookId}" not found`, errorCode: 'NOT_FOUND' };
    return { ok: true, value: pb };
  },
};

interface PlaybookPreviewArgs {
  playbookId: string;
  parameters: unknown;
}

export const playbookPreviewTool: ToolSpec<PlaybookPreviewArgs, unknown> = {
  name: 'playbook.preview',
  version: '1.0.0',
  description:
    'Preview a playbook before execution. Validates parameters, resolves the concrete steps, and explains risk, permissions, and likely approval needs without mutating state.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  args: s.object({
    playbookId: s.string({ description: 'ID of the playbook to preview' }),
    parameters: s.any('Object mapping parameter name to value. Use the same shape as playbook.execute.'),
  }),
  returns: s.any('{ playbookId, summary, steps, requiresApproval, missingPermissions }'),
  async run({ args, context }) {
    const pb = getPlaybook(args.playbookId);
    if (!pb) return { ok: false, error: `Playbook "${args.playbookId}" not found`, errorCode: 'NOT_FOUND' };

    const params = (args.parameters && typeof args.parameters === 'object' && !Array.isArray(args.parameters))
      ? args.parameters as Record<string, unknown>
      : {};

    for (const p of pb.parameters) {
      if (p.required && (params[p.name] === undefined || params[p.name] === null || params[p.name] === '')) {
        return {
          ok: false,
          error: `Missing required parameter "${p.name}" for playbook "${pb.id}"`,
          errorCode: 'MISSING_PARAMETER',
        };
      }
    }

    const stepOutputs: Record<string, unknown> = {};
    const ordered = topologicalOrder(pb.steps);
    const steps = ordered.map((step) => {
      const tool = toolRegistry.get(step.tool);
      const interpolated = interpolatePlaybookArgs(step.args, params, stepOutputs);
      const parsed: { ok: true; value: unknown } | { ok: false; error: string } = tool
        ? (tool.args.parse(interpolated) as { ok: true; value: unknown } | { ok: false; error: string })
        : { ok: false, error: 'Tool not registered' };
      const valid = parsed.ok === true;
      const permission = tool?.requiredPermission ?? null;
      const hasPermission = permission ? context.hasPermission(permission) : true;
      const risk = tool?.risk ?? 'unknown';
      const approvalLikely = risk === 'high' || risk === 'critical';

      if (parsed.ok) {
        stepOutputs[step.id] = parsed.value;
      }

      let validationError: string | null = null;
      let resolvedArgs: unknown = interpolated;
      if (parsed.ok) {
        resolvedArgs = parsed.value;
      } else {
        validationError = 'error' in parsed ? parsed.error : 'Invalid args';
      }

      return {
        id: step.id,
        tool: step.tool,
        rationale: step.rationale,
        dependsOn: step.dependsOn ?? [],
        risk,
        requiredPermission: permission,
        hasPermission,
        approvalLikely,
        validArgs: valid,
        validationError,
        resolvedArgs,
      };
    });

    return {
      ok: true,
      value: {
        playbookId: pb.id,
        name: pb.name,
        description: pb.description,
        summary: `${pb.name} will run ${steps.length} step${steps.length === 1 ? '' : 's'}.`,
        requiresApproval: steps.some((step) => step.approvalLikely),
        missingPermissions: steps
          .filter((step) => step.requiredPermission && !step.hasPermission)
          .map((step) => ({ tool: step.tool, permission: step.requiredPermission })),
        steps,
      },
    };
  },
};

// ── playbook.execute ─────────────────────────────────────────────────────────

interface PlaybookExecuteArgs {
  playbookId: string;
  parameters: unknown;
}

export const playbookExecuteTool: ToolSpec<PlaybookExecuteArgs, unknown> = {
  name: 'playbook.execute',
  version: '1.0.0',
  description:
    'Run a playbook end-to-end with the supplied parameters. Each step is dispatched through its registered ' +
    'ToolSpec — args are validated, permissions enforced, audit recorded. Returns a per-step trace with ' +
    'rationale + outcome. Use playbook.list/playbook.get first to know which playbook + parameters to pass.',
  category: 'system',
  sideEffect: 'write',
  risk: 'high',
  idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    playbookId: s.string({ description: 'ID of the playbook to run' }),
    parameters: s.any('Object mapping parameter name → value. Required + optional params per playbook.get.'),
  }),
  returns: s.any('{ playbookId, status, steps: [{ id, tool, ok, output?, error?, rationale }] }'),
  async run({ args, context }) {
    const pb = getPlaybook(args.playbookId);
    if (!pb) return { ok: false, error: `Playbook "${args.playbookId}" not found`, errorCode: 'NOT_FOUND' };

    const params = (args.parameters && typeof args.parameters === 'object' && !Array.isArray(args.parameters))
      ? args.parameters as Record<string, unknown>
      : {};

    // Validate required parameters
    for (const p of pb.parameters) {
      if (p.required && (params[p.name] === undefined || params[p.name] === null || params[p.name] === '')) {
        return {
          ok: false,
          error: `Missing required parameter "${p.name}" for playbook "${pb.id}"`,
          errorCode: 'MISSING_PARAMETER',
        };
      }
    }

    const stepOutputs: Record<string, unknown> = {};
    const stepResults: Array<{
      id: string;
      tool: string;
      ok: boolean;
      rationale: string;
      output?: unknown;
      error?: string;
      skipped?: boolean;
    }> = [];

    let aborted = false;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // Resolve step order based on dependsOn (already declared sequentially in the
    // builtin playbooks, but we still respect the graph in case a dependency was
    // declared out of order).
    const ordered = topologicalOrder(pb.steps);

    for (const step of ordered) {
      // Honour dependsOn: skip if any dep failed and the step is not continueOnFailure
      const depFailed = (step.dependsOn ?? []).some((d) => {
        const r = stepResults.find((x) => x.id === d);
        return r && r.ok === false;
      });
      if (depFailed) {
        skipped += 1;
        stepResults.push({ id: step.id, tool: step.tool, ok: false, rationale: step.rationale, skipped: true, error: 'Skipped: upstream step failed' });
        continue;
      }

      const tool = toolRegistry.get(step.tool);
      if (!tool) {
        failed += 1;
        stepResults.push({ id: step.id, tool: step.tool, ok: false, rationale: step.rationale, error: `Tool "${step.tool}" not registered` });
        if (!step.continueOnFailure) {
          aborted = true;
          break;
        }
        continue;
      }

      // Permission check (do not run a tool the caller cannot use)
      if (tool.requiredPermission && !context.hasPermission(tool.requiredPermission)) {
        failed += 1;
        stepResults.push({
          id: step.id,
          tool: step.tool,
          ok: false,
          rationale: step.rationale,
          error: `Caller lacks permission "${tool.requiredPermission}"`,
        });
        if (!step.continueOnFailure) {
          aborted = true;
          break;
        }
        continue;
      }

      // Interpolate args
      const interpolated = interpolatePlaybookArgs(step.args, params, stepOutputs);

      // Validate against ToolSpec schema
      const parsed = tool.args.parse(interpolated);
      if (!parsed.ok) {
        failed += 1;
        stepResults.push({
          id: step.id,
          tool: step.tool,
          ok: false,
          rationale: step.rationale,
          error: `Invalid args: ${(parsed as { ok: false; error: string }).error}`,
        });
        if (!step.continueOnFailure) {
          aborted = true;
          break;
        }
        continue;
      }

      // Run the tool
      let result: ToolResult;
      try {
        result = await tool.run({ args: parsed.value, context });
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err), errorCode: 'TOOL_THREW' };
      }

      if (result.ok) {
        succeeded += 1;
        stepOutputs[step.id] = result.value;
        stepResults.push({ id: step.id, tool: step.tool, ok: true, rationale: step.rationale, output: result.value });
      } else {
        failed += 1;
        stepResults.push({ id: step.id, tool: step.tool, ok: false, rationale: step.rationale, error: result.error });
        if (!step.continueOnFailure) {
          aborted = true;
          logger.warn('playbook.execute aborted', { playbookId: pb.id, stepId: step.id, tool: step.tool, error: result.error });
          break;
        }
      }
    }

    await context.audit({
      action: 'PLAN_ENGINE_PLAYBOOK_EXECUTED',
      entityType: 'playbook',
      entityId: pb.id,
      newValue: {
        playbookId: pb.id,
        status: aborted ? 'aborted' : failed > 0 ? 'partial' : 'success',
        succeeded,
        failed,
        skipped,
      },
      metadata: { source: 'plan-engine', planId: context.planId, parameters: params },
    });

    return {
      ok: !aborted && failed === 0,
      value: {
        playbookId: pb.id,
        status: aborted ? 'aborted' : failed > 0 ? 'partial' : 'success',
        succeeded,
        failed,
        skipped,
        steps: stepResults,
      },
    };
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

function topologicalOrder<T extends { id: string; dependsOn?: string[] }>(steps: T[]): T[] {
  const idToStep = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const result: T[] = [];
  function visit(step: T) {
    if (visited.has(step.id)) return;
    visited.add(step.id);
    for (const dep of step.dependsOn ?? []) {
      const ds = idToStep.get(dep);
      if (ds) visit(ds);
    }
    result.push(step);
  }
  steps.forEach(visit);
  return result;
}
