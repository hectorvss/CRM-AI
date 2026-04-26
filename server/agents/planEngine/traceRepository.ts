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

export function getTraceMetrics(sessionId?: string): {
  total: number;
  success: number;
  partial: number;
  failed: number;
  pendingApproval: number;
  rejectedByPolicy: number;
  averageLatencyMs: number;
  averageSpanCount: number;
} {
  try {
    const db = getDb();
    const params: any[] = [];
    let query = 'SELECT * FROM super_agent_traces';
    if (sessionId) {
      query += ' WHERE session_id = ?';
      params.push(sessionId);
    }
    query += ' ORDER BY started_at DESC LIMIT 200';
    const rows = db.prepare(query).all(...params) as any[];
    const traces = rows.map((row) => ({
      status: row.status,
      spans: JSON.parse(row.spans_json || '[]') as any[],
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }));

    const total = traces.length;
    const success = traces.filter((trace) => trace.status === 'success').length;
    const partial = traces.filter((trace) => trace.status === 'partial').length;
    const failed = traces.filter((trace) => trace.status === 'failed').length;
    const pendingApproval = traces.filter((trace) => trace.status === 'pending_approval').length;
    const rejectedByPolicy = traces.filter((trace) => trace.status === 'rejected_by_policy').length;
    const averageLatencyMs = total
      ? Math.round(
        traces.reduce((sum, trace) => {
          const started = new Date(trace.startedAt).getTime();
          const ended = new Date(trace.endedAt).getTime();
          return sum + Math.max(0, ended - started);
        }, 0) / total,
      )
      : 0;
    const averageSpanCount = total
      ? Number((traces.reduce((sum, trace) => sum + trace.spans.length, 0) / total).toFixed(2))
      : 0;

    return {
      total,
      success,
      partial,
      failed,
      pendingApproval,
      rejectedByPolicy,
      averageLatencyMs,
      averageSpanCount,
    };
  } catch {
    return {
      total: 0,
      success: 0,
      partial: 0,
      failed: 0,
      pendingApproval: 0,
      rejectedByPolicy: 0,
      averageLatencyMs: 0,
      averageSpanCount: 0,
    };
  }
}
