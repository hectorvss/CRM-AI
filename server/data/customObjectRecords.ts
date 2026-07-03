import { getSupabaseAdmin } from '../db/supabase.js';

export interface CustomObjectRecordScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateCustomObjectRecordPayload {
  object_type_id: string;
  data:           Record<string, any>;
  created_by?:    string | null;
}

export async function listCustomObjectRecords(scope: CustomObjectRecordScope, objectTypeId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('custom_object_records')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('object_type_id', objectTypeId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function getCustomObjectRecord(scope: CustomObjectRecordScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('custom_object_records')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCustomObjectRecord(scope: CustomObjectRecordScope, payload: CreateCustomObjectRecordPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('custom_object_records')
    .insert({
      id:             randomUUID(),
      tenant_id:      scope.tenantId,
      workspace_id:   scope.workspaceId,
      object_type_id: payload.object_type_id,
      data:           payload.data ?? {},
      created_by:     payload.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomObjectRecord(
  scope: CustomObjectRecordScope,
  id: string,
  data: Record<string, any>,
) {
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from('custom_object_records')
    .update({ data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return row;
}

export async function deleteCustomObjectRecord(scope: CustomObjectRecordScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('custom_object_records')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
