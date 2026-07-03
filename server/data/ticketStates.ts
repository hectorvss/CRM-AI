import { getSupabaseAdmin } from '../db/supabase.js';

export interface TicketStateScope {
  tenantId: string;
  workspaceId: string;
}

export type TicketStateCategory = 'submitted' | 'in_progress' | 'waiting_customer' | 'resolved';

export interface CreateTicketStatePayload {
  internal_label: string;
  client_label?:  string | null;
  category?:      TicketStateCategory;
  color?:         string | null;
  sort_order?:    number;
}

export async function listTicketStates(scope: TicketStateScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('ticket_states')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getTicketState(scope: TicketStateScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('ticket_states')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTicketState(scope: TicketStateScope, payload: CreateTicketStatePayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('ticket_states')
    .insert({
      id:             randomUUID(),
      tenant_id:      scope.tenantId,
      workspace_id:   scope.workspaceId,
      internal_label: payload.internal_label.trim(),
      client_label:   payload.client_label ?? null,
      category:       payload.category ?? 'in_progress',
      color:          payload.color ?? null,
      sort_order:     payload.sort_order ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTicketState(
  scope: TicketStateScope,
  id: string,
  payload: Partial<CreateTicketStatePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.internal_label !== undefined) updates.internal_label = payload.internal_label.trim();
  if (payload.client_label   !== undefined) updates.client_label = payload.client_label;
  if (payload.category       !== undefined) updates.category = payload.category;
  if (payload.color          !== undefined) updates.color = payload.color;
  if (payload.sort_order     !== undefined) updates.sort_order = payload.sort_order;

  const { data, error } = await supabase
    .from('ticket_states')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteTicketState(scope: TicketStateScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('ticket_states')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
