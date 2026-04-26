/**
 * server/agents/orchestrator.ts
 *
 * Deterministic routing table + AGENT_TRIGGER job handler.
 *
 * The orchestrator answers: "given this lifecycle event on this case,
 * which agents should run, and in what order?"
 *
 * Routing is deterministic, but execution now flows through the same
 * Plan Engine runtime used by Super Agent. That gives us a single policy,
 * trace, approval and SSE path for both user-driven plans and backend
 * orchestration chains.
 */

import { randomUUID } from 'crypto';

import { createCaseRepository } from '../data/cases.js';
import { logger } from '../utils/logger.js';
import { broadcastSSE } from '../routes/sse.js';
import { requireScope } from '../lib/scope.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { planEngine } from './planEngine/index.js';
import type { JobHandler } from '../queue/types.js';
import type { AgentTriggerPayload } from '../queue/types.js';
import type { Plan } from './planEngine/types.js';

type TriggerEvent = AgentTriggerPayload['triggerEvent'];

const ROUTING_TABLE: Record<TriggerEvent, string[]> = {
  case_created: [
    'triage-agent',
    'identity-resolver',
    'identity-mapping-agent',
    'customer-identity-agent',
    'customer-profiler',
    'knowledge-retriever',
    'helpdesk-agent',
    'shopify-connector',
    'stripe-connector',
    'logistics-tracking-agent',
    'fraud-detector',
    'sla-monitor',
    'customer-communication-agent',
    'audit-logger',
  ],
  message_received: [
    'triage-agent',
    'helpdesk-agent',
    'knowledge-retriever',
    'sla-monitor',
    'customer-communication-agent',
    'draft-reply-agent',
    'audit-logger',
  ],
  conflicts_detected: [
    'shopify-connector',
    'stripe-connector',
    'oms-erp-agent',
    'returns-agent',
    'subscription-agent',
    'qa-policy-check',
    'approval-gatekeeper',
    'fraud-detector',
    'escalation-manager',
    'report-generator',
    'workflow-runtime-agent',
    'audit-logger',
  ],
  approval_approved: [
    'approval-gatekeeper',
    'workflow-runtime-agent',
    'resolution-executor',
    'returns-agent',
    'stripe-connector',
    'shopify-connector',
    'oms-erp-agent',
    'customer-communication-agent',
    'composer-translator',
    'audit-logger',
  ],
  approval_rejected: [
    'approval-gatekeeper',
    'workflow-runtime-agent',
    'customer-communication-agent',
    'composer-translator',
    'audit-logger',
  ],
  case_resolved: [
    'qa-policy-check',
    'report-generator',
    'workflow-runtime-agent',
    'sla-escalation-agent',
    'customer-communication-agent',
    'composer-translator',
    'audit-logger',
  ],
};

function buildChainPlan(input: {
  triggerEvent: TriggerEvent;
  caseId: string;
  slugs: string[];
  traceId: string;
  extraContext: Record<string, unknown>;
}): Plan {
  const { triggerEvent, caseId, slugs, traceId, extraContext } = input;

  const steps = slugs.map((agentSlug, index) => ({
    id: `step_${index}`,
    tool: 'agent.run',
    args: {
      agentSlug,
      caseId,
      triggerEvent,
      extraContext: {
        ...extraContext,
        orchestration: 'deterministic',
        chainIndex: index,
        chainLength: slugs.length,
      },
    },
    dependsOn: index === 0 ? [] : [`step_${index - 1}`],
    continueOnFailure: true,
    rationale: `Run orchestrator agent ${agentSlug} for ${triggerEvent}`,
  }));

  return {
    planId: traceId,
    sessionId: `agent-chain:${traceId}`,
    createdAt: new Date().toISOString(),
    steps,
    confidence: 1,
    rationale: `Deterministic orchestration chain for ${triggerEvent}`,
    needsApproval: false,
    responseTemplate: `Orchestrated ${slugs.length} agent(s) for ${triggerEvent}`,
  };
}

export const agentTriggerHandler: JobHandler<'agent.trigger'> = async (payload, ctx) => {
  const { triggerEvent, caseId, agentSlug, context: extraContext = {} } = payload;
  const { tenantId, workspaceId, traceId } = ctx;

  const { tenantId: resolvedTenantId, workspaceId: resolvedWorkspaceId } = requireScope({ tenantId, workspaceId }, 'agentTriggerHandler');

  let slugsToRun: string[];
  if (agentSlug) {
    slugsToRun = [agentSlug];
  } else {
    slugsToRun = ROUTING_TABLE[triggerEvent] ?? [];
  }

  if (slugsToRun.length === 0) {
    logger.warn('No agents in routing table for trigger event', { triggerEvent, caseId });
    return;
  }

  const caseRepo = createCaseRepository();
  const caseRow = await caseRepo.get({ tenantId: resolvedTenantId, workspaceId: resolvedWorkspaceId }, caseId);

  if (!caseRow) {
    logger.warn('Case not found for AGENT_TRIGGER — skipping', { caseId, tenantId: resolvedTenantId });
    return;
  }

  const isClosed = caseRow.status === 'closed' || caseRow.status === 'resolved';
  if (isClosed && triggerEvent !== 'case_resolved') {
    logger.debug('Case already closed — skipping non-resolution trigger', { caseId, triggerEvent });
    return;
  }

  const plan = buildChainPlan({
    triggerEvent,
    caseId,
    slugs: slugsToRun,
    traceId: traceId ?? randomUUID(),
    extraContext,
  });

  logger.info('Orchestrator dispatching agents via Plan Engine', {
    triggerEvent,
    caseId,
    slugs: slugsToRun,
    jobId: ctx.jobId,
    planId: plan.planId,
  });

  broadcastSSE(resolvedTenantId, 'chain:start', {
    caseId,
    triggerEvent,
    slugs: slugsToRun,
    planId: plan.planId,
  });

  try {
    const trace = await planEngine.execute({
      plan,
      userId: 'system',
      tenantId: resolvedTenantId,
      workspaceId: resolvedWorkspaceId,
      hasPermission: () => true,
    });

    const failures = trace.spans.filter((span) => !span.result.ok).length;

    broadcastSSE(resolvedTenantId, 'chain:finish', {
      caseId,
      triggerEvent,
      failures,
      totalAgents: slugsToRun.length,
      planId: plan.planId,
      status: trace.status,
    });

    logger.info('Orchestrator finished agent chain', {
      triggerEvent,
      caseId,
      slugs: slugsToRun,
      failures,
      planId: plan.planId,
      traceStatus: trace.status,
    });
  } catch (err: any) {
    broadcastSSE(resolvedTenantId, 'chain:finish', {
      caseId,
      triggerEvent,
      failures: slugsToRun.length,
      totalAgents: slugsToRun.length,
      planId: plan.planId,
      status: 'error',
      error: err?.message ?? 'Unknown error',
    });

    logger.error('Orchestrator chain execution failed', {
      triggerEvent,
      caseId,
      slugs: slugsToRun,
      planId: plan.planId,
      error: err?.message ?? String(err),
    });
  }
};

export function triggerAgents(
  event: TriggerEvent,
  caseId: string,
  opts: { tenantId: string; workspaceId: string; traceId?: string; priority?: number; context?: Record<string, unknown> }
): void {
  const { tenantId, workspaceId, traceId, priority = 8, context } = opts;

  try {
    enqueue(
      JobType.AGENT_TRIGGER,
      { triggerEvent: event, caseId, context },
      { tenantId, workspaceId, traceId, priority },
    );
  } catch (err: any) {
    logger.error('Failed to enqueue AGENT_TRIGGER', { event, caseId, error: err?.message });
  }
}
