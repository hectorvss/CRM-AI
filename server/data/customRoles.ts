import { getSupabaseAdmin } from '../db/supabase.js';

export interface RoleScope { tenantId: string; workspaceId: string }

export interface CreateCustomRolePayload {
  name:         string;
  description?: string | null;
  permissions:  string[];
}

export async function listCustomRoles(scope: RoleScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('custom_roles').select('*')
    .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .order('is_system', { ascending: false }).order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getCustomRole(scope: RoleScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('custom_roles').select('*')
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCustomRole(scope: RoleScope, payload: CreateCustomRolePayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('custom_roles').insert({
    id:           randomUUID(),
    tenant_id:    scope.tenantId,
    workspace_id: scope.workspaceId,
    name:         payload.name,
    description:  payload.description ?? null,
    permissions:  payload.permissions,
    is_system:    false,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateCustomRole(
  scope: RoleScope, id: string, payload: Partial<CreateCustomRolePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined)        updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.permissions !== undefined) updates.permissions = payload.permissions;
  const { data, error } = await supabase.from('custom_roles').update(updates)
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .eq('is_system', false)   // can't update system roles
    .select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCustomRole(scope: RoleScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('custom_roles').delete()
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('is_system', false);
  if (error) throw error;
}

/** Check if a role grants a specific permission */
export async function roleHasPermission(
  scope: RoleScope, roleId: string, permission: string,
): Promise<boolean> {
  const role = await getCustomRole(scope, roleId);
  if (!role) return false;
  const perms = role.permissions as string[];
  return perms.includes('*') || perms.includes(permission);
}
