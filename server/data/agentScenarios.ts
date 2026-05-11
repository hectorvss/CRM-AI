import { getSupabaseAdmin } from '../db/supabase.js';

export interface ScenarioScope { tenantId: string; workspaceId: string }

export type TriggerType =
  | 'intent_match' | 'keyword_match' | 'routing_rule' | 'time_based' | 'manual';

export interface CreateScenarioPayload {
  name:              string;
  description?:      string | null;
  trigger_type:      TriggerType;
  trigger_config?:   Record<string, unknown>;
  steps?:            unknown[];
  allowed_tool_ids?: string[];
  guardrail_ids?:    string[];
  enabled?:          boolean;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listScenarios(scope: ScenarioScope, onlyEnabled = false) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('agent_scenarios')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at');
  if (onlyEnabled) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getScenario(scope: ScenarioScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_scenarios')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createScenario(scope: ScenarioScope, payload: CreateScenarioPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('agent_scenarios')
    .insert({
      id:               randomUUID(),
      tenant_id:        scope.tenantId,
      workspace_id:     scope.workspaceId,
      name:             payload.name,
      description:      payload.description ?? null,
      trigger_type:     payload.trigger_type,
      trigger_config:   payload.trigger_config ?? {},
      steps:            payload.steps ?? [],
      allowed_tool_ids: payload.allowed_tool_ids ?? [],
      guardrail_ids:    payload.guardrail_ids ?? [],
      enabled:          payload.enabled ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateScenario(
  scope: ScenarioScope, id: string, payload: Partial<CreateScenarioPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = ['name','description','trigger_type','trigger_config','steps','allowed_tool_ids','guardrail_ids','enabled'] as const;
  for (const f of fields) {
    if (payload[f] !== undefined) updates[f] = payload[f];
  }
  const { data, error } = await supabase
    .from('agent_scenarios')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteScenario(scope: ScenarioScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('agent_scenarios')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

export async function recordScenarioRun(scope: ScenarioScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data: current } = await supabase
    .from('agent_scenarios')
    .select('run_count')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  await supabase
    .from('agent_scenarios')
    .update({
      run_count:   (current?.run_count ?? 0) + 1,
      last_run_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
}

// ── Trigger matching ──────────────────────────────────────────────────────────

/**
 * Find scenarios that match a given context (intent, keywords, etc.)
 */
export async function findMatchingScenarios(
  scope: ScenarioScope,
  ctx: { intent?: string; text?: string; triggerType?: TriggerType },
) {
  const all = await listScenarios(scope, true);
  return all.filter(s => {
    if (ctx.triggerType && s.trigger_type !== ctx.triggerType) return false;
    const cfg = (s.trigger_config ?? {}) as Record<string, unknown>;
    switch (s.trigger_type) {
      case 'keyword_match': {
        const keywords = (cfg.keywords as string[] | undefined) ?? [];
        return keywords.some(k =>
          (ctx.text ?? '').toLowerCase().includes(k.toLowerCase()),
        );
      }
      case 'intent_match': {
        const intents = (cfg.intents as string[] | undefined) ?? [];
        return intents.includes(ctx.intent ?? '');
      }
      case 'manual':
        return false;
      default:
        return true;
    }
  });
}
