/**
 * server/agents/impl/auditLogger.ts
 *
 * Audit Logger Agent — writes structured audit events for agent chain outcomes.
 *
 * Runs last in every agent chain and records:
 *   - What trigger fired
 *   - Which agents ran and their outcomes (queried from agent_runs)
 *   - Case state snapshot at audit time
 *
 * No Gemini — pure DB writes.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const auditLoggerImpl: AgentImplementation = {
  slug: 'audit-logger',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId, triggerEvent } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    // ── Collect runs from this trigger chain ──────────────────────────────
    // All runs that started within the last 30 seconds for this case
    const recentRuns = db.prepare(`
      SELECT agent_id, outcome_status, confidence, tokens_used, started_at, error
      FROM agent_runs
      WHERE case_id = ? AND tenant_id = ?
        AND started_at >= datetime('now', '-30 seconds')
        AND id != ?
      ORDER BY started_at ASC
    `).all(caseId, tenantId, runId) as any[];

    // ── Case state snapshot ───────────────────────────────────────────────
    const snapshot = {
      caseId,
      caseNumber:    contextWindow.case.caseNumber,
      status:        contextWindow.case.status,
      priority:      contextWindow.case.priority,
      riskScore:     (contextWindow.case as any).riskScore ?? null,
      riskLevel:     contextWindow.case.riskLevel,
      approvalState: contextWindow.case.approvalState,
      conflictCount: contextWindow.conflicts.length,
      triggerEvent,
    };

    // ── Write audit event ─────────────────────────────────────────────────
    try {
      db.prepare(`
        INSERT INTO audit_events
          (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
        VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
      `).run(
        randomUUID(),
        tenantId,
        workspaceId,
        `agent_chain_completed:${triggerEvent}`,
        caseId,
        `Agent chain completed for trigger "${triggerEvent}" — ${recentRuns.length} agents ran`,
        JSON.stringify({
          triggerEvent,
          agentsRan: recentRuns.map(r => ({
            agentId: r.agent_id,
            status: r.outcome_status,
            confidence: r.confidence,
            tokens: r.tokens_used,
            error: r.error,
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

    // ── Update case last_activity_at ──────────────────────────────────────
    try {
      db.prepare(
        'UPDATE cases SET last_activity_at = ? WHERE id = ? AND tenant_id = ?'
      ).run(now, caseId, tenantId);
    } catch { /* non-critical */ }

    return {
      success: true,
      confidence: 1.0,
      summary: `Audit recorded: ${recentRuns.length} agents ran for "${triggerEvent}"`,
      output: {
        auditEventWritten: true,
        agentsInChain: recentRuns.length,
        triggerEvent,
      },
    };
  },
};
