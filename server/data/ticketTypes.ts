import { getSupabaseAdmin } from '../db/supabase.js';

export interface TicketTypeScope {
  tenantId: string;
  workspaceId: string;
}

export type TicketCategory = 'customer' | 'follow_up' | 'back_office';

export interface CreateTicketTypePayload {
  name:        string;
  description?: string | null;
  icon?:       string | null;
  category?:   TicketCategory;
  created_by?: string | null;
}

export async function listTicketTypes(scope: TicketTypeScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getTicketType(scope: TicketTypeScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTicketType(scope: TicketTypeScope, payload: CreateTicketTypePayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('ticket_types')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name.trim(),
      description:  payload.description ?? null,
      icon:         payload.icon ?? null,
      category:     payload.category ?? 'customer',
      created_by:   payload.created_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTicketType(
  scope: TicketTypeScope,
  id: string,
  payload: Partial<CreateTicketTypePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name        !== undefined) updates.name = payload.name.trim();
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.icon        !== undefined) updates.icon = payload.icon;
  if (payload.category    !== undefined) updates.category = payload.category;

  const { data, error } = await supabase
    .from('ticket_types')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteTicketType(scope: TicketTypeScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('ticket_types')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
