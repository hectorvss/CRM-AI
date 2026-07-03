import { getSupabaseAdmin } from '../db/supabase.js';

export interface TopicScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateTopicPayload {
  name:   string;
  color?: string | null;
}

export async function listTopics(scope: TopicScope, filters?: { includeArchived?: boolean }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('topics')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');
  if (!filters?.includeArchived) query = query.eq('archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTopic(scope: TopicScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTopic(scope: TopicScope, payload: CreateTopicPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('topics')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name.trim(),
      color:        payload.color ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTopic(
  scope: TopicScope,
  id: string,
  payload: Partial<CreateTopicPayload & { archived: boolean }>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name     !== undefined) updates.name = payload.name.trim();
  if (payload.color    !== undefined) updates.color = payload.color;
  if (payload.archived !== undefined) updates.archived = payload.archived;

  const { data, error } = await supabase
    .from('topics')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteTopic(scope: TopicScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('topics')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
