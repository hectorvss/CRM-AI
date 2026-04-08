import { getDb } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { runAgent } from './runner.js';
import type { JobHandler } from '../queue/types.js';
import type { AgentTriggerPayload } from '../queue/types.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

type TriggerEvent = AgentTriggerPayload['triggerEvent'];

const ROUTING_TABLE: Record<TriggerEvent, string[]> = {
  case_created: [
    'intent-router',
    'identity-mapping-agent',
    'customer-identity-agent',
    'knowledge-retriever',
    'audit-observability',
  ],
  message_received: [
    'intent-router',
    'knowledge-retriever',
    'customer-communication-agent',
    'composer-translator',
    'audit-observability',
  ],
  conflicts_detected: [
    'reconciliation-agent',
    'case-resolution-planner',
    'qa-policy-check',
    'approval-gatekeeper',
    'audit-observability',
  ],
  case_resolved: [
    'qa-policy-check',
    'workflow-runtime-agent',
    'customer-communication-agent',
    'audit-observability',
  ],
};

export const agentTriggerHandler: JobHandler<'agent.trigger'> = async (payload, ctx) => {
  const { triggerEvent, caseId, agentSlug, context: extraContext = {} } = payload;
  const { tenantId, workspaceId, traceId } = ctx;

  const resolvedTenantId = tenantId ?? 'tenant_default';
  const resolvedWorkspaceId = workspaceId ?? 'ws_default';

  const slugsToRun = agentSlug ? [agentSlug] : ROUTING_TABLE[triggerEvent] ?? [];
  if (slugsToRun.length === 0) {
    logger.warn('No agents in routing table for trigger event', { triggerEvent, caseId });
    return;
  }

  const db = getDb();
  const caseRow = db.prepare(
    'SELECT id, status, tenant_id FROM cases WHERE id = ? AND tenant_id = ?'
  ).get(caseId, resolvedTenantId) as { id: string; status: string; tenant_id: string } | undefined;

  if (!caseRow) {
    logger.warn('Case not found for AGENT_TRIGGER — skipping', { caseId, tenantId: resolvedTenantId });
    return;
  }

  const isClosed = caseRow.status === 'closed' || caseRow.status === 'resolved';
  if (isClosed && triggerEvent !== 'case_resolved') {
    logger.debug('Case already closed — skipping non-resolution trigger', { caseId, triggerEvent });
    return;
  }

  logger.info('Orchestrator dispatching agents', {
    triggerEvent,
    caseId,
    slugs: slugsToRun,
    jobId: ctx.jobId,
  });

  let consecutiveFailures = 0;

  for (const slug of slugsToRun) {
    if (slug === 'audit-observability' && consecutiveFailures === slugsToRun.length - 1) {
      logger.debug('Skipping audit-observability because prior agents failed', { caseId });
      continue;
    }

    try {
      const result = await runAgent({
        agentSlug: slug,
        caseId,
        tenantId: resolvedTenantId,
        workspaceId: resolvedWorkspaceId,
        triggerEvent,
        traceId,
        extraContext,
      });

      consecutiveFailures = result.success ? 0 : consecutiveFailures + 1;
      if (!result.success) {
        logger.warn('Agent returned failure', { slug, caseId, error: result.error });
      }
    } catch (err: any) {
      consecutiveFailures++;
      logger.error('Agent threw unhandled error', { slug, caseId, error: err?.message });
    }
  }

  logger.info('Orchestrator finished agent chain', {
    triggerEvent,
    caseId,
    slugs: slugsToRun,
    failures: consecutiveFailures,
  });
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
