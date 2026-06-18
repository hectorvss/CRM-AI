import { getSupabaseAdmin } from '../db/supabase.js';

export interface CannedScope {
  tenantId: string;
  workspaceId: string;
}

export interface CreateCannedResponsePayload {
  short_code: string;
  content:    string;
  category?:  string | null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listCannedResponses(
  scope: CannedScope,
  filters?: { q?: string; category?: string },
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('canned_responses')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('usage_count', { ascending: false })
    .order('short_code');

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.q) {
    // ilike search on short_code and content
    query = query.or(
      `short_code.ilike.%${filters.q}%,content.ilike.%${filters.q}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getCannedResponse(scope: CannedScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('canned_responses')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Look up a canned response by short_code (used by the inline picker) */
export async function findByShortCode(scope: CannedScope, shortCode: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('canned_responses')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('short_code', shortCode.toLowerCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Search for completions as the agent types /short… */
export async function searchByPrefix(scope: CannedScope, prefix: string, limit = 5) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('canned_responses')
    .select('id, short_code, content, category')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .ilike('short_code', `${prefix.toLowerCase()}%`)
    .order('usage_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function createCannedResponse(
  scope: CannedScope,
  payload: CreateCannedResponsePayload,
) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('canned_responses')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      short_code:   payload.short_code.toLowerCase().trim(),
      content:      payload.content.trim(),
      category:     payload.category ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCannedResponse(
  scope: CannedScope,
  id: string,
  payload: Partial<CreateCannedResponsePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.short_code !== undefined) updates.short_code = payload.short_code.toLowerCase().trim();
  if (payload.content    !== undefined) updates.content = payload.content.trim();
  if (payload.category   !== undefined) updates.category = payload.category;

  const { data, error } = await supabase
    .from('canned_responses')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCannedResponse(scope: CannedScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('canned_responses')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

/** Increment usage_count when a canned response is inserted in a message */
export async function recordUsage(scope: CannedScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data: current } = await supabase
    .from('canned_responses')
    .select('usage_count')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  await supabase
    .from('canned_responses')
    .update({
      usage_count:  (current?.usage_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
}
