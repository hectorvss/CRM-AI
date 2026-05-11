import { getSupabaseAdmin } from '../db/supabase.js';

export interface CopilotScope { tenantId: string; workspaceId: string }

export interface CopilotMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
  ts:      string;
}

// ── Get or create thread ──────────────────────────────────────────────────────

export async function getOrCreateThread(
  scope: CopilotScope,
  conversationId: string,
  agentId: string,
) {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: fetchErr } = await supabase
    .from('copilot_threads')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('copilot_threads')
    .insert({
      id:              randomUUID(),
      tenant_id:       scope.tenantId,
      workspace_id:    scope.workspaceId,
      conversation_id: conversationId,
      agent_id:        agentId,
      messages:        [],
      context_used:    {},
      status:          'active',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getThread(
  scope: CopilotScope,
  conversationId: string,
  agentId: string,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('copilot_threads')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Append message ────────────────────────────────────────────────────────────

export async function appendMessage(
  scope: CopilotScope,
  conversationId: string,
  agentId: string,
  message: CopilotMessage,
) {
  const thread = await getOrCreateThread(scope, conversationId, agentId);
  const messages = [...((thread.messages as CopilotMessage[]) ?? []), message];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('copilot_threads')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('id', thread.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ── Close thread ──────────────────────────────────────────────────────────────

export async function closeThread(
  scope: CopilotScope,
  conversationId: string,
  agentId: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('copilot_threads')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('tenant_id', scope.tenantId)
    .eq('conversation_id', conversationId)
    .eq('agent_id', agentId);
  if (error) throw error;
}

// ── List threads ──────────────────────────────────────────────────────────────

export async function listThreads(
  scope: CopilotScope,
  filters?: { agentId?: string; conversationId?: string; status?: 'active' | 'closed'; limit?: number },
) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('copilot_threads')
    .select('id, conversation_id, agent_id, status, created_at, updated_at')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('updated_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.agentId)        q = q.eq('agent_id', filters.agentId);
  if (filters?.conversationId) q = q.eq('conversation_id', filters.conversationId);
  if (filters?.status)         q = q.eq('status', filters.status);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
