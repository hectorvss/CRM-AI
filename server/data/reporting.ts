/**
 * server/data/reporting.ts
 *
 * Data layer for the /api/reporting endpoints.
 * Backed by Supabase — tables: canonical_events, usage_events.
 * Falls back to in-memory/empty responses when tables don't exist yet.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportingScope {
  tenantId: string;
  workspaceId: string;
}

export interface TrackEventInput {
  event_name: string;
  conversation_id?: string | null;
  contact_id?: string | null;
  agent_id?: string | null;
  inbox_id?: string | null;
  label_id?: string | null;
  value_cents?: number | null;
  metadata?: Record<string, unknown>;
  occurred_at?: string;
}

export interface QueryEventsInput {
  event_name?: string;
  agent_id?: string;
  inbox_id?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface QueryRollupsInput {
  granularity: 'day' | 'week' | 'month';
  from: string;
  to: string;
  inbox_id?: string;
  agent_id?: string;
}

export interface UpsertRollupInput {
  date: string;
  granularity: 'day' | 'week' | 'month';
  inbox_id?: string | null;
  agent_id?: string | null;
  label_id?: string | null;
  conversations_opened?: number;
  conversations_resolved?: number;
  conversations_reopened?: number;
  messages_sent?: number;
  messages_received?: number;
  avg_first_response_s?: number | null;
  avg_resolution_s?: number | null;
  csat_total?: number;
  csat_sum?: number;
  sla_breaches?: number;
}

// ── trackEvent ────────────────────────────────────────────────────────────────

export async function trackEvent(
  scope: ReportingScope,
  input: TrackEventInput,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('canonical_events').insert({
      id:              crypto.randomUUID(),
      tenant_id:       scope.tenantId,
      workspace_id:    scope.workspaceId,
      event_name:      input.event_name,
      conversation_id: input.conversation_id ?? null,
      contact_id:      input.contact_id ?? null,
      agent_id:        input.agent_id ?? null,
      inbox_id:        input.inbox_id ?? null,
      label_id:        input.label_id ?? null,
      value_cents:     input.value_cents ?? null,
      metadata:        JSON.stringify(input.metadata ?? {}),
      occurred_at:     input.occurred_at ?? new Date().toISOString(),
    });
    if (error && error.code !== '42P01') {
      logger.warn('reporting.trackEvent: insert failed', { error: error.message });
    }
  } catch (err: any) {
    logger.warn('reporting.trackEvent: error', { error: err?.message });
  }
}

// ── queryEvents ───────────────────────────────────────────────────────────────

export async function queryEvents(
  scope: ReportingScope,
  input: QueryEventsInput,
): Promise<{ events: unknown[]; total: number }> {
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from('canonical_events')
      .select('*', { count: 'exact' })
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .order('occurred_at', { ascending: false })
      .limit(input.limit ?? 500);

    if (input.event_name) q = q.eq('event_name', input.event_name);
    if (input.agent_id)   q = q.eq('agent_id', input.agent_id);
    if (input.inbox_id)   q = q.eq('inbox_id', input.inbox_id);
    if (input.from)       q = q.gte('occurred_at', input.from);
    if (input.to)         q = q.lte('occurred_at', input.to);

    const { data, count, error } = await q;
    if (error && error.code !== '42P01') {
      logger.warn('reporting.queryEvents: query failed', { error: error.message });
    }
    return { events: data ?? [], total: count ?? 0 };
  } catch (err: any) {
    logger.warn('reporting.queryEvents: error', { error: err?.message });
    return { events: [], total: 0 };
  }
}

// ── queryRollups ──────────────────────────────────────────────────────────────

export async function queryRollups(
  scope: ReportingScope,
  input: QueryRollupsInput,
): Promise<{ rollups: unknown[] }> {
  try {
    // Try usage_events table first (canonical reporting table in schema)
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from('usage_events')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .gte('created_at', input.from)
      .lte('created_at', input.to)
      .order('created_at', { ascending: true });

    if (input.agent_id) q = q.eq('agent_id', input.agent_id);

    const { data, error } = await q;
    if (error && error.code !== '42P01') {
      logger.warn('reporting.queryRollups: query failed', { error: error.message });
    }

    // Build synthetic rollup buckets from usage_events grouped by date
    const rows = data ?? [];
    const buckets: Record<string, {
      date: string; conversations_opened: number; conversations_resolved: number;
      messages_sent: number; messages_received: number; csat_total: number; csat_sum: number;
    }> = {};

    for (const row of rows) {
      const d = (row as any).created_at?.slice(0, 10) ?? '';
      if (!d) continue;
      if (!buckets[d]) buckets[d] = {
        date: d, conversations_opened: 0, conversations_resolved: 0,
        messages_sent: 0, messages_received: 0, csat_total: 0, csat_sum: 0,
      };
      const ev = (row as any).event_type ?? '';
      if (ev === 'conversation_opened')   buckets[d].conversations_opened++;
      if (ev === 'conversation_resolved') buckets[d].conversations_resolved++;
      if (ev === 'message_sent')          buckets[d].messages_sent++;
      if (ev === 'message_received')      buckets[d].messages_received++;
    }

    return { rollups: Object.values(buckets) };
  } catch (err: any) {
    logger.warn('reporting.queryRollups: error', { error: err?.message });
    return { rollups: [] };
  }
}

// ── upsertRollup ──────────────────────────────────────────────────────────────

export async function upsertRollup(
  scope: ReportingScope,
  input: UpsertRollupInput,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('usage_events').insert({
      id:           crypto.randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      event_type:   `rollup_${input.granularity}`,
      agent_id:     input.agent_id ?? null,
      metadata:     JSON.stringify(input),
      created_at:   new Date(input.date).toISOString(),
    });
    if (error && error.code !== '42P01') {
      logger.warn('reporting.upsertRollup: insert failed', { error: error.message });
    }
  } catch (err: any) {
    logger.warn('reporting.upsertRollup: error', { error: err?.message });
  }
}

// ── getReportOverview ─────────────────────────────────────────────────────────

export async function getReportOverview(
  scope: ReportingScope,
  days: number = 30,
): Promise<{
  period_days: number;
  conversations_opened: number;
  conversations_resolved: number;
  avg_first_response_s: number | null;
  avg_resolution_s: number | null;
  csat_avg: number | null;
  sla_breach_rate: number | null;
  top_inboxes: unknown[];
  top_agents: unknown[];
}> {
  const from = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const supabase = getSupabaseAdmin();

    // Pull cases opened/resolved in the period
    const { data: cases } = await supabase
      .from('cases')
      .select('id, status, created_at, first_response_at, resolution_at, assigned_user_id, sla_status')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .gte('created_at', from);

    const rows = cases ?? [];
    const opened   = rows.length;
    const resolved = rows.filter((c: any) => ['resolved','closed'].includes(c.status)).length;

    const responseTimes = rows
      .filter((c: any) => c.first_response_at && c.created_at)
      .map((c: any) => (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 1000);
    const avgFirstResponse = responseTimes.length
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;

    const resolutionTimes = rows
      .filter((c: any) => c.resolution_at && c.created_at)
      .map((c: any) => (new Date(c.resolution_at).getTime() - new Date(c.created_at).getTime()) / 1000);
    const avgResolution = resolutionTimes.length
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : null;

    const slaBreach = rows.filter((c: any) => c.sla_status === 'breached').length;
    const slaBreachRate = rows.length ? slaBreach / rows.length : null;

    // CSAT from csat_surveys table
    let csatAvg: number | null = null;
    try {
      const { data: csat } = await supabase
        .from('csat_surveys')
        .select('rating')
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId)
        .gte('created_at', from);
      const ratings = (csat ?? []).map((r: any) => Number(r.rating)).filter(n => !isNaN(n));
      csatAvg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    } catch { /* csat_surveys may not exist */ }

    // Top agents by resolved count
    const agentCounts: Record<string, number> = {};
    for (const c of rows.filter((c: any) => c.assigned_user_id && ['resolved','closed'].includes(c.status))) {
      agentCounts[(c as any).assigned_user_id] = (agentCounts[(c as any).assigned_user_id] ?? 0) + 1;
    }
    const topAgents = Object.entries(agentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ agent_id: id, resolved: count }));

    return {
      period_days:            days,
      conversations_opened:   opened,
      conversations_resolved: resolved,
      avg_first_response_s:   avgFirstResponse,
      avg_resolution_s:       avgResolution,
      csat_avg:               csatAvg,
      sla_breach_rate:        slaBreachRate,
      top_inboxes:            [],
      top_agents:             topAgents,
    };
  } catch (err: any) {
    logger.warn('reporting.getReportOverview: error', { error: err?.message });
    return {
      period_days: days, conversations_opened: 0, conversations_resolved: 0,
      avg_first_response_s: null, avg_resolution_s: null, csat_avg: null,
      sla_breach_rate: null, top_inboxes: [], top_agents: [],
    };
  }
}
