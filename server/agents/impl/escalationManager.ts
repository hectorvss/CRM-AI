/**
 * server/agents/impl/escalationManager.ts
 *
 * Escalation Manager Agent — handles cases that exceed SLA or require
 * senior staff intervention.
 *
 * Evaluates the current case against escalation criteria:
 *   - SLA breach or near-breach
 *   - Consecutive agent failures in the chain
 *   - High/critical risk customers with unresolved conflicts
 *   - Approval requests stuck longer than threshold
 *
 * Writes escalation events to audit_events and updates case priority.
 * No Gemini — pure rule-based logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
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
    const db = getDb();
    const now = new Date().toISOString();
    const reasons: EscalationReason[] = [];

    // ── 1. SLA breach check ──────────────────────────────────────────────
    if (contextWindow.case.slaDue) {
      const slaDeadline = new Date(contextWindow.case.slaDue).getTime();
      const timeLeft = slaDeadline - Date.now();
      const hoursLeft = timeLeft / 3600000;

      if (hoursLeft < 0) {
        reasons.push({
          code: 'sla_breached',
          description: `SLA resolution deadline breached by ${Math.abs(Math.round(hoursLeft))}h`,
          severity: 'critical',
        });
      } else if (hoursLeft < 2) {
        reasons.push({
          code: 'sla_at_risk',
          description: `SLA resolution deadline in ${Math.round(hoursLeft * 60)}min`,
          severity: 'warning',
        });
      }
    }

    // ── 2. High-risk customer with active conflicts ──────────────────────
    const riskLevel = contextWindow.case.riskLevel;
    if ((riskLevel === 'high' || riskLevel === 'critical') && contextWindow.conflicts.length > 0) {
      reasons.push({
        code: 'high_risk_conflict',
        description: `${riskLevel} risk customer with ${contextWindow.conflicts.length} active conflict(s)`,
        severity: riskLevel === 'critical' ? 'critical' : 'warning',
      });
    }

    // ── 3. Stale approval requests ───────────────────────────────────────
    const staleApprovals = db.prepare(`
      SELECT COUNT(*) as count
      FROM approval_requests
      WHERE case_id = ? AND tenant_id = ? AND status = 'pending'
        AND created_at < datetime('now', '-4 hours')
    `).get(caseId, tenantId) as { count: number };

    if (staleApprovals.count > 0) {
      reasons.push({
        code: 'stale_approval',
        description: `${staleApprovals.count} approval request(s) pending >4 hours`,
        severity: 'warning',
      });
    }

    // ── 4. Consecutive agent failures (recent runs) ──────────────────────
    const recentFailures = db.prepare(`
      SELECT COUNT(*) as count
      FROM agent_runs
      WHERE case_id = ? AND tenant_id = ? AND status = 'failed'
        AND started_at >= datetime('now', '-1 hour')
    `).get(caseId, tenantId) as { count: number };

    if (recentFailures.count >= 3) {
      reasons.push({
        code: 'agent_chain_failures',
        description: `${recentFailures.count} agent failures in the last hour`,
        severity: 'critical',
      });
    }

    // ── 5. Case stuck in blocked status ──────────────────────────────────
    if (contextWindow.case.status === 'blocked') {
      const caseRow = db.prepare(
        'SELECT updated_at FROM cases WHERE id = ?'
      ).get(caseId) as { updated_at: string } | undefined;

      if (caseRow) {
        const blockedDuration = Date.now() - new Date(caseRow.updated_at).getTime();
        if (blockedDuration > 2 * 3600000) {
          reasons.push({
            code: 'blocked_too_long',
            description: `Case blocked for ${Math.round(blockedDuration / 3600000)}h`,
            severity: 'warning',
          });
        }
      }
    }

    // ── No escalation needed ─────────────────────────────────────────────
    if (reasons.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No escalation needed — all thresholds within limits',
        output: { escalated: false, reasonCount: 0 },
      };
    }

    // ── Write escalation events ──────────────────────────────────────────
    const hasCritical = reasons.some(r => r.severity === 'critical');

    for (const reason of reasons) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
          VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, workspaceId,
          `escalation:${reason.code}`,
          caseId,
          reason.description,
          JSON.stringify({ code: reason.code, severity: reason.severity, agentRunId: runId }),
          now,
        );
      } catch (err: any) {
        logger.error('Failed to write escalation event', { caseId, code: reason.code, error: err?.message });
      }
    }

    // ── Bump priority if critical escalation ─────────────────────────────
    if (hasCritical && contextWindow.case.priority !== 'urgent') {
      try {
        db.prepare(
          'UPDATE cases SET priority = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
        ).run('urgent', now, caseId, tenantId);
      } catch { /* non-critical */ }
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
