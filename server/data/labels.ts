import { getSupabaseAdmin } from '../db/supabase.js';

export interface LabelScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateLabelPayload {
  name:        string;
  color?:      string | null;
  created_by?: string | null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listLabels(scope: LabelScope, filters?: { q?: string }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('labels')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');

  if (filters?.q) query = query.ilike('name', `%${filters.q}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getLabel(scope: LabelScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createLabel(scope: LabelScope, payload: CreateLabelPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('labels')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name.trim(),
      color:        payload.color ?? null,
      created_by:   payload.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateLabel(
  scope: LabelScope,
  id: string,
  payload: Partial<CreateLabelPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name  !== undefined) updates.name = payload.name.trim();
  if (payload.color !== undefined) updates.color = payload.color;

  const { data, error } = await supabase
    .from('labels')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteLabel(scope: LabelScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('labels')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
