import { getSupabaseAdmin } from '../db/supabase.js';

export interface FeedbackScope { tenantId: string; workspaceId: string }

export type FeedbackType = 'thumbs_up' | 'thumbs_down' | 'correction' | 'flagged' | 'escalated';

export interface CreateFeedbackPayload {
  feedback_type:    FeedbackType;
  conversation_id?: string | null;
  message_id?:      string | null;
  scenario_id?:     string | null;
  feedback_text?:   string | null;
  original_output?: unknown;
  corrected_output?: unknown;
  agent_id?:        string | null;
  contact_id?:      string | null;
}

// ── Submit & query ────────────────────────────────────────────────────────────

export async function submitFeedback(scope: FeedbackScope, payload: CreateFeedbackPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('ai_feedback')
    .insert({
      id:               randomUUID(),
      tenant_id:        scope.tenantId,
      workspace_id:     scope.workspaceId,
      feedback_type:    payload.feedback_type,
      conversation_id:  payload.conversation_id ?? null,
      message_id:       payload.message_id      ?? null,
      scenario_id:      payload.scenario_id     ?? null,
      feedback_text:    payload.feedback_text   ?? null,
      original_output:  payload.original_output  ?? null,
      corrected_output: payload.corrected_output ?? null,
      agent_id:         payload.agent_id         ?? null,
      contact_id:       payload.contact_id       ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface FeedbackFilters {
  feedbackType?: FeedbackType;
  scenarioId?:   string;
  agentId?:      string;
  from?:         string;
  to?:           string;
  limit?:        number;
}

export async function listFeedback(scope: FeedbackScope, filters?: FeedbackFilters) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('ai_feedback')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.feedbackType) q = q.eq('feedback_type', filters.feedbackType);
  if (filters?.scenarioId)   q = q.eq('scenario_id', filters.scenarioId);
  if (filters?.agentId)      q = q.eq('agent_id', filters.agentId);
  if (filters?.from)         q = q.gte('created_at', filters.from);
  if (filters?.to)           q = q.lte('created_at', filters.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getFeedbackSummary(scope: FeedbackScope) {
  const items = await listFeedback(scope, { limit: 10000 });
  const byType: Record<string, number> = {};
  for (const fb of items) {
    byType[fb.feedback_type] = (byType[fb.feedback_type] ?? 0) + 1;
  }
  const total = items.length;
  const positive = (byType.thumbs_up ?? 0);
  const negative = (byType.thumbs_down ?? 0) + (byType.flagged ?? 0);
  return { total, by_type: byType, positive, negative, approval_rate: total > 0 ? +(positive / total * 100).toFixed(1) : null };
}
