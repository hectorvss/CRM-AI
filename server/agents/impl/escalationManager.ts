import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
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
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
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

    let staleApprovalCount = 0;
    let recentFailureCount = 0;
    let blockedUpdatedAt: string | null = null;

    if (useSupabase) {
      const { count: approvalCount } = await supabase!.from('approval_requests')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .lt('created_at', new Date(Date.now() - 4 * 3600000).toISOString());
      staleApprovalCount = approvalCount ?? 0;

      const { count: failureCount } = await supabase!.from('agent_runs')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'failed')
        .gte('started_at', new Date(Date.now() - 3600000).toISOString());
      recentFailureCount = failureCount ?? 0;

      const { data: caseRow } = await supabase!.from('cases').select('updated_at').eq('id', caseId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId).maybeSingle();
      blockedUpdatedAt = caseRow?.updated_at ?? null;
    } else {
      staleApprovalCount = (db!.prepare(`
        SELECT COUNT(*) as count
        FROM approval_requests
        WHERE case_id = ? AND tenant_id = ? AND workspace_id = ? AND status = 'pending'
          AND created_at < datetime('now', '-4 hours')
      `).get(caseId, tenantId, workspaceId) as { count: number }).count;

      recentFailureCount = (db!.prepare(`
        SELECT COUNT(*) as count
        FROM agent_runs
        WHERE case_id = ? AND tenant_id = ? AND workspace_id = ? AND status = 'failed'
          AND started_at >= datetime('now', '-1 hour')
      `).get(caseId, tenantId, workspaceId) as { count: number }).count;

      const caseRow = db!.prepare('SELECT updated_at FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(caseId, tenantId, workspaceId) as { updated_at: string } | undefined;
      blockedUpdatedAt = caseRow?.updated_at ?? null;
    }

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
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
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
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
          `).run(randomUUID(), tenantId, workspaceId, `escalation:${reason.code}`, caseId, reason.description, JSON.stringify({ code: reason.code, severity: reason.severity, agentRunId: runId }), now);
        }
      } catch (err: any) {
        logger.error('Failed to write escalation event', { caseId, code: reason.code, error: err?.message });
      }
    }

    if (hasCritical && contextWindow.case.priority !== 'urgent') {
      try {
        if (useSupabase) {
          await supabase!.from('cases').update({ priority: 'urgent', updated_at: now }).eq('id', caseId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
        } else {
          db!.prepare('UPDATE cases SET priority = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?').run('urgent', now, caseId, tenantId, workspaceId);
        }
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
