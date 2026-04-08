/**
 * server/agents/impl/customerCommunicationAgent.ts
 *
 * Customer Communication Agent — decides when customer-facing communication
 * should happen based on real reconciled operational state.
 *
 * Chooses when communication is safe, necessary and aligned with the
 * reconciled truth before drafting or sending:
 *   - Evaluates if the case state is stable enough to communicate
 *   - Checks if the customer has been waiting too long without update
 *   - Blocks communication when conflicts are unresolved
 *   - Determines the communication objective (update, resolution, follow-up)
 *
 * No Gemini — pure rule-based decision logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import { enqueue } from '../../queue/client.js';
import { JobType } from '../../queue/types.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

type CommunicationDecision = 'send_update' | 'send_resolution' | 'hold' | 'escalate_to_human' | 'follow_up';

export const customerCommunicationAgentImpl: AgentImplementation = {
  slug: 'customer-communication-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, traceId, permissions, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    // ── 1. Evaluate communication safety ─────────────────────────────────

    // Block communication if there are active critical conflicts
    const criticalConflicts = contextWindow.conflicts.filter(
      c => c.severity === 'critical' || c.severity === 'high'
    );

    if (criticalConflicts.length > 0) {
      return {
        success: true,
        confidence: 0.95,
        summary: `Communication held: ${criticalConflicts.length} critical conflict(s) unresolved`,
        output: {
          decision: 'hold' as CommunicationDecision,
          reason: 'Active critical conflicts prevent safe communication',
          conflictsBlocking: criticalConflicts.length,
        },
      };
    }

    // Block if case is blocked or pending approval
    if (contextWindow.case.status === 'blocked') {
      return {
        success: true,
        confidence: 0.9,
        summary: 'Communication held: case is blocked',
        output: { decision: 'hold' as CommunicationDecision, reason: 'Case is blocked' },
      };
    }

    if (contextWindow.case.approvalState === 'pending') {
      return {
        success: true,
        confidence: 0.9,
        summary: 'Communication held: approval pending',
        output: { decision: 'hold' as CommunicationDecision, reason: 'Approval pending — cannot communicate outcome yet' },
      };
    }

    // ── 2. Determine communication objective ─────────────────────────────
    let decision: CommunicationDecision;
    let objective: string;
    let tone: 'professional' | 'empathetic' | 'friendly' = 'professional';

    if (triggerEvent === 'case_resolved') {
      decision = 'send_resolution';
      objective = 'Inform the customer that their case has been resolved';
      tone = 'empathetic';
    } else {
      // Check if customer has been waiting too long
      const lastCustomerMessage = contextWindow.messages
        .filter(m => m.type === 'customer' || m.type === 'inbound')
        .pop();

      const lastAgentMessage = contextWindow.messages
        .filter(m => m.type !== 'customer' && m.type !== 'inbound')
        .pop();

      if (lastCustomerMessage && !lastAgentMessage) {
        // Customer sent a message but no response yet
        decision = 'send_update';
        objective = 'Acknowledge receipt and provide status update';
      } else if (lastCustomerMessage && lastAgentMessage) {
        const customerMsgTime = new Date(lastCustomerMessage.sentAt).getTime();
        const agentMsgTime = new Date(lastAgentMessage.sentAt).getTime();

        if (customerMsgTime > agentMsgTime) {
          // Customer sent a follow-up after our last response
          const hoursSinceCustomer = (nowMs - customerMsgTime) / 3600000;
          if (hoursSinceCustomer > 4) {
            decision = 'escalate_to_human';
            objective = 'Customer waiting >4h since last message — escalate to human agent';
          } else {
            decision = 'send_update';
            objective = 'Respond to customer follow-up';
          }
        } else {
          // We already responded — check if follow-up is needed
          const hoursSinceResponse = (nowMs - agentMsgTime) / 3600000;
          if (hoursSinceResponse > 24 && contextWindow.case.status !== 'resolved') {
            decision = 'follow_up';
            objective = 'Proactive follow-up — case still open after 24h';
          } else {
            return {
              success: true,
              confidence: 0.95,
              summary: 'No communication needed — recent response already sent',
              output: { decision: 'hold' as CommunicationDecision, reason: 'Recent response already sent' },
            };
          }
        }
      } else {
        decision = 'send_update';
        objective = 'Initial case acknowledgment';
      }
    }

    // ── 3. Adjust tone based on customer profile ─────────────────────────
    if (contextWindow.customer?.segment === 'vip') {
      tone = 'empathetic';
    } else if (contextWindow.case.riskLevel === 'high' || contextWindow.case.riskLevel === 'critical') {
      tone = 'empathetic';
    } else if (contextWindow.case.priority === 'low') {
      tone = 'friendly';
    }

    // ── 4. Enqueue draft if permission allows ────────────────────────────
    if (permissions.canSendMessages && (decision === 'send_update' || decision === 'send_resolution' || decision === 'follow_up')) {
      try {
        enqueue(
          JobType.DRAFT_REPLY,
          { caseId, tone },
          { tenantId, workspaceId, traceId, priority: 6 },
        );
      } catch (err: any) {
        logger.error('Communication agent failed to enqueue draft', { caseId, error: err?.message });
      }
    }

    // ── 5. Log decision ──────────────────────────────────────────────────
    try {
      db.prepare(`
        INSERT INTO audit_events
          (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
        VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
      `).run(
        randomUUID(), tenantId, caseId,
        `communication_decision:${decision}`,
        objective,
        JSON.stringify({ decision, tone, trigger: triggerEvent }),
        now,
      );
    } catch { /* non-critical */ }

    return {
      success: true,
      confidence: 0.9,
      summary: `Communication: ${decision} — ${objective}`,
      output: { decision, objective, tone, draftEnqueued: decision === 'send_update' || decision === 'send_resolution' || decision === 'follow_up' },
    };
  },
};
