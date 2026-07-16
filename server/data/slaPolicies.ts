import { getSupabaseAdmin } from '../db/supabase.js';

export interface SlaScope { tenantId: string; workspaceId: string }

export interface CreateSlaPolicyPayload {
  name:                 string;
  description?:         string | null;
  first_response_time?: number | null;
  next_response_time?:  number | null;
  resolution_time?:     number | null;
  business_hours?:      boolean;
}

// ── SLA Policies CRUD ─────────────────────────────────────────────────────────

export async function listSlaPolicies(scope: SlaScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sla_policies')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function getSlaPolicy(scope: SlaScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sla_policies')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createSlaPolicy(scope: SlaScope, payload: CreateSlaPolicyPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('sla_policies')
    .insert({
      id:                   randomUUID(),
      tenant_id:            scope.tenantId,
      workspace_id:         scope.workspaceId,
      name:                 payload.name,
      description:          payload.description ?? null,
      first_response_time:  payload.first_response_time ?? null,
      next_response_time:   payload.next_response_time ?? null,
      resolution_time:      payload.resolution_time ?? null,
      business_hours:       payload.business_hours ?? false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateSlaPolicy(
  scope: SlaScope,
  id: string,
  payload: Partial<CreateSlaPolicyPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name                !== undefined) updates.name = payload.name;
  if (payload.description         !== undefined) updates.description = payload.description;
  if (payload.first_response_time !== undefined) updates.first_response_time = payload.first_response_time;
  if (payload.next_response_time  !== undefined) updates.next_response_time = payload.next_response_time;
  if (payload.resolution_time     !== undefined) updates.resolution_time = payload.resolution_time;
  if (payload.business_hours      !== undefined) updates.business_hours = payload.business_hours;

  const { data, error } = await supabase
    .from('sla_policies')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteSlaPolicy(scope: SlaScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('sla_policies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Applied SLA operations ────────────────────────────────────────────────────

/**
 * Apply an SLA policy to a conversation. Computes deadlines based on policy
 * thresholds starting from `startAt` (defaults to now).
 */
export async function applySlaToConversation(
  scope: SlaScope,
  conversationId: string,
  policyId: string,
  startAt: Date = new Date(),
) {
  const supabase = getSupabaseAdmin();
  const policy = await getSlaPolicy(scope, policyId);
  if (!policy) throw new Error('SLA policy not found');

  const deadline = (secs: number | null): string | null =>
    secs ? new Date(startAt.getTime() + secs * 1000).toISOString() : null;

  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('applied_slas')
    .upsert({
      id:                       randomUUID(),
      tenant_id:                scope.tenantId,
      workspace_id:             scope.workspaceId,
      conversation_id:          conversationId,
      sla_policy_id:            policyId,
      first_response_deadline:  deadline(policy.first_response_time),
      next_response_deadline:   deadline(policy.next_response_time),
      resolution_deadline:      deadline(policy.resolution_time),
      first_response_breached:  false,
      next_response_breached:   false,
      resolution_breached:      false,
      applied_at:               new Date().toISOString(),
    }, { onConflict: 'conversation_id' })
    .select('*')
    .single();
  if (error) throw error;

  // Log the sla_applied event
  await logSlaEvent(scope, {
    conversationId, appliedSlaId: data.id, eventType: 'sla_applied',
    metadata: { policyId },
  });

  return data;
}

export async function getAppliedSla(scope: SlaScope, conversationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('applied_slas')
    .select('*, sla_policies(*)')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Mark a breach or completion on an applied SLA */
export async function markSlaEvent(
  scope: SlaScope,
  conversationId: string,
  eventType: 'first_response_met' | 'first_response_breached' | 'next_response_met' | 'next_response_breached' | 'resolution_met' | 'resolution_breached',
) {
  const supabase = getSupabaseAdmin();
  const applied = await getAppliedSla(scope, conversationId);
  if (!applied) return null;

  // Update breach flag if it's a breach event
  const breachUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (eventType === 'first_response_breached') breachUpdates.first_response_breached = true;
  if (eventType === 'next_response_breached')  breachUpdates.next_response_breached  = true;
  if (eventType === 'resolution_breached')     breachUpdates.resolution_breached     = true;

  if (Object.keys(breachUpdates).length > 1) {
    await supabase.from('applied_slas').update(breachUpdates).eq('id', applied.id);
  }

  await logSlaEvent(scope, {
    conversationId,
    appliedSlaId: applied.id,
    eventType,
    metadata: {},
  });

  return applied;
}

// ── SLA event log ─────────────────────────────────────────────────────────────

interface SlaEventPayload {
  conversationId: string;
  appliedSlaId?:  string;
  eventType:      string;
  metadata?:      Record<string, unknown>;
}

export async function logSlaEvent(scope: SlaScope, payload: SlaEventPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { error } = await supabase.from('sla_events').insert({
    id:              randomUUID(),
    tenant_id:       scope.tenantId,
    workspace_id:    scope.workspaceId,
    conversation_id: payload.conversationId,
    applied_sla_id:  payload.appliedSlaId ?? null,
    event_type:      payload.eventType,
    occurred_at:     new Date().toISOString(),
    metadata:        payload.metadata ?? {},
  });
  if (error) throw error;
}

export async function listSlaEvents(
  scope: SlaScope,
  filters?: { conversationId?: string; limit?: number },
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('sla_events')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('occurred_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.conversationId) query = query.eq('conversation_id', filters.conversationId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── SLA at risk (imminent breach) ─────────────────────────────────────────────

export interface SlaAtRiskItem {
  id: string;
  conversation_id: string;
  kind: 'resolution' | 'first_response';
  deadline: string;
}

/**
 * Applied SLAs whose deadline falls within `withinMins` from now and is NOT yet
 * breached. Fills the gap the reporting layer had — deadlines exist on
 * applied_slas but nobody queried them "about to breach".
 */
export async function listSlaAtRisk(
  scope: SlaScope,
  withinMins = 60,
  limit = 20,
): Promise<SlaAtRiskItem[]> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const soon = new Date(Date.now() + withinMins * 60_000).toISOString();
  const { data, error } = await supabase
    .from('applied_slas')
    .select('id, conversation_id, resolution_deadline, first_response_deadline, resolution_breached, first_response_breached')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .or(
      `and(resolution_breached.eq.false,resolution_deadline.gte.${nowIso},resolution_deadline.lte.${soon}),` +
      `and(first_response_breached.eq.false,first_response_deadline.gte.${nowIso},first_response_deadline.lte.${soon})`,
    )
    .limit(limit);
  if (error) {
    if ((error as { code?: string }).code === '42P01') return [];
    throw error;
  }
  return (data ?? []).map((r: any): SlaAtRiskItem => {
    const resolutionAtRisk = r.resolution_deadline && !r.resolution_breached && r.resolution_deadline <= soon && r.resolution_deadline >= nowIso;
    return {
      id: String(r.id),
      conversation_id: String(r.conversation_id),
      kind: resolutionAtRisk ? 'resolution' : 'first_response',
      deadline: resolutionAtRisk ? r.resolution_deadline : r.first_response_deadline,
    };
  });
}
