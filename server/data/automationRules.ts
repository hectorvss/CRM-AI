import { getSupabaseAdmin } from '../db/supabase.js';

export interface AutomationScope {
  tenantId: string;
  workspaceId: string;
}

export type AutomationEventName =
  | 'conversation_created' | 'conversation_updated' | 'conversation_resolved'
  | 'conversation_opened'  | 'message_created'      | 'contact_created'
  | 'contact_updated';

export type ConditionMatch = 'all' | 'any';

export interface AutomationCondition {
  attribute:  string;   // e.g. 'status', 'assignee_id', 'customer.segment'
  operator:   string;   // 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | ...
  value:      unknown;
  value_type?: string;  // 'string' | 'number' | 'boolean' | 'array'
}

export interface AutomationAction {
  action_name:   string;   // 'assign_team' | 'assign_agent' | 'add_label' | 'send_message' | ...
  action_params: Record<string, unknown>;
}

export interface CreateAutomationRulePayload {
  name:            string;
  description?:    string | null;
  event_name:      AutomationEventName;
  conditions:      AutomationCondition[];
  actions:         AutomationAction[];
  condition_match?: ConditionMatch;
  active?:         boolean;
  priority?:       number;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listAutomationRules(
  scope: AutomationScope,
  filters?: { event_name?: string; active?: boolean },
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('priority', { ascending: false })
    .order('created_at');

  if (filters?.event_name) query = query.eq('event_name', filters.event_name);
  if (filters?.active !== undefined) query = query.eq('active', filters.active);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAutomationRule(scope: AutomationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAutomationRule(
  scope: AutomationScope,
  payload: CreateAutomationRulePayload,
) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('automation_rules')
    .insert({
      id:              randomUUID(),
      tenant_id:       scope.tenantId,
      workspace_id:    scope.workspaceId,
      name:            payload.name.trim(),
      description:     payload.description ?? null,
      event_name:      payload.event_name,
      conditions:      payload.conditions ?? [],
      actions:         payload.actions ?? [],
      condition_match: payload.condition_match ?? 'all',
      active:          payload.active ?? true,
      priority:        payload.priority ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAutomationRule(
  scope: AutomationScope,
  id: string,
  payload: Partial<CreateAutomationRulePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name            !== undefined) updates.name = payload.name.trim();
  if (payload.description     !== undefined) updates.description = payload.description;
  if (payload.event_name      !== undefined) updates.event_name = payload.event_name;
  if (payload.conditions      !== undefined) updates.conditions = payload.conditions;
  if (payload.actions         !== undefined) updates.actions = payload.actions;
  if (payload.condition_match !== undefined) updates.condition_match = payload.condition_match;
  if (payload.active          !== undefined) updates.active = payload.active;
  if (payload.priority        !== undefined) updates.priority = payload.priority;

  const { data, error } = await supabase
    .from('automation_rules')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteAutomationRule(scope: AutomationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

export async function toggleAutomationRule(
  scope: AutomationScope,
  id: string,
  active: boolean,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('automation_rules')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Evaluation engine ─────────────────────────────────────────────────────────

type EvalContext = Record<string, unknown>;

function evaluateCondition(cond: AutomationCondition, ctx: EvalContext): boolean {
  const parts = cond.attribute.split('.');
  let val: unknown = ctx;
  for (const part of parts) {
    if (val == null || typeof val !== 'object') return false;
    val = (val as Record<string, unknown>)[part];
  }

  switch (cond.operator) {
    case 'equals':        return val === cond.value;
    case 'not_equals':    return val !== cond.value;
    case 'contains':      return typeof val === 'string' && val.includes(String(cond.value));
    case 'not_contains':  return typeof val === 'string' && !val.includes(String(cond.value));
    case 'starts_with':   return typeof val === 'string' && val.startsWith(String(cond.value));
    case 'ends_with':     return typeof val === 'string' && val.endsWith(String(cond.value));
    case 'gt':            return Number(val) > Number(cond.value);
    case 'lt':            return Number(val) < Number(cond.value);
    case 'gte':           return Number(val) >= Number(cond.value);
    case 'lte':           return Number(val) <= Number(cond.value);
    case 'is_present':    return val !== null && val !== undefined && val !== '';
    case 'is_not_present':return val === null || val === undefined || val === '';
    case 'includes_any':  return Array.isArray(cond.value) && Array.isArray(val)
      && cond.value.some((v: unknown) => (val as unknown[]).includes(v));
    default:              return false;
  }
}

export function evaluateRule(
  rule: { conditions: AutomationCondition[]; condition_match: string },
  ctx: EvalContext,
): boolean {
  if (!rule.conditions.length) return true;
  const results = rule.conditions.map(c => evaluateCondition(c, ctx));
  return rule.condition_match === 'any'
    ? results.some(Boolean)
    : results.every(Boolean);
}

/**
 * Find all active rules matching a given event and context.
 * Returns rules sorted by priority desc.
 */
export async function getMatchingRules(
  scope: AutomationScope,
  eventName: AutomationEventName,
  ctx: EvalContext,
) {
  const rules = await listAutomationRules(scope, { event_name: eventName, active: true });
  return rules.filter(r => evaluateRule(
    { conditions: r.conditions as AutomationCondition[], condition_match: r.condition_match },
    ctx,
  ));
}

/** Increment run_count + update last_run_at after executing a rule */
export async function recordRuleExecution(scope: AutomationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data: current } = await supabase
    .from('automation_rules')
    .select('run_count')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  await supabase
    .from('automation_rules')
    .update({
      run_count:   (current?.run_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
}
