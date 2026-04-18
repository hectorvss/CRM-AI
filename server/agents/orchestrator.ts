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

import { createCaseRepository } from '../data/cases.js';
import { logger } from '../utils/logger.js';
import { runAgent } from './runner.js';
import { broadcastSSE } from '../routes/sse.js';
import { requireScope } from '../lib/scope.js';
import type { JobHandler } from '../queue/types.js';
import type { AgentTriggerPayload } from '../queue/types.js';

// ── Routing table ─────────────────────────────────────────────────────────────
//
// Order matters: agents earlier in the list can write DB state that later
// agents read via the context window.

type TriggerEvent = AgentTriggerPayload['triggerEvent'];

const ROUTING_TABLE: Record<TriggerEvent, string[]> = {
  case_created: [
    'triage-agent',                 // classify urgency + severity + SLA
    'identity-resolver',            // link cross-system identities
    'identity-mapping-agent',       // deep cross-system identity mapping
    'customer-identity-agent',      // canonical customer truth + metrics
    'customer-profiler',            // build risk score + segment
    'knowledge-retriever',          // attach relevant policy articles
    'helpdesk-agent',               // sync helpdesk tags + notes
    'shopify-connector',            // read order state from Shopify
    'stripe-connector',             // read payment state from Stripe
    'logistics-tracking-agent',     // check shipping/tracking status
    'fraud-detector',               // scan for fraud signals
    'sla-monitor',                  // set initial SLA tracking
    'customer-communication-agent', // decide if ack message needed
    'audit-logger',                 // record case creation audit event
  ],

  message_received: [
    'triage-agent',                 // re-evaluate urgency on new message
    'helpdesk-agent',               // sync helpdesk tags from message
    'knowledge-retriever',          // refresh relevant policies
    'sla-monitor',                  // check first-response SLA
    'customer-communication-agent', // decide communication strategy
    'draft-reply-agent',            // generate AI draft reply
    'audit-logger',                 // record message receipt audit event
  ],

  conflicts_detected: [
    'shopify-connector',            // read latest Shopify state
    'stripe-connector',             // read latest Shopify state
    'oms-erp-agent',                // verify back-office consistency
    'returns-agent',                // check return lifecycle state
    'subscription-agent',           // check subscription state if relevant
    'qa-policy-check',              // validate resolution against policies
    'approval-gatekeeper',          // determine if approval is required
    'fraud-detector',               // scan conflicts for fraud patterns
    'escalation-manager',           // check if escalation needed
    'report-generator',             // generate AI diagnosis for conflicts
    'workflow-runtime-agent',       // pause workflows if needed
    'audit-logger',                 // record conflict detection audit event
  ],

  case_resolved: [
    'qa-policy-check',              // final compliance check
    'report-generator',             // generate resolution summary report
    'workflow-runtime-agent',       // complete active workflows
    'sla-escalation-agent',         // final SLA status update
    'customer-communication-agent', // send resolution confirmation
    'composer-translator',          // draft localized resolution message
    'audit-logger',                 // record case resolution audit event
  ],
};

// ── AGENT_TRIGGER job handler ─────────────────────────────────────────────────

export const agentTriggerHandler: JobHandler<'agent.trigger'> = async (payload, ctx) => {
  const { triggerEvent, caseId, agentSlug, context: extraContext = {} } = payload;
  const { tenantId, workspaceId, traceId } = ctx;

  const { tenantId: resolvedTenantId, workspaceId: resolvedWorkspaceId } = requireScope({ tenantId, workspaceId }, 'agentTriggerHandler');

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

  // Broadcast chain start to SSE clients
  broadcastSSE(resolvedTenantId, 'chain:start', {
    caseId, triggerEvent, slugs: slugsToRun,
  });

  // ── Check case still exists and is actionable ─────────────────────────────
  const caseRepo = createCaseRepository();
  const caseRow = await caseRepo.get({ tenantId: resolvedTenantId, workspaceId: resolvedWorkspaceId }, caseId);

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
      broadcastSSE(resolvedTenantId, 'agent:start', {
        agentSlug: slug, caseId, triggerEvent,
      });

      const result = await runAgent({
        agentSlug: slug,
        caseId,
        tenantId: resolvedTenantId,
        workspaceId: resolvedWorkspaceId,
        triggerEvent,
        traceId,
        extraContext,
      });

      const status = result.success ? 'completed' : 'failed';
      broadcastSSE(resolvedTenantId, 'agent:finish', {
        agentSlug: slug, caseId, status,
        summary: result.summary ?? null,
        confidence: result.confidence ?? null,
        error: result.error ?? null,
      });

      if (!result.success) {
        consecutiveFailures++;
        logger.warn('Agent returned failure', { slug, caseId, error: result.error });
      } else {
        consecutiveFailures = 0;
      }
    } catch (err: any) {
      consecutiveFailures++;
      broadcastSSE(resolvedTenantId, 'agent:finish', {
        agentSlug: slug, caseId, status: 'error',
        error: err?.message ?? 'Unknown error',
      });
      logger.error('Agent threw unhandled error', { slug, caseId, error: err?.message });
    }
  }

  broadcastSSE(resolvedTenantId, 'chain:finish', {
    caseId, triggerEvent, failures: consecutiveFailures,
    totalAgents: slugsToRun.length,
  });

  logger.info('Orchestrator finished agent chain', {
    triggerEvent, caseId, slugs: slugsToRun,
    failures: consecutiveFailures,
  });
};

// ── Helper: fire-and-forget trigger (called from pipeline handlers) ───────────

import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export async function triggerAgents(
  event: TriggerEvent,
  caseId: string,
  opts: { tenantId: string; workspaceId: string; traceId?: string; priority?: number; context?: Record<string, unknown> }
): Promise<void> {
  const { tenantId, workspaceId, traceId, priority = 8, context } = opts;

  try {
    await enqueue(
      JobType.AGENT_TRIGGER,
      { triggerEvent: event, caseId, context },
      { tenantId, workspaceId, traceId, priority },
    );
  } catch (err: any) {
    logger.error('Failed to enqueue AGENT_TRIGGER', { event, caseId, error: err?.message });
  }
}
