/**
 * server/agents/impl/slaEscalationAgent.ts
 *
 * SLA & Escalation Agent — monitors aging cases, stalled resolutions,
 * delayed approvals, and blocked flows.
 *
 * Combines SLA monitoring with escalation logic:
 *   - Tracks SLA breach risk
 *   - Escalates blocked operational flows
 *   - Identifies stalled workflows and approval queues
 *   - Assigns escalation targets based on severity
 *
 * No Gemini — pure rule-based timer and threshold logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface EscalationEvent {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  target: string;
}

export const slaEscalationAgentImpl: AgentImplementation = {
  slug: 'sla-escalation-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();
    const nowMs = Date.now();

    const events: EscalationEvent[] = [];

    // ── 1. SLA deadline tracking ─────────────────────────────────────────
    const caseRow = db.prepare(`
      SELECT sla_first_response_deadline, sla_resolution_deadline,
             sla_first_response_met, assigned_user_id, assigned_team_id
      FROM cases WHERE id = ? AND tenant_id = ?
    `).get(caseId, tenantId) as any;

    if (caseRow) {
      // First response SLA
      if (caseRow.sla_first_response_deadline && !caseRow.sla_first_response_met) {
        const frDeadline = new Date(caseRow.sla_first_response_deadline).getTime();
        const frMinutesLeft = (frDeadline - nowMs) / 60000;

        if (frMinutesLeft < 0) {
          events.push({
            type: 'sla_first_response_breached',
            severity: 'critical',
            detail: `First response SLA breached ${Math.abs(Math.round(frMinutesLeft))}min ago`,
            target: caseRow.assigned_user_id ?? caseRow.assigned_team_id ?? 'unassigned',
          });
        } else if (frMinutesLeft < 30) {
          events.push({
            type: 'sla_first_response_warning',
            severity: 'warning',
            detail: `First response SLA due in ${Math.round(frMinutesLeft)}min`,
            target: caseRow.assigned_user_id ?? 'team_lead',
          });
        }
      }

      // Resolution SLA
      if (caseRow.sla_resolution_deadline) {
        const resDeadline = new Date(caseRow.sla_resolution_deadline).getTime();
        const resHoursLeft = (resDeadline - nowMs) / 3600000;

        if (resHoursLeft < 0) {
          events.push({
            type: 'sla_resolution_breached',
            severity: 'critical',
            detail: `Resolution SLA breached ${Math.abs(Math.round(resHoursLeft))}h ago`,
            target: 'team_lead',
          });
        } else if (resHoursLeft < 1) {
          events.push({
            type: 'sla_resolution_warning',
            severity: 'warning',
            detail: `Resolution SLA due in ${Math.round(resHoursLeft * 60)}min`,
            target: caseRow.assigned_user_id ?? 'team_lead',
          });
        }
      }
    }

    // ── 2. Stalled approval requests ─────────────────────────────────────
    const stalledApprovals = db.prepare(`
      SELECT id, type, created_at FROM approval_requests
      WHERE case_id = ? AND tenant_id = ? AND status = 'pending'
      ORDER BY created_at ASC
    `).all(caseId, tenantId) as any[];

    for (const approval of stalledApprovals) {
      const hoursWaiting = (nowMs - new Date(approval.created_at).getTime()) / 3600000;
      if (hoursWaiting > 8) {
        events.push({
          type: 'stalled_approval',
          severity: 'critical',
          detail: `Approval ${approval.id} (${approval.type}) pending for ${Math.round(hoursWaiting)}h`,
          target: 'approval_reviewer',
        });
      } else if (hoursWaiting > 2) {
        events.push({
          type: 'approval_aging',
          severity: 'warning',
          detail: `Approval ${approval.id} pending for ${Math.round(hoursWaiting)}h`,
          target: 'approval_reviewer',
        });
      }
    }

    // ── 3. Blocked case check ────────────────────────────────────────────
    if (contextWindow.case.status === 'blocked') {
      const lastActivity = new Date(contextWindow.case.lastActivity).getTime();
      const hoursBlocked = (nowMs - lastActivity) / 3600000;

      if (hoursBlocked > 4) {
        events.push({
          type: 'case_blocked_extended',
          severity: 'critical',
          detail: `Case blocked for ${Math.round(hoursBlocked)}h with no activity`,
          target: 'team_lead',
        });
      }
    }

    // ── 4. Unassigned case ───────────────────────────────────────────────
    if (!caseRow?.assigned_user_id && !caseRow?.assigned_team_id) {
      const caseAge = (nowMs - new Date(contextWindow.case.createdAt).getTime()) / 3600000;
      if (caseAge > 1) {
        events.push({
          type: 'unassigned_case',
          severity: 'warning',
          detail: `Case unassigned for ${Math.round(caseAge)}h`,
          target: 'routing_manager',
        });
      }
    }

    // ── Update SLA status ────────────────────────────────────────────────
    const hasCritical = events.some(e => e.severity === 'critical');
    const hasWarning = events.some(e => e.severity === 'warning');
    const newSlaStatus = hasCritical ? 'breached' : hasWarning ? 'at_risk' : 'on_track';

    try {
      db.prepare(
        'UPDATE cases SET sla_status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
      ).run(newSlaStatus, now, caseId, tenantId);
    } catch { /* non-critical */ }

    // ── Write escalation events ──────────────────────────────────────────
    for (const event of events) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          `sla_escalation:${event.type}`,
          event.detail,
          JSON.stringify({ severity: event.severity, target: event.target, agentRunId: runId }),
          now,
        );
      } catch (err: any) {
        logger.error('SLA escalation audit write failed', { type: event.type, error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 1.0,
      summary: events.length > 0
        ? `SLA escalation: ${events.length} event(s), status=${newSlaStatus}`
        : 'SLA & escalation check passed — all clear',
      output: {
        slaStatus: newSlaStatus,
        eventCount: events.length,
        events: events.map(e => ({ type: e.type, severity: e.severity, target: e.target })),
      },
    };
  },
};
