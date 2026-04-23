/**
 * server/agents/planEngine/tools/agentRun.ts
 *
 * Generic bridge tool that allows the Plan Engine to invoke existing catalog
 * agents synchronously. This is the unification point for the event-driven
 * orchestrator: its deterministic chains can now be expressed as a Plan and
 * executed by the same policy / trace / approval runtime used by Super Agent.
 */

import { s } from '../schema.js';
import type { ToolSpec } from '../types.js';
import { broadcastSSE } from '../../../routes/sse.js';
import { runAgent } from '../../runner.js';

interface AgentRunArgs {
  agentSlug: string;
  caseId: string;
  triggerEvent: string;
  extraContext?: Record<string, unknown>;
}

interface AgentRunResult {
  agentSlug: string;
  status: string;
  summary: string;
}

export const agentRunTool: ToolSpec<AgentRunArgs, AgentRunResult> = {
  name: 'agent.run',
  version: '1.0.0',
  description:
    'Invoke an existing catalog agent synchronously as part of an orchestration chain. ' +
    'Used internally by the deterministic orchestrator runtime.',
  category: 'system',
  sideEffect: 'write',
  risk: 'medium',
  requiredPermission: 'agents.invoke',
  idempotent: false,
  timeoutMs: 60_000,

  args: s.object({
    agentSlug: s.string({
      description: 'Slug of the catalog agent to run',
      required: true,
      min: 1,
    }),
    caseId: s.string({
      description: 'Case ID associated with this orchestration chain',
      required: true,
      min: 1,
    }),
    triggerEvent: s.string({
      description: 'Lifecycle event that triggered the chain',
      required: true,
      min: 1,
    }),
    extraContext: s.object({}, {
      required: false,
      description: 'Additional context passed through by the orchestrator',
    }),
  }),

  returns: s.object({
    agentSlug: s.string({ description: 'Agent slug that ran', required: true }),
    status: s.enum(['completed', 'failed']),
    summary: s.string({ description: 'Human-readable execution summary', required: true }),
  }),

  async run({ args, context }) {
    broadcastSSE(context.tenantId, 'agent:start', {
      agentSlug: args.agentSlug,
      caseId: args.caseId,
      triggerEvent: args.triggerEvent,
      planId: context.planId,
      source: 'plan-engine',
    });

    let result;
    try {
      result = await runAgent({
        agentSlug: args.agentSlug,
        caseId: args.caseId,
        tenantId: context.tenantId,
        workspaceId: context.workspaceId ?? '',
        triggerEvent: args.triggerEvent,
        traceId: context.planId,
        extraContext: args.extraContext ?? {},
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      broadcastSSE(context.tenantId, 'agent:finish', {
        agentSlug: args.agentSlug,
        caseId: args.caseId,
        triggerEvent: args.triggerEvent,
        planId: context.planId,
        source: 'plan-engine',
        status: 'failed',
        summary: error,
        confidence: null,
        error,
      });
      return {
        ok: false,
        error,
        errorCode: 'AGENT_EXECUTION_THROWN',
      };
    }

    const status = result.success ? 'completed' : 'failed';
    const summary = result.summary ?? result.error ?? `${args.agentSlug}: ${status}`;

    broadcastSSE(context.tenantId, 'agent:finish', {
      agentSlug: args.agentSlug,
      caseId: args.caseId,
      triggerEvent: args.triggerEvent,
      planId: context.planId,
      source: 'plan-engine',
      status,
      summary,
      confidence: result.confidence ?? null,
      error: result.error ?? null,
    });

    if (result.success) {
      return {
        ok: true,
        value: {
          agentSlug: args.agentSlug,
          status,
          summary,
        },
      };
    }

    return {
      ok: false,
      error: summary,
      errorCode: 'AGENT_EXECUTION_FAILED',
    };
  },
};
