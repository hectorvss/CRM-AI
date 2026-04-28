/**
 * server/agents/planEngine/traceRepository.ts
 *
 * Persists ExecutionTraces to the super_agent_traces table (Supabase).
 * Traces are immutable once written (append-only, no updates).
 */

import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { ExecutionTrace } from './types.js';

export async function persistTrace(trace: ExecutionTrace): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('super_agent_traces').upsert({
      plan_id: trace.planId,
      session_id: trace.sessionId,
      tenant_id: trace.tenantId,
      workspace_id: trace.workspaceId ?? null,
      user_id: trace.userId ?? null,
      started_at: trace.startedAt,
      ended_at: trace.endedAt,
      status: trace.status,
      spans_json: JSON.stringify(trace.spans),
      summary: trace.summary,
      approval_ids_json: JSON.stringify(trace.approvalIds ?? []),
      policy_decisions_json: JSON.stringify(trace.policyDecisions ?? []),
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (err) {
    logger.warn('TraceRepository.persist failed', {
      planId: trace.planId,
      error: String(err),
    });
  }
}

export async function getTrace(planId: string): Promise<ExecutionTrace | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_traces')
      .select('*')
      .eq('plan_id', planId)
      .single();

    if (error || !data) return null;
    return rowToTrace(data);
  } catch (err) {
    logger.warn('TraceRepository.get failed', { planId, error: String(err) });
    return null;
  }
}

export async function listTracesForSession(sessionId: string, limit = 20): Promise<ExecutionTrace[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_traces')
      .select('*')
      .eq('session_id', sessionId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map(rowToTrace);
  } catch {
    return [];
  }
}

export async function getTraceMetrics(sessionId?: string): Promise<{
  total: number;
  success: number;
  partial: number;
  failed: number;
  pendingApproval: number;
  rejectedByPolicy: number;
  averageLatencyMs: number;
  averageSpanCount: number;
}> {
  const empty = {
    total: 0,
    success: 0,
    partial: 0,
    failed: 0,
    pendingApproval: 0,
    rejectedByPolicy: 0,
    averageLatencyMs: 0,
    averageSpanCount: 0,
  };
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('super_agent_traces')
      .select('status, spans_json, started_at, ended_at')
      .order('started_at', { ascending: false })
      .limit(200);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const traces = (data ?? []).map((row: any) => ({
      status: row.status,
      spans: JSON.parse(row.spans_json || '[]') as any[],
      startedAt: row.started_at,
      endedAt: row.ended_at,
    }));

    const total = traces.length;
    if (total === 0) return empty;

    const success = traces.filter((t) => t.status === 'success').length;
    const partial = traces.filter((t) => t.status === 'partial').length;
    const failed = traces.filter((t) => t.status === 'failed').length;
    const pendingApproval = traces.filter((t) => t.status === 'pending_approval').length;
    const rejectedByPolicy = traces.filter((t) => t.status === 'rejected_by_policy').length;
    const averageLatencyMs = Math.round(
      traces.reduce((sum, t) => {
        const started = new Date(t.startedAt).getTime();
        const ended = new Date(t.endedAt).getTime();
        return sum + Math.max(0, ended - started);
      }, 0) / total,
    );
    const averageSpanCount = Number(
      (traces.reduce((sum, t) => sum + t.spans.length, 0) / total).toFixed(2),
    );

    return { total, success, partial, failed, pendingApproval, rejectedByPolicy, averageLatencyMs, averageSpanCount };
  } catch {
    return empty;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function rowToTrace(row: any): ExecutionTrace {
  return {
    planId: row.plan_id,
    sessionId: row.session_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id ?? null,
    userId: row.user_id ?? null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : new Date(row.started_at).toISOString(),
    endedAt: typeof row.ended_at === 'string' ? row.ended_at : new Date(row.ended_at).toISOString(),
    status: row.status,
    spans: JSON.parse(row.spans_json || '[]'),
    summary: row.summary,
    approvalIds: JSON.parse(row.approval_ids_json || '[]'),
    policyDecisions: JSON.parse(row.policy_decisions_json || '[]'),
  };
}
