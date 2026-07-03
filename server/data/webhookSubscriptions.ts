import { getSupabaseAdmin } from '../db/supabase.js';

export interface WebhookScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateWebhookPayload {
  url:         string;
  events?:     string[];
  active?:     boolean;
  created_by?: string | null;
}

export async function listWebhooks(scope: WebhookScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getWebhook(scope: WebhookScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createWebhook(scope: WebhookScope, payload: CreateWebhookPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      url:          payload.url.trim(),
      events:       payload.events ?? [],
      active:       payload.active ?? true,
      created_by:   payload.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateWebhook(
  scope: WebhookScope,
  id: string,
  payload: Partial<CreateWebhookPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.url    !== undefined) updates.url = payload.url.trim();
  if (payload.events !== undefined) updates.events = payload.events;
  if (payload.active !== undefined) updates.active = payload.active;

  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteWebhook(scope: WebhookScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('webhook_subscriptions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
