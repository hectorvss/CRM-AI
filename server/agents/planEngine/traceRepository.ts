/**
 * server/agents/planEngine/traceRepository.ts
 *
 * Persists ExecutionTraces to the super_agent_traces table.
 * Traces are immutable once written (append-only, no updates).
 */

import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { ExecutionTrace } from './types.js';

export function persistTrace(trace: ExecutionTrace): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR IGNORE INTO super_agent_traces
        (plan_id, session_id, tenant_id, workspace_id, user_id,
         started_at, ended_at, status, spans_json, summary,
         approval_ids_json, policy_decisions_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trace.planId,
      trace.sessionId,
      trace.tenantId,
      trace.workspaceId ?? null,
      trace.userId ?? null,
      trace.startedAt,
      trace.endedAt,
      trace.status,
      JSON.stringify(trace.spans),
      trace.summary,
      JSON.stringify(trace.approvalIds ?? []),
      JSON.stringify(trace.policyDecisions ?? []),
      new Date().toISOString(),
    );
  } catch (err) {
    logger.warn('TraceRepository.persist failed', {
      planId: trace.planId,
      error: String(err),
    });
  }
}

export function getTrace(planId: string): ExecutionTrace | null {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM super_agent_traces WHERE plan_id = ?')
      .get(planId) as any;
    if (!row) return null;
    return {
      planId: row.plan_id,
      sessionId: row.session_id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id ?? null,
      userId: row.user_id ?? null,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      spans: JSON.parse(row.spans_json || '[]'),
      summary: row.summary,
      approvalIds: JSON.parse(row.approval_ids_json || '[]'),
      policyDecisions: JSON.parse(row.policy_decisions_json || '[]'),
    };
  } catch (err) {
    logger.warn('TraceRepository.get failed', { planId, error: String(err) });
    return null;
  }
}

export function listTracesForSession(sessionId: string, limit = 20): ExecutionTrace[] {
  try {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM super_agent_traces WHERE session_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(sessionId, limit) as any[];
    return rows.map((row) => ({
      planId: row.plan_id,
      sessionId: row.session_id,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id ?? null,
      userId: row.user_id ?? null,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      spans: JSON.parse(row.spans_json || '[]'),
      summary: row.summary,
      approvalIds: JSON.parse(row.approval_ids_json || '[]'),
      policyDecisions: JSON.parse(row.policy_decisions_json || '[]'),
    }));
  } catch {
    return [];
  }
}
