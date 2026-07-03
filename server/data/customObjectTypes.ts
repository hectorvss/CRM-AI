import { getSupabaseAdmin } from '../db/supabase.js';

export interface CustomObjectTypeScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateCustomObjectTypePayload {
  name:        string;
  object_key:  string;
  description?: string | null;
  icon?:       string | null;
  created_by?: string | null;
}

function slugifyKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'objeto';
}

export async function listCustomObjectTypes(scope: CustomObjectTypeScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('custom_object_types')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCustomObjectType(scope: CustomObjectTypeScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('custom_object_types')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCustomObjectType(scope: CustomObjectTypeScope, payload: CreateCustomObjectTypePayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const key = payload.object_key ? slugifyKey(payload.object_key) : slugifyKey(payload.name);
  const { data, error } = await supabase
    .from('custom_object_types')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name.trim(),
      object_key:   key,
      description:  payload.description ?? null,
      icon:         payload.icon ?? null,
      created_by:   payload.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomObjectType(
  scope: CustomObjectTypeScope,
  id: string,
  payload: Partial<CreateCustomObjectTypePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name        !== undefined) updates.name = payload.name.trim();
  if (payload.object_key  !== undefined) updates.object_key = slugifyKey(payload.object_key);
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.icon        !== undefined) updates.icon = payload.icon;

  const { data, error } = await supabase
    .from('custom_object_types')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCustomObjectType(scope: CustomObjectTypeScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('custom_object_types')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
