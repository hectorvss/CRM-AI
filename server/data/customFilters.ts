import { getSupabaseAdmin } from '../db/supabase.js';

export interface FilterScope { tenantId: string; workspaceId: string }

export interface CreateCustomFilterPayload {
  owner_id:    string;
  name:        string;
  entity_type: 'conversation' | 'contact' | 'company';
  filters:     unknown[];
  sort_by?:    string | null;
  sort_dir?:   'asc' | 'desc' | null;
  shared?:     boolean;
}

export async function listCustomFilters(
  scope: FilterScope,
  ownerId: string,
  entityType?: 'conversation' | 'contact' | 'company',
) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('custom_filters').select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .or(`owner_id.eq.${ownerId},shared.eq.true`)
    .order('created_at');
  if (entityType) q = q.eq('entity_type', entityType);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createCustomFilter(scope: FilterScope, payload: CreateCustomFilterPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('custom_filters').insert({
    id:           randomUUID(),
    tenant_id:    scope.tenantId,
    workspace_id: scope.workspaceId,
    owner_id:     payload.owner_id,
    name:         payload.name,
    entity_type:  payload.entity_type,
    filters:      payload.filters,
    sort_by:      payload.sort_by ?? null,
    sort_dir:     payload.sort_dir ?? null,
    shared:       payload.shared ?? false,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateCustomFilter(
  scope: FilterScope, id: string, payload: Partial<CreateCustomFilterPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const keys: (keyof CreateCustomFilterPayload)[] = ['name','entity_type','filters','sort_by','sort_dir','shared'];
  for (const k of keys) if (payload[k] !== undefined) updates[k] = payload[k];
  const { data, error } = await supabase.from('custom_filters').update(updates)
    .eq('id', id).eq('tenant_id', scope.tenantId)
    .select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCustomFilter(scope: FilterScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('custom_filters').delete()
    .eq('id', id).eq('tenant_id', scope.tenantId);
  if (error) throw error;
}
