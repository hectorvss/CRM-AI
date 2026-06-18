import { getSupabaseAdmin } from '../db/supabase.js';

export interface MentionScope { tenantId: string; workspaceId: string }

export interface CreateMentionPayload {
  conversation_id:   string;
  message_id?:       string | null;
  mentioned_user_id: string;
  mentioned_by_id?:  string | null;
  content_snippet?:  string | null;
}

export async function createMention(scope: MentionScope, payload: CreateMentionPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('mentions').insert({
    id:                randomUUID(),
    tenant_id:         scope.tenantId,
    workspace_id:      scope.workspaceId,
    conversation_id:   payload.conversation_id,
    message_id:        payload.message_id ?? null,
    mentioned_user_id: payload.mentioned_user_id,
    mentioned_by_id:   payload.mentioned_by_id ?? null,
    content_snippet:   payload.content_snippet ?? null,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function listMentionsForUser(
  scope: MentionScope,
  userId: string,
  filters?: { unreadOnly?: boolean; limit?: number },
) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('mentions').select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('mentioned_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);
  if (filters?.unreadOnly) q = q.eq('read', false);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function markMentionRead(scope: MentionScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('mentions').update({ read: true })
    .eq('id', id).eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

export async function markAllMentionsRead(scope: MentionScope, userId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('mentions').update({ read: true })
    .eq('tenant_id', scope.tenantId)
    .eq('mentioned_user_id', userId)
    .eq('read', false);
  if (error) throw error;
}
