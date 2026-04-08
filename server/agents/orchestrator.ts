/**
 * server/agents/orchestrator.ts
 *
 * Deterministic routing table + AGENT_TRIGGER job handler.
 *
 * The orchestrator answers: "given this lifecycle event on this case,
 * which agents should run, and in what order?"
 *
 * Routing is 100% deterministic (no AI). Each trigger maps to an ordered
 * list of agent slugs. The agents run sequentially so each one can read
 * the results of the previous one from the context window.
 *
 * Gemini is only used inside the individual agent implementations.
 */

import { getDb } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { runAgent } from './runner.js';
import type { JobHandler } from '../queue/types.js';
import type { AgentTriggerPayload } from '../queue/types.js';

// ── Routing table ─────────────────────────────────────────────────────────────
//
// Order matters: agents earlier in the list can write DB state that later
// agents read via the context window.

type TriggerEvent = AgentTriggerPayload['triggerEvent'];

const ROUTING_TABLE: Record<TriggerEvent, string[]> = {
  case_created: [
    'triage-agent',           // classify urgency + severity
    'identity-resolver',      // link cross-system identities
    'customer-profiler',      // build risk score + segment
    'knowledge-retriever',    // attach relevant policy articles
    'audit-logger',           // record case creation audit event
  ],

  message_received: [
    'triage-agent',           // re-evaluate urgency on new message
    'knowledge-retriever',    // refresh relevant policies
    'draft-reply-agent',      // generate AI draft reply
    'audit-logger',           // record message receipt audit event
  ],

  conflicts_detected: [
    'qa-policy-check',        // validate resolution against policies
    'approval-gatekeeper',    // determine if approval is required
    'report-generator',       // generate AI diagnosis for conflicts
    'audit-logger',           // record conflict detection audit event
  ],

  case_resolved: [
    'qa-policy-check',        // final compliance check
    'report-generator',       // generate resolution summary report
    'audit-logger',           // record case resolution audit event
  ],
};

// ── AGENT_TRIGGER job handler ─────────────────────────────────────────────────

export const agentTriggerHandler: JobHandler<'agent.trigger'> = async (payload, ctx) => {
  const { triggerEvent, caseId, agentSlug, context: extraContext = {} } = payload;
  const { tenantId, workspaceId, traceId } = ctx;

  const resolvedTenantId    = tenantId    ?? 'tenant_default';
  const resolvedWorkspaceId = workspaceId ?? 'ws_default';

  // ── Determine which agents to run ────────────────────────────────────────
  let slugsToRun: string[];

  if (agentSlug) {
    // Direct invocation of a single agent (bypass routing table)
    slugsToRun = [agentSlug];
  } else {
    slugsToRun = ROUTING_TABLE[triggerEvent] ?? [];
  }

  if (slugsToRun.length === 0) {
    logger.warn('No agents in routing table for trigger event', { triggerEvent, caseId });
    return;
  }

  logger.info('Orchestrator dispatching agents', {
    triggerEvent, caseId, slugs: slugsToRun, jobId: ctx.jobId,
  });

  // ── Check case still exists and is actionable ─────────────────────────────
  const db = getDb();
  const caseRow = db.prepare(
    'SELECT id, status, tenant_id FROM cases WHERE id = ? AND tenant_id = ?'
  ).get(caseId, resolvedTenantId) as { id: string; status: string; tenant_id: string } | undefined;

  if (!caseRow) {
    logger.warn('Case not found for AGENT_TRIGGER — skipping', { caseId, tenantId: resolvedTenantId });
    return;
  }

  // Don't run agents on cases that are already closed (except audit-logger)
  const isClosed = caseRow.status === 'closed' || caseRow.status === 'resolved';
  if (isClosed && triggerEvent !== 'case_resolved') {
    logger.debug('Case already closed — skipping non-resolution trigger', { caseId, triggerEvent });
    return;
  }

  // ── Run agents sequentially ───────────────────────────────────────────────
  let consecutiveFailures = 0;

  for (const slug of slugsToRun) {
    // Skip audit-logger if previous agents all failed (avoid spammy partial audits)
    if (slug === 'audit-logger' && consecutiveFailures === slugsToRun.length - 1) {
      logger.debug('Skipping audit-logger — all prior agents failed', { caseId });
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

      if (!result.success) {
        consecutiveFailures++;
        logger.warn('Agent returned failure', { slug, caseId, error: result.error });
      } else {
        consecutiveFailures = 0;
      }
    } catch (err: any) {
      consecutiveFailures++;
      logger.error('Agent threw unhandled error', { slug, caseId, error: err?.message });
    }
  }

  logger.info('Orchestrator finished agent chain', {
    triggerEvent, caseId, slugs: slugsToRun,
    failures: consecutiveFailures,
  });
};

// ── Helper: fire-and-forget trigger (called from pipeline handlers) ───────────

import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

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
