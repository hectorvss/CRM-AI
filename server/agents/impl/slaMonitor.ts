/**
 * server/agents/impl/slaMonitor.ts
 *
 * SLA Monitor Agent — monitors SLA deadlines and flags cases approaching breach.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const slaMonitorImpl: AgentImplementation = {
  slug: 'sla-monitor',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();
    const nowMs = Date.now();

    const caseRow = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('cases')
            .select('sla_first_response_deadline, sla_resolution_deadline, sla_first_response_met, sla_status, status')
            .eq('id', caseId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId)
            .maybeSingle();
          if (error) throw error;
          return data as any;
        })()
      : db!.prepare(`
          SELECT sla_first_response_deadline, sla_resolution_deadline,
                 sla_first_response_met, sla_status, status
          FROM cases WHERE id = ? AND tenant_id = ? AND workspace_id = ?
        `).get(caseId, tenantId, workspaceId) as any;

    if (!caseRow) return { success: false, error: 'Case not found' };
    if (caseRow.status === 'closed' || caseRow.status === 'resolved') {
      return { success: true, summary: 'Case already closed — SLA monitoring skipped' };
    }

    const alerts: Array<{ type: string; message: string; severity: string }> = [];
    let newSlaStatus = 'on_track';

    if (caseRow.sla_first_response_deadline && !caseRow.sla_first_response_met) {
      const frDeadline = new Date(caseRow.sla_first_response_deadline).getTime();
      const frHoursLeft = (frDeadline - nowMs) / 3600000;
      if (frHoursLeft < 0) {
        alerts.push({ type: 'sla_first_response_breached', message: `First response SLA breached by ${Math.abs(Math.round(frHoursLeft * 60))}min`, severity: 'critical' });
        newSlaStatus = 'breached';
      } else if (frHoursLeft < 0.5) {
        alerts.push({ type: 'sla_first_response_at_risk', message: `First response SLA due in ${Math.round(frHoursLeft * 60)}min`, severity: 'warning' });
        if (newSlaStatus !== 'breached') newSlaStatus = 'at_risk';
      }
    }

    if (caseRow.sla_resolution_deadline) {
      const resDeadline = new Date(caseRow.sla_resolution_deadline).getTime();
      const resHoursLeft = (resDeadline - nowMs) / 3600000;
      if (resHoursLeft < 0) {
        alerts.push({ type: 'sla_resolution_breached', message: `Resolution SLA breached by ${Math.abs(Math.round(resHoursLeft))}h`, severity: 'critical' });
        newSlaStatus = 'breached';
      } else if (resHoursLeft < 2) {
        alerts.push({ type: 'sla_resolution_at_risk', message: `Resolution SLA due in ${Math.round(resHoursLeft * 60)}min`, severity: 'warning' });
        if (newSlaStatus !== 'breached') newSlaStatus = 'at_risk';
      }
    }

    if (newSlaStatus !== caseRow.sla_status) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('cases')
            .update({ sla_status: newSlaStatus, updated_at: now })
            .eq('id', caseId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
          if (error) throw error;
        } else {
          db!.prepare('UPDATE cases SET sla_status = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?').run(newSlaStatus, now, caseId, tenantId, workspaceId);
        }
      } catch { /* non-critical */ }
    }

    for (const alert of alerts) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: alert.type,
            entity_type: 'case',
            entity_id: caseId,
            new_value: alert.message,
            metadata: { severity: alert.severity, agentRunId: runId },
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
          `).run(
            randomUUID(), tenantId, workspaceId,
            alert.type,
            caseId,
            alert.message,
            JSON.stringify({ severity: alert.severity, agentRunId: runId }),
            now,
          );
        }
      } catch (err: any) {
        logger.error('Failed to write SLA alert', { caseId, type: alert.type, error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 1.0,
      summary: alerts.length > 0
        ? `SLA monitor: ${alerts.length} alert(s) — status=${newSlaStatus}`
        : `SLA monitor: all deadlines on track`,
      output: {
        slaStatus: newSlaStatus,
        alertCount: alerts.length,
        alerts: alerts.map(a => ({ type: a.type, severity: a.severity })),
      },
    };
  },
};
