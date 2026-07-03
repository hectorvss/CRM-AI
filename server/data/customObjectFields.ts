import { getSupabaseAdmin } from '../db/supabase.js';

export interface CustomObjectFieldScope {
  tenantId: string;
  workspaceId: string;
}

export type CustomFieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'email' | 'url';

export interface CreateCustomObjectFieldPayload {
  object_type_id: string;
  name:           string;
  field_key?:     string;
  field_type?:    CustomFieldType;
  required?:      boolean;
  sort_order?:    number;
}

function slugifyKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campo';
}

export async function listCustomObjectFields(scope: CustomObjectFieldScope, objectTypeId?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('custom_object_fields')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (objectTypeId) query = query.eq('object_type_id', objectTypeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCustomObjectField(scope: CustomObjectFieldScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('custom_object_fields')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCustomObjectField(scope: CustomObjectFieldScope, payload: CreateCustomObjectFieldPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const key = payload.field_key ? slugifyKey(payload.field_key) : slugifyKey(payload.name);
  const { data, error } = await supabase
    .from('custom_object_fields')
    .insert({
      id:             randomUUID(),
      tenant_id:      scope.tenantId,
      workspace_id:   scope.workspaceId,
      object_type_id: payload.object_type_id,
      name:           payload.name.trim(),
      field_key:      key,
      field_type:     payload.field_type ?? 'text',
      required:       payload.required ?? false,
      sort_order:     payload.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomObjectField(
  scope: CustomObjectFieldScope,
  id: string,
  payload: Partial<CreateCustomObjectFieldPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name       !== undefined) updates.name = payload.name.trim();
  if (payload.field_type !== undefined) updates.field_type = payload.field_type;
  if (payload.required   !== undefined) updates.required = payload.required;
  if (payload.sort_order !== undefined) updates.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('custom_object_fields')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCustomObjectField(scope: CustomObjectFieldScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('custom_object_fields')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
