import { getSupabaseAdmin } from '../db/supabase.js';

export interface ReportingScope { tenantId: string; workspaceId: string }

export interface ReportingEventPayload {
  event_name:      string;
  conversation_id?: string | null;
  contact_id?:     string | null;
  agent_id?:       string | null;
  inbox_id?:       string | null;
  label_id?:       string | null;
  value_cents?:    number | null;
  metadata?:       Record<string, unknown>;
  occurred_at?:    string;
}

// ── Raw events ────────────────────────────────────────────────────────────────

export async function trackEvent(scope: ReportingScope, payload: ReportingEventPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { error } = await supabase.from('reporting_events').insert({
    id:              randomUUID(),
    tenant_id:       scope.tenantId,
    workspace_id:    scope.workspaceId,
    event_name:      payload.event_name,
    conversation_id: payload.conversation_id ?? null,
    contact_id:      payload.contact_id ?? null,
    agent_id:        payload.agent_id ?? null,
    inbox_id:        payload.inbox_id ?? null,
    label_id:        payload.label_id ?? null,
    value_cents:     payload.value_cents ?? null,
    metadata:        payload.metadata ?? {},
    occurred_at:     payload.occurred_at ?? new Date().toISOString(),
  });
  if (error) throw error;
}

export interface QueryEventsFilters {
  event_name?:     string;
  agent_id?:       string;
  inbox_id?:       string;
  from?:           string;
  to?:             string;
  limit?:          number;
}

export async function queryEvents(scope: ReportingScope, filters?: QueryEventsFilters) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('reporting_events')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('occurred_at', { ascending: false })
    .limit(filters?.limit ?? 500);

  if (filters?.event_name) q = q.eq('event_name', filters.event_name);
  if (filters?.agent_id)   q = q.eq('agent_id', filters.agent_id);
  if (filters?.inbox_id)   q = q.eq('inbox_id', filters.inbox_id);
  if (filters?.from)       q = q.gte('occurred_at', filters.from);
  if (filters?.to)         q = q.lte('occurred_at', filters.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ── Rollups ───────────────────────────────────────────────────────────────────

export interface RollupFilters {
  granularity: 'day' | 'week' | 'month';
  from:        string;   // ISO date YYYY-MM-DD
  to:          string;
  inbox_id?:   string;
  agent_id?:   string;
}

export async function queryRollups(scope: ReportingScope, filters: RollupFilters) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('reporting_rollups')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('granularity', filters.granularity)
    .gte('date', filters.from)
    .lte('date', filters.to)
    .order('date');

  if (filters.inbox_id) q = q.eq('inbox_id', filters.inbox_id);
  else                  q = q.is('inbox_id', null);

  if (filters.agent_id) q = q.eq('agent_id', filters.agent_id);
  else                  q = q.is('agent_id', null);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Upsert a rollup row (called by background aggregation job) */
export async function upsertRollup(
  scope: ReportingScope,
  row: {
    date:                    string;
    granularity:             'day' | 'week' | 'month';
    inbox_id?:               string | null;
    agent_id?:               string | null;
    label_id?:               string | null;
    conversations_opened?:   number;
    conversations_resolved?: number;
    conversations_reopened?: number;
    messages_sent?:          number;
    messages_received?:      number;
    avg_first_response_s?:   number | null;
    avg_resolution_s?:       number | null;
    csat_total?:             number;
    csat_sum?:               number;
    sla_breaches?:           number;
  },
) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { error } = await supabase.from('reporting_rollups').upsert({
    id:            randomUUID(),
    tenant_id:     scope.tenantId,
    workspace_id:  scope.workspaceId,
    date:          row.date,
    granularity:   row.granularity,
    inbox_id:      row.inbox_id ?? null,
    agent_id:      row.agent_id ?? null,
    label_id:      row.label_id ?? null,
    conversations_opened:    row.conversations_opened    ?? 0,
    conversations_resolved:  row.conversations_resolved  ?? 0,
    conversations_reopened:  row.conversations_reopened  ?? 0,
    messages_sent:           row.messages_sent           ?? 0,
    messages_received:       row.messages_received       ?? 0,
    avg_first_response_s:    row.avg_first_response_s    ?? null,
    avg_resolution_s:        row.avg_resolution_s        ?? null,
    csat_total:              row.csat_total               ?? 0,
    csat_sum:                row.csat_sum                 ?? 0,
    sla_breaches:            row.sla_breaches             ?? 0,
    computed_at:             new Date().toISOString(),
  }, {
    onConflict: 'tenant_id,workspace_id,date,granularity,inbox_id,agent_id,label_id',
  });
  if (error) throw error;
}

// ── Overview helper ───────────────────────────────────────────────────────────

/** Quick summary for the Reports dashboard tile */
export async function getReportOverview(scope: ReportingScope, days = 30) {
  const to   = new Date();
  const from = new Date(to.getTime() - days * 86400 * 1000);
  const rows = await queryRollups(scope, {
    granularity: 'day',
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  });

  return rows.reduce(
    (acc, r) => ({
      conversations_opened:   acc.conversations_opened   + r.conversations_opened,
      conversations_resolved: acc.conversations_resolved + r.conversations_resolved,
      messages_sent:          acc.messages_sent          + r.messages_sent,
      messages_received:      acc.messages_received      + r.messages_received,
      csat_total:             acc.csat_total             + r.csat_total,
      csat_sum:               acc.csat_sum               + r.csat_sum,
      sla_breaches:           acc.sla_breaches           + r.sla_breaches,
    }),
    {
      conversations_opened: 0, conversations_resolved: 0,
      messages_sent: 0, messages_received: 0,
      csat_total: 0, csat_sum: 0, sla_breaches: 0,
    },
  );
}
