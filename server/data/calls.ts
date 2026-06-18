import { getSupabaseAdmin } from '../db/supabase.js';

export interface CallScope { tenantId: string; workspaceId: string }

export type CallDirection = 'inbound' | 'outbound';
export type CallStatus = 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'missed' | 'voicemail' | 'failed';

export interface CreateCallPayload {
  conversation_id?:  string | null;
  contact_id?:       string | null;
  inbox_id?:         string | null;
  agent_id?:         string | null;
  direction:         CallDirection;
  from_number?:      string | null;
  to_number?:        string | null;
  provider?:         string | null;
  provider_call_id?: string | null;
  metadata?:         Record<string, unknown>;
}

export async function createCall(scope: CallScope, payload: CreateCallPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('calls').insert({
    id:               randomUUID(),
    tenant_id:        scope.tenantId,
    workspace_id:     scope.workspaceId,
    conversation_id:  payload.conversation_id  ?? null,
    contact_id:       payload.contact_id       ?? null,
    inbox_id:         payload.inbox_id         ?? null,
    agent_id:         payload.agent_id         ?? null,
    direction:        payload.direction,
    status:           'initiated',
    from_number:      payload.from_number      ?? null,
    to_number:        payload.to_number        ?? null,
    provider:         payload.provider         ?? null,
    provider_call_id: payload.provider_call_id ?? null,
    metadata:         payload.metadata         ?? {},
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateCallStatus(
  scope: CallScope,
  id: string,
  status: CallStatus,
  extra?: {
    answered_at?: string;
    ended_at?:    string;
    duration_s?:  number;
    recording_url?: string;
    transcript?:  string;
  },
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { status };
  if (extra?.answered_at)    updates.answered_at    = extra.answered_at;
  if (extra?.ended_at)       updates.ended_at       = extra.ended_at;
  if (extra?.duration_s)     updates.duration_s     = extra.duration_s;
  if (extra?.recording_url)  updates.recording_url  = extra.recording_url;
  if (extra?.transcript)     updates.transcript     = extra.transcript;

  const { data, error } = await supabase.from('calls').update(updates)
    .eq('id', id).eq('tenant_id', scope.tenantId).select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCalls(
  scope: CallScope,
  filters?: {
    contactId?:  string;
    agentId?:    string;
    inboxId?:    string;
    status?:     CallStatus;
    direction?:  CallDirection;
    from?:       string;
    to?:         string;
    limit?:      number;
  },
) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('calls').select('*')
    .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .order('initiated_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.contactId)  q = q.eq('contact_id', filters.contactId);
  if (filters?.agentId)    q = q.eq('agent_id', filters.agentId);
  if (filters?.inboxId)    q = q.eq('inbox_id', filters.inboxId);
  if (filters?.status)     q = q.eq('status', filters.status);
  if (filters?.direction)  q = q.eq('direction', filters.direction);
  if (filters?.from)       q = q.gte('initiated_at', filters.from);
  if (filters?.to)         q = q.lte('initiated_at', filters.to);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getCall(scope: CallScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('calls').select('*')
    .eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Get call stats summary */
export async function getCallStats(
  scope: CallScope,
  filters?: { agentId?: string; from?: string; to?: string },
) {
  const calls = await listCalls(scope, { ...filters, limit: 10000 });
  const total     = calls.length;
  const answered  = calls.filter(c => ['in_progress','completed'].includes(c.status)).length;
  const missed    = calls.filter(c => c.status === 'missed').length;
  const avgDur    = calls.filter(c => c.duration_s).reduce((a, c) => a + (c.duration_s ?? 0), 0) / (answered || 1);
  return { total, answered, missed, avg_duration_s: +avgDur.toFixed(0) };
}
