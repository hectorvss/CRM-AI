import { getSupabaseAdmin } from '../db/supabase.js';

export interface CsatScope { tenantId: string; workspaceId: string }

export interface SubmitCsatPayload {
  conversation_id:    string;
  rating:             number;         // 1–5
  feedback_message?:  string | null;
  contact_id?:        string | null;
  assigned_agent_id?: string | null;
  inbox_id?:          string | null;
  survey_token?:      string | null;
}

// ── CSAT Responses ────────────────────────────────────────────────────────────

export async function submitCsatResponse(scope: CsatScope, payload: SubmitCsatPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('csat_survey_responses')
    .insert({
      id:                 randomUUID(),
      tenant_id:          scope.tenantId,
      workspace_id:       scope.workspaceId,
      conversation_id:    payload.conversation_id,
      contact_id:         payload.contact_id ?? null,
      assigned_agent_id:  payload.assigned_agent_id ?? null,
      inbox_id:           payload.inbox_id ?? null,
      rating:             payload.rating,
      feedback_message:   payload.feedback_message ?? null,
      survey_token:       payload.survey_token ?? null,
      submitted_at:       new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface CsatFilters {
  agentId?:  string;
  inboxId?:  string;
  from?:     string;   // ISO date
  to?:       string;   // ISO date
  limit?:    number;
}

export async function listCsatResponses(scope: CsatScope, filters?: CsatFilters) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('csat_survey_responses')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('submitted_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.agentId) query = query.eq('assigned_agent_id', filters.agentId);
  if (filters?.inboxId) query = query.eq('inbox_id', filters.inboxId);
  if (filters?.from)    query = query.gte('submitted_at', filters.from);
  if (filters?.to)      query = query.lte('submitted_at', filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Aggregate CSAT stats: count per rating, average, total */
export async function getCsatSummary(scope: CsatScope, filters?: CsatFilters) {
  const responses = await listCsatResponses(scope, { ...filters, limit: 10000 });
  const total = responses.length;
  const sum   = responses.reduce((acc, r) => acc + r.rating, 0);
  const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of responses) byRating[r.rating] = (byRating[r.rating] ?? 0) + 1;

  return {
    total,
    average:  total > 0 ? +(sum / total).toFixed(2) : null,
    by_rating: byRating,
    positive_pct: total > 0 ? +((byRating[4] + byRating[5]) / total * 100).toFixed(1) : null,
  };
}

/** Look up a single response by its survey_token (public endpoint for survey link) */
export async function getCsatByToken(tenantId: string, token: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('csat_survey_responses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('survey_token', token)
    .maybeSingle();
  if (error) throw error;
  return data;
}
