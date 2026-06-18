import { getSupabaseAdmin } from '../db/supabase.js';
import type { AutomationAction } from './automationRules.js';

export interface MacroScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateMacroPayload {
  name:       string;
  actions:    AutomationAction[];
  visibility?: 'public' | 'private';
  created_by?: string | null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listMacros(
  scope: MacroScope,
  filters?: { visibility?: string; created_by?: string },
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('macros')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');

  if (filters?.visibility) query = query.eq('visibility', filters.visibility);
  if (filters?.created_by) query = query.eq('created_by', filters.created_by);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getMacro(scope: MacroScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('macros')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createMacro(scope: MacroScope, payload: CreateMacroPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('macros')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name.trim(),
      actions:      payload.actions ?? [],
      visibility:   payload.visibility ?? 'public',
      created_by:   payload.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateMacro(
  scope: MacroScope,
  id: string,
  payload: Partial<CreateMacroPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name       !== undefined) updates.name = payload.name.trim();
  if (payload.actions    !== undefined) updates.actions = payload.actions;
  if (payload.visibility !== undefined) updates.visibility = payload.visibility;

  const { data, error } = await supabase
    .from('macros')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteMacro(scope: MacroScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('macros')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

/** Increment run_count and record last execution time */
export async function recordMacroExecution(scope: MacroScope, id: string) {
  const supabase = getSupabaseAdmin();
  // Fetch current run_count then increment
  const { data: current } = await supabase
    .from('macros')
    .select('run_count')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  await supabase
    .from('macros')
    .update({
      run_count:   (current?.run_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
}
