/**
 * server/agents/impl/slaMonitor.ts
 *
 * SLA Monitor Agent — monitors SLA deadlines and flags cases approaching breach.
 *
 * Checks both first-response and resolution SLA deadlines against
 * current time and writes warning/breach events to audit_events.
 *
 * Also tracks SLA status field on the case row (on_track / at_risk / breached).
 *
 * No Gemini — pure time-based logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const slaMonitorImpl: AgentImplementation = {
  slug: 'sla-monitor',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    // ── Fetch SLA deadlines from case ────────────────────────────────────
    const caseRow = db.prepare(`
      SELECT sla_first_response_deadline, sla_resolution_deadline,
             first_response_at, sla_status, status
      FROM cases WHERE id = ? AND tenant_id = ?
    `).get(caseId, tenantId) as any;

    if (!caseRow) {
      return { success: false, error: 'Case not found' };
    }

    // Skip closed/resolved cases
    if (caseRow.status === 'closed' || caseRow.status === 'resolved') {
      return { success: true, summary: 'Case already closed — SLA monitoring skipped' };
    }

    const alerts: Array<{ type: string; message: string; severity: string }> = [];
    let newSlaStatus = 'on_track';

    // ── First response check ─────────────────────────────────────────────
    if (caseRow.sla_first_response_deadline && !caseRow.first_response_at) {
      const frDeadline = new Date(caseRow.sla_first_response_deadline).getTime();
      const frTimeLeft = frDeadline - nowMs;
      const frHoursLeft = frTimeLeft / 3600000;

      if (frHoursLeft < 0) {
        alerts.push({
          type: 'sla_first_response_breached',
          message: `First response SLA breached by ${Math.abs(Math.round(frHoursLeft * 60))}min`,
          severity: 'critical',
        });
        newSlaStatus = 'breached';
      } else if (frHoursLeft < 0.5) {
        alerts.push({
          type: 'sla_first_response_at_risk',
          message: `First response SLA due in ${Math.round(frHoursLeft * 60)}min`,
          severity: 'warning',
        });
        if (newSlaStatus !== 'breached') newSlaStatus = 'at_risk';
      }
    }

    // ── Resolution deadline check ────────────────────────────────────────
    if (caseRow.sla_resolution_deadline) {
      const resDeadline = new Date(caseRow.sla_resolution_deadline).getTime();
      const resTimeLeft = resDeadline - nowMs;
      const resHoursLeft = resTimeLeft / 3600000;

      if (resHoursLeft < 0) {
        alerts.push({
          type: 'sla_resolution_breached',
          message: `Resolution SLA breached by ${Math.abs(Math.round(resHoursLeft))}h`,
          severity: 'critical',
        });
        newSlaStatus = 'breached';
      } else if (resHoursLeft < 2) {
        alerts.push({
          type: 'sla_resolution_at_risk',
          message: `Resolution SLA due in ${Math.round(resHoursLeft * 60)}min`,
          severity: 'warning',
        });
        if (newSlaStatus !== 'breached') newSlaStatus = 'at_risk';
      }
    }

    // ── Update case SLA status ───────────────────────────────────────────
    if (newSlaStatus !== caseRow.sla_status) {
      try {
        db.prepare(
          'UPDATE cases SET sla_status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
        ).run(newSlaStatus, now, caseId, tenantId);
      } catch { /* non-critical */ }
    }

    // ── Write alert events ───────────────────────────────────────────────
    for (const alert of alerts) {
      try {
        db.prepare(`
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
