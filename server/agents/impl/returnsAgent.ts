/**
 * server/agents/impl/returnsAgent.ts
 *
 * Returns Agent — handles return lifecycle state, block/unblock logic,
 * and label/inspection/restock progression.
 *
 * Owns return progression, dependency checks and unblock logic once
 * refund and logistics truth are aligned.
 *
 * No Gemini — pure rule-based state machine.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface ReturnAction {
  returnId: string;
  action: string;
  detail: string;
}

export const returnsAgentImpl: AgentImplementation = {
  slug: 'returns-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    const returns = contextWindow.returns;
    if (returns.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No returns on case — returns agent skipped',
        output: { returnsProcessed: 0 },
      };
    }

    const actions: ReturnAction[] = [];
    let blockedCount = 0;
    let progressedCount = 0;

    for (const ret of returns) {
      const returnRow = db.prepare(`
        SELECT r.*, p.refund_status, p.refund_amount, p.amount as payment_amount
        FROM returns r
        LEFT JOIN payments p ON r.payment_id = p.id
        WHERE r.id = ? AND r.tenant_id = ?
      `).get(ret.id, tenantId) as any;

      if (!returnRow) continue;

      const currentStatus = returnRow.status ?? ret.status;
      const inspectionStatus = returnRow.inspection_status ?? ret.inspectionStatus;
      const refundStatus = returnRow.refund_status;
      const carrierStatus = ret.carrierStatus;

      // ── State machine progression ──────────────────────────────────
      if (currentStatus === 'requested') {
        // Auto-approve returns under $50 with good customer standing
        const isLowValue = (returnRow.payment_amount ?? 0) < 50;
        const isLowRisk = contextWindow.case.riskLevel === 'low';

        if (isLowValue && isLowRisk) {
          try {
            db.prepare('UPDATE returns SET status = ?, updated_at = ? WHERE id = ?')
              .run('approved', now, ret.id);
            actions.push({ returnId: ret.id, action: 'auto_approved', detail: 'Low value + low risk' });
            progressedCount++;
          } catch { /* non-critical */ }
        } else {
          actions.push({ returnId: ret.id, action: 'needs_review', detail: 'Requires manual approval' });
        }
      }

      if (currentStatus === 'approved' && !carrierStatus) {
        actions.push({ returnId: ret.id, action: 'awaiting_label', detail: 'Return approved, waiting for shipping label' });
      }

      if (currentStatus === 'in_transit' && carrierStatus === 'delivered') {
        // Item received — move to inspection
        try {
          db.prepare('UPDATE returns SET status = ?, inspection_status = ?, updated_at = ? WHERE id = ?')
            .run('received', 'pending', now, ret.id);
          actions.push({ returnId: ret.id, action: 'received', detail: 'Item delivered, pending inspection' });
          progressedCount++;
        } catch { /* non-critical */ }
      }

      if (inspectionStatus === 'passed' && refundStatus !== 'completed') {
        // Inspection passed — trigger refund if not already done
        actions.push({ returnId: ret.id, action: 'refund_pending', detail: 'Inspection passed, refund needs processing' });
      }

      if (inspectionStatus === 'failed') {
        actions.push({ returnId: ret.id, action: 'blocked_inspection', detail: 'Item failed inspection' });
        blockedCount++;
      }

      // Check for stuck returns (approved > 7 days with no movement)
      if (currentStatus === 'approved' && returnRow.updated_at) {
        const daysSinceUpdate = (Date.now() - new Date(returnRow.updated_at).getTime()) / 86400000;
        if (daysSinceUpdate > 7) {
          actions.push({ returnId: ret.id, action: 'stuck_warning', detail: `Return approved ${Math.round(daysSinceUpdate)} days ago with no progress` });
        }
      }
    }

    // ── Log actions to audit ─────────────────────────────────────────────
    if (actions.length > 0) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          'returns_lifecycle',
          `Returns agent: ${actions.length} action(s), ${progressedCount} progressed, ${blockedCount} blocked`,
          JSON.stringify({ actions, agentRunId: runId }),
          now,
        );
      } catch (err: any) {
        logger.error('Returns agent audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 0.9,
      summary: `Returns: ${returns.length} return(s), ${progressedCount} progressed, ${blockedCount} blocked`,
      output: {
        returnsProcessed: returns.length,
        progressed: progressedCount,
        blocked: blockedCount,
        actions,
      },
    };
  },
};
