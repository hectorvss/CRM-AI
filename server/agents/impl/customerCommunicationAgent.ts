/**
 * server/agents/impl/customerCommunicationAgent.ts
 *
 * Customer Communication Agent — decides when customer-facing communication
 * should happen based on real reconciled operational state.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
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
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();
    const nowMs = Date.now();

    const criticalConflicts = contextWindow.conflicts.filter(c => c.severity === 'critical' || c.severity === 'high');
    if (criticalConflicts.length > 0) {
      return { success: true, confidence: 0.95, summary: `Communication held: ${criticalConflicts.length} critical conflict(s) unresolved`, output: { decision: 'hold', reason: 'Active critical conflicts prevent safe communication', conflictsBlocking: criticalConflicts.length } };
    }
    if (contextWindow.case.status === 'blocked') {
      return { success: true, confidence: 0.9, summary: 'Communication held: case is blocked', output: { decision: 'hold', reason: 'Case is blocked' } };
    }
    if (contextWindow.case.approvalState === 'pending') {
      return { success: true, confidence: 0.9, summary: 'Communication held: approval pending', output: { decision: 'hold', reason: 'Approval pending — cannot communicate outcome yet' } };
    }

    let decision: CommunicationDecision;
    let objective: string;
    let tone: 'professional' | 'empathetic' | 'friendly' = 'professional';
    if (triggerEvent === 'case_resolved') {
      decision = 'send_resolution';
      objective = 'Inform the customer that their case has been resolved';
      tone = 'empathetic';
    } else {
      const lastCustomerMessage = contextWindow.messages.filter(m => m.type === 'customer' || m.type === 'inbound').pop();
      const lastAgentMessage = contextWindow.messages.filter(m => m.type !== 'customer' && m.type !== 'inbound').pop();

      if (lastCustomerMessage && !lastAgentMessage) {
        decision = 'send_update';
        objective = 'Acknowledge receipt and provide status update';
      } else if (lastCustomerMessage && lastAgentMessage) {
        const customerMsgTime = new Date(lastCustomerMessage.sentAt).getTime();
        const agentMsgTime = new Date(lastAgentMessage.sentAt).getTime();
        if (customerMsgTime > agentMsgTime) {
          const hoursSinceCustomer = (nowMs - customerMsgTime) / 3600000;
          if (hoursSinceCustomer > 4) {
            decision = 'escalate_to_human';
            objective = 'Customer waiting >4h since last message — escalate to human agent';
          } else {
            decision = 'send_update';
            objective = 'Respond to customer follow-up';
          }
        } else {
          const hoursSinceResponse = (nowMs - agentMsgTime) / 3600000;
          if (hoursSinceResponse > 24 && contextWindow.case.status !== 'resolved') {
            decision = 'follow_up';
            objective = 'Proactive follow-up — case still open after 24h';
          } else {
            return { success: true, confidence: 0.95, summary: 'No communication needed — recent response already sent', output: { decision: 'hold', reason: 'Recent response already sent' } };
          }
        }
      } else {
        decision = 'send_update';
        objective = 'Initial case acknowledgment';
      }
    }

    if (contextWindow.customer?.segment === 'vip' || contextWindow.case.riskLevel === 'high' || contextWindow.case.riskLevel === 'critical') tone = 'empathetic';
    else if (contextWindow.case.priority === 'low') tone = 'friendly';

    if (permissions.canSendMessages && (decision === 'send_update' || decision === 'send_resolution' || decision === 'follow_up')) {
      try {
        enqueue(JobType.DRAFT_REPLY, { caseId, tone }, { tenantId, workspaceId, traceId, priority: 6 });
      } catch (err: any) {
        logger.error('Communication agent failed to enqueue draft', { caseId, error: err?.message });
      }
    }

    try {
      if (useSupabase) {
        const { error } = await supabase!.from('audit_events').insert({
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_type: 'agent',
          action: `communication_decision:${decision}`,
          entity_type: 'case',
          entity_id: caseId,
          new_value: objective,
          metadata: { decision, tone, trigger: triggerEvent },
          occurred_at: now,
        });
        if (error) throw error;
      } else {
        db!.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
          VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
        `).run(randomUUID(), tenantId, workspaceId, `communication_decision:${decision}`, caseId, objective, JSON.stringify({ decision, tone, trigger: triggerEvent }), now);
      }
    } catch { /* non-critical */ }

    return {
      success: true,
      confidence: 0.9,
      summary: `Communication: ${decision} — ${objective}`,
      output: { decision, objective, tone, draftEnqueued: decision === 'send_update' || decision === 'send_resolution' || decision === 'follow_up' },
    };
  },
};
