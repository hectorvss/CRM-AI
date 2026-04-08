import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const auditLoggerImpl: AgentImplementation = {
  slug: 'audit-logger',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, runId, triggerEvent, workspaceId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    const recentRuns = db.prepare(`
      SELECT agent_id, outcome_status, confidence, tokens_used, evidence_refs, started_at
      FROM agent_runs
      WHERE case_id = ? AND tenant_id = ?
        AND started_at >= datetime('now', '-30 seconds')
        AND id != ?
      ORDER BY started_at ASC
    `).all(caseId, tenantId, runId) as any[];

    const snapshot = {
      caseId,
      caseNumber: contextWindow.case.caseNumber,
      status: contextWindow.case.status,
      priority: contextWindow.case.priority,
      riskScore: (contextWindow.case as any).riskScore ?? null,
      riskLevel: contextWindow.case.riskLevel,
      approvalState: contextWindow.case.approvalState,
      conflictCount: contextWindow.conflicts.length,
      triggerEvent,
    };

    try {
      db.prepare(`
        INSERT INTO audit_events
          (id, tenant_id, workspace_id, actor_id, actor_type, action, entity_type, entity_id, metadata, occurred_at)
        VALUES (?, ?, ?, 'audit-observability', 'system', ?, 'case', ?, ?, ?)
      `).run(
        randomUUID(),
        tenantId,
        workspaceId,
        `AGENT_CHAIN_COMPLETED:${triggerEvent}`,
        caseId,
        JSON.stringify({
          triggerEvent,
          agentsRan: recentRuns.map((row) => ({
            agentId: row.agent_id,
            status: row.outcome_status,
            confidence: row.confidence,
            tokens: row.tokens_used,
            evidence: row.evidence_refs,
          })),
          caseSnapshot: snapshot,
          auditRunId: runId,
        }),
        now,
      );
    } catch (err: any) {
      logger.error('Audit logger failed to write audit event', { caseId, error: err?.message });
      return { success: false, error: err?.message };
    }

    try {
      db.prepare(`
        UPDATE cases
        SET last_activity_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now, caseId, tenantId);
    } catch {
      // Non-critical.
    }

    return {
      success: true,
      confidence: 1,
      summary: `Audit recorded: ${recentRuns.length} agents ran for "${triggerEvent}"`,
      output: {
        auditEventWritten: true,
        agentsInChain: recentRuns.length,
        triggerEvent,
      },
    };
  },
};
