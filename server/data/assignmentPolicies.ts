import { getSupabaseAdmin } from '../db/supabase.js';

export interface AssignmentScope {
  tenantId: string;
  workspaceId: string;
}

export type PolicyType = 'round_robin' | 'capacity_based' | 'skills_based';

export interface RoundRobinConfig {
  max_per_agent?: number;
}

export interface CapacityConfig {
  max_capacity: number;
  respect_online_status: boolean;
}

export interface SkillsConfig {
  required_skills: string[];
  fallback_to_round_robin: boolean;
}

export type PolicyConfig = RoundRobinConfig | CapacityConfig | SkillsConfig | Record<string, unknown>;

export interface CreateAssignmentPolicyPayload {
  name:        string;
  policy_type: PolicyType;
  config:      PolicyConfig;
  inbox_id?:   string | null;
  active?:     boolean;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listAssignmentPolicies(
  scope: AssignmentScope,
  filters?: { inbox_id?: string; active?: boolean },
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('assignment_policies')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');

  if (filters?.inbox_id !== undefined) {
    if (filters.inbox_id) {
      query = query.or(`inbox_id.eq.${filters.inbox_id},inbox_id.is.null`);
    } else {
      query = query.is('inbox_id', null);
    }
  }
  if (filters?.active !== undefined) query = query.eq('active', filters.active);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAssignmentPolicy(scope: AssignmentScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('assignment_policies')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAssignmentPolicy(
  scope: AssignmentScope,
  payload: CreateAssignmentPolicyPayload,
) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('assignment_policies')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name.trim(),
      policy_type:  payload.policy_type,
      config:       payload.config ?? {},
      inbox_id:     payload.inbox_id ?? null,
      active:       payload.active ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAssignmentPolicy(
  scope: AssignmentScope,
  id: string,
  payload: Partial<CreateAssignmentPolicyPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name        !== undefined) updates.name = payload.name.trim();
  if (payload.policy_type !== undefined) updates.policy_type = payload.policy_type;
  if (payload.config      !== undefined) updates.config = payload.config;
  if (payload.inbox_id    !== undefined) updates.inbox_id = payload.inbox_id;
  if (payload.active      !== undefined) updates.active = payload.active;

  const { data, error } = await supabase
    .from('assignment_policies')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteAssignmentPolicy(scope: AssignmentScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('assignment_policies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Assignment engine ─────────────────────────────────────────────────────────

/**
 * Select the best agent from a candidate list using the given policy.
 * Returns the chosen agent_id or null if no suitable agent found.
 */
export function selectAgent(
  policy: { policy_type: PolicyType; config: PolicyConfig },
  candidates: Array<{ id: string; current_load: number; skills?: string[]; online?: boolean }>,
): string | null {
  if (!candidates.length) return null;

  switch (policy.policy_type) {
    case 'round_robin': {
      // Simple: return first candidate (caller should rotate the list)
      return candidates[0].id;
    }

    case 'capacity_based': {
      const cfg = policy.config as CapacityConfig;
      const eligible = candidates.filter(a =>
        a.current_load < (cfg.max_capacity ?? Infinity) &&
        (!cfg.respect_online_status || a.online !== false),
      );
      if (!eligible.length) return null;
      // Pick agent with lowest load
      return eligible.reduce((best, a) =>
        a.current_load < best.current_load ? a : best,
      ).id;
    }

    case 'skills_based': {
      const cfg = policy.config as SkillsConfig;
      const required = cfg.required_skills ?? [];
      const skilled = candidates.filter(a =>
        required.every(s => (a.skills ?? []).includes(s)),
      );
      if (skilled.length) return skilled[0].id;
      if (cfg.fallback_to_round_robin) return candidates[0].id;
      return null;
    }

    default:
      return candidates[0].id;
  }
}
