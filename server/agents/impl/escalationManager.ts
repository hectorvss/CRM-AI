import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface EscalationReason {
  code: string;
  description: string;
  severity: 'warning' | 'critical';
}

export const escalationManagerImpl: AgentImplementation = {
  slug: 'escalation-manager',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const reasons: EscalationReason[] = [];

    if (contextWindow.case.slaDue) {
      const slaDeadline = new Date(contextWindow.case.slaDue).getTime();
      const hoursLeft = (slaDeadline - Date.now()) / 3600000;
      if (hoursLeft < 0) reasons.push({ code: 'sla_breached', description: `SLA resolution deadline breached by ${Math.abs(Math.round(hoursLeft))}h`, severity: 'critical' });
      else if (hoursLeft < 2) reasons.push({ code: 'sla_at_risk', description: `SLA resolution deadline in ${Math.round(hoursLeft * 60)}min`, severity: 'warning' });
    }

    if ((contextWindow.case.riskLevel === 'high' || contextWindow.case.riskLevel === 'critical') && contextWindow.conflicts.length > 0) {
      reasons.push({
        code: 'high_risk_conflict',
        description: `${contextWindow.case.riskLevel} risk customer with ${contextWindow.conflicts.length} active conflict(s)`,
        severity: contextWindow.case.riskLevel === 'critical' ? 'critical' : 'warning',
      });
    }

    const { count: approvalCount } = await supabase.from('approval_requests')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 4 * 3600000).toISOString());
    const staleApprovalCount = approvalCount ?? 0;

    const { count: failureCount } = await supabase.from('agent_runs')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'failed')
      .gte('started_at', new Date(Date.now() - 3600000).toISOString());
    const recentFailureCount = failureCount ?? 0;

    const { data: caseRow } = await supabase.from('cases')
      .select('updated_at')
      .eq('id', caseId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const blockedUpdatedAt: string | null = caseRow?.updated_at ?? null;

    if (staleApprovalCount > 0) reasons.push({ code: 'stale_approval', description: `${staleApprovalCount} approval request(s) pending >4 hours`, severity: 'warning' });
    if (recentFailureCount >= 3) reasons.push({ code: 'agent_chain_failures', description: `${recentFailureCount} agent failures in the last hour`, severity: 'critical' });

    if (contextWindow.case.status === 'blocked' && blockedUpdatedAt) {
      const blockedDuration = Date.now() - new Date(blockedUpdatedAt).getTime();
      if (blockedDuration > 2 * 3600000) {
        reasons.push({ code: 'blocked_too_long', description: `Case blocked for ${Math.round(blockedDuration / 3600000)}h`, severity: 'warning' });
      }
    }

    if (reasons.length === 0) {
      return { success: true, confidence: 1.0, summary: 'No escalation needed — all thresholds within limits', output: { escalated: false, reasonCount: 0 } };
    }

    const hasCritical = reasons.some(r => r.severity === 'critical');

    for (const reason of reasons) {
      try {
        const { error } = await supabase.from('audit_events').insert({
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_type: 'agent',
          action: `escalation:${reason.code}`,
          entity_type: 'case',
          entity_id: caseId,
          new_value: reason.description,
          metadata: { code: reason.code, severity: reason.severity, agentRunId: runId },
          occurred_at: now,
        });
        if (error) throw error;
      } catch (err: any) {
        logger.error('Failed to write escalation event', { caseId, code: reason.code, error: err?.message });
      }
    }

    if (hasCritical && contextWindow.case.priority !== 'urgent') {
      try {
        await supabase.from('cases')
          .update({ priority: 'urgent', updated_at: now })
          .eq('id', caseId)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId);
      } catch {
        // non-critical
      }
    }

    return {
      success: true,
      confidence: 0.95,
      summary: `Escalation: ${reasons.length} reason(s) — ${reasons.map(r => r.code).join(', ')}`,
      output: {
        escalated: true,
        reasonCount: reasons.length,
        reasons: reasons.map(r => ({ code: r.code, severity: r.severity })),
        priorityBumped: hasCritical && contextWindow.case.priority !== 'urgent',
      },
    };
  },
};
