import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface PolicyScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export type PolicyDecision = 'allow' | 'conditional' | 'approval_required' | 'block';

export interface PolicyRepository {
  listRules(scope: PolicyScope, entityType?: string, isActive?: boolean): Promise<any[]>;
  createRule(scope: PolicyScope, data: any): Promise<any>;
  updateRule(scope: PolicyScope, id: string, data: any): Promise<any>;
  evaluate(scope: PolicyScope, entityType: string, actionType: string | null, context: Record<string, any>, caseId: string | null): Promise<any>;
  listEvaluations(scope: PolicyScope, filters: { decision?: string; entityType?: string; caseId?: string }): Promise<any[]>;
  getMetrics(scope: PolicyScope): Promise<any>;
  resolveAssigneeByRole(scope: PolicyScope, role: string | null): Promise<string | null>;
  persistEvaluation(scope: PolicyScope, evaluation: any): Promise<void>;
}

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getByPath(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc: any, key: string) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function compareValue(operator: string, left: any, right: any): boolean {
  switch (operator) {
    case 'eq': return left === right;
    case 'neq': return left !== right;
    case 'gt': return Number(left) > Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'lte': return Number(left) <= Number(right);
    case 'in': return Array.isArray(right) ? right.includes(left) : false;
    case 'contains':
      if (typeof left === 'string' && typeof right === 'string') return left.toLowerCase().includes(right.toLowerCase());
      if (Array.isArray(left)) return left.includes(right);
      return false;
    case 'exists': return left !== undefined && left !== null;
    default: return false;
  }
}

function ruleMatches(rule: any, context: Record<string, any>, actionType: string | null): boolean {
  const conditions = asArray(rule.conditions);
  const actionMapping = asObject(rule.action_mapping);
  const allowedActions = asArray(actionMapping.action_types);
  if (allowedActions.length > 0 && actionType && !allowedActions.includes(actionType)) return false;
  if (allowedActions.length > 0 && !actionType) return false;

  return conditions.every((c) => {
    const field = typeof c?.field === 'string' ? c.field : '';
    const operator = typeof c?.operator === 'string' ? c.operator : 'eq';
    const expected = c?.value;
    if (!field) return false;
    const actual = getByPath(context, field);
    return compareValue(operator, actual, expected);
  });
}

function resolveDecision(rule: any): { decision: PolicyDecision; requiresApproval: boolean; reason: string | null } {
  const actionMapping = asObject(rule.action_mapping);
  const approvalMapping = asObject(rule.approval_mapping);
  const rawDecision = String(actionMapping.decision || '').trim().toLowerCase();

  if (rawDecision === 'block') return { decision: 'block', requiresApproval: false, reason: actionMapping.reason || null };
  if (rawDecision === 'approval_required') return { decision: 'approval_required', requiresApproval: true, reason: actionMapping.reason || null };
  if (rawDecision === 'conditional') return { decision: 'conditional', requiresApproval: false, reason: actionMapping.reason || null };
  if (rawDecision === 'allow') return { decision: 'allow', requiresApproval: false, reason: actionMapping.reason || null };

  if (approvalMapping.required === true) return { decision: 'approval_required', requiresApproval: true, reason: approvalMapping.reason || null };
  if (actionMapping.block === true) return { decision: 'block', requiresApproval: false, reason: actionMapping.reason || null };
  if (actionMapping.conditional === true) return { decision: 'conditional', requiresApproval: false, reason: actionMapping.reason || null };
  return { decision: 'allow', requiresApproval: false, reason: null };
}

async function listRulesSupabase(scope: PolicyScope, entityType?: string, isActive?: boolean) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from('policy_rules').select('*').eq('tenant_id', scope.tenantId);
  if (entityType) query = query.eq('entity_type', entityType);
  if (isActive !== undefined) query = query.eq('is_active', isActive);
  query = query.order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}


async function createRuleSupabase(scope: PolicyScope, data: any) {
  const supabase = getSupabaseAdmin();
  const id = randomUUID();
  const rule = {
    id,
    tenant_id: scope.tenantId,
    knowledge_article_id: data.knowledge_article_id || null,
    name: data.name,
    description: data.description || null,
    entity_type: data.entity_type,
    conditions: Array.isArray(data.conditions) ? data.conditions : [],
    action_mapping: data.action_mapping || {},
    approval_mapping: data.approval_mapping || {},
    escalation_mapping: data.escalation_mapping || {},
    is_active: true,
    version: 1,
    created_at: new Date().toISOString()
  };
  const { error } = await supabase.from('policy_rules').insert(rule);
  if (error) throw error;
  
  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    actor_id: scope.userId || 'system',
    action: 'POLICY_RULE_CREATED',
    entity_type: 'policy_rule',
    entity_id: id,
    metadata: { name: data.name, entity_type: data.entity_type },
    occurred_at: new Date().toISOString()
  });

  return rule;
}


async function updateRuleSupabase(scope: PolicyScope, id: string, data: any) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: getError } = await supabase.from('policy_rules').select('*').eq('id', id).eq('tenant_id', scope.tenantId).single();
  if (getError) throw getError;

  const updates = {
    name: data.name ?? existing.name,
    description: data.description ?? existing.description,
    entity_type: data.entity_type ?? existing.entity_type,
    conditions: data.conditions ?? existing.conditions,
    action_mapping: data.action_mapping ?? existing.action_mapping,
    approval_mapping: data.approval_mapping ?? existing.approval_mapping,
    escalation_mapping: data.escalation_mapping ?? existing.escalation_mapping,
    is_active: data.is_active ?? existing.is_active,
    version: (existing.version || 1) + 1,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('policy_rules').update(updates).eq('id', id).eq('tenant_id', scope.tenantId);
  if (error) throw error;

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    actor_id: scope.userId || 'system',
    action: 'POLICY_RULE_UPDATED',
    entity_type: 'policy_rule',
    entity_id: id,
    metadata: { old_version: existing.version, new_version: updates.version },
    occurred_at: new Date().toISOString()
  });

  return { ...existing, ...updates };
}


async function evaluatePolicy(scope: PolicyScope, entityType: string, actionType: string | null, context: Record<string, any>, caseId: string | null) {
  const rules = await createPolicyRepository().listRules(scope, entityType, true);

  const matchedRules: any[] = [];
  let finalDecision: PolicyDecision = 'allow';
  let requiresApproval = false;
  let matchedRuleId: string | null = null;
  let matchedRule: any | null = null;
  let reason: string | null = null;
  let conflictDetected = false;
  let conflictingRuleIds: string[] = [];

  const priorityOrder: PolicyDecision[] = ['allow', 'conditional', 'approval_required', 'block'];
  const decisionRank = (d: PolicyDecision) => priorityOrder.indexOf(d);

  for (const rule of rules) {
    const r = parseRow(rule);
    if (!ruleMatches(r, context, actionType)) continue;
    const resolved = resolveDecision(r);
    matchedRules.push({ id: r.id, name: r.name, decision: resolved.decision });

    if (decisionRank(resolved.decision) >= decisionRank(finalDecision)) {
      finalDecision = resolved.decision;
      requiresApproval = resolved.requiresApproval;
      matchedRuleId = r.id;
      matchedRule = r;
      reason = resolved.reason || `Matched rule: ${r.name}`;
    }
  }

  if (!matchedRules.length) {
    reason = 'No active rule matched. Default allow.';
  } else {
    const uniqueDecisions = Array.from(new Set(matchedRules.map((r) => r.decision)));
    if (uniqueDecisions.length > 1) {
      conflictDetected = true;
      conflictingRuleIds = matchedRules.map((r) => r.id);
      finalDecision = 'approval_required';
      requiresApproval = true;
      reason = `Policy conflict detected across ${uniqueDecisions.length} decisions: ${uniqueDecisions.join(', ')}`;
    }
  }

  return { matchedRules, finalDecision, requiresApproval, matchedRuleId, matchedRule, reason, conflictDetected, conflictingRuleIds };
}

async function listEvaluationsSupabase(scope: PolicyScope, filters: any) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from('policy_evaluations').select('*').eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId);
  if (filters.decision) query = query.eq('decision', filters.decision);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.caseId) query = query.eq('case_id', filters.caseId);
  query = query.order('created_at', { ascending: false }).limit(200);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}


async function getMetricsSupabase(scope: PolicyScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('policy_evaluations')
    .select('decision, conflict_detected, created_at, matched_rule_id')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;

  const last24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const totals = { total: 0, allow: 0, conditional: 0, approval_required: 0, block: 0, conflict: 0, last24h: 0 };
  const ruleCounts = new Map<string, number>();

  for (const row of (data || [])) {
    totals.total += 1;
    if (row.decision === 'allow') totals.allow += 1;
    else if (row.decision === 'conditional') totals.conditional += 1;
    else if (row.decision === 'approval_required') totals.approval_required += 1;
    else if (row.decision === 'block') totals.block += 1;

    if (row.conflict_detected) totals.conflict += 1;
    if (row.created_at >= last24h) totals.last24h += 1;
    if (row.matched_rule_id) ruleCounts.set(row.matched_rule_id, (ruleCounts.get(row.matched_rule_id) || 0) + 1);
  }

  const topRules = Array.from(ruleCounts.entries())
    .map(([rule_id, matches]) => ({ rule_id, matches }))
    .sort((a,b) => b.matches - a.matches)
    .slice(0, 5);

  return {
    total_evaluations: totals.total,
    decision_breakdown: { allow: totals.allow, conditional: totals.conditional, approval_required: totals.approval_required, block: totals.block },
    conflict_count: totals.conflict,
    conflict_rate: totals.total > 0 ? totals.conflict / totals.total : 0,
    evaluations_last_24h: totals.last24h,
    top_matched_rules: topRules
  };
}


async function resolveAssigneeSupabase(scope: PolicyScope, role: string | null) {
  if (!role) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('members')
    .select('user_id, roles(name)')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('status', 'active')
    .ilike('roles.name', role)
    .order('joined_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.user_id || null;
}


async function persistEvaluationSupabase(scope: PolicyScope, evaluation: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('policy_evaluations').insert({
    id: evaluation.id,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    entity_type: evaluation.entityType,
    action_type: evaluation.actionType,
    case_id: evaluation.caseId,
    input_context: evaluation.context,
    evaluated_rules: evaluation.matchedRules,
    matched_rule_id: evaluation.matchedRuleId,
    decision: evaluation.decision,
    requires_approval: evaluation.requiresApproval,
    conflict_detected: evaluation.conflictDetected,
    conflicting_rule_ids: evaluation.conflictingRuleIds,
    reason: evaluation.reason,
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}


export function createPolicyRepository(): PolicyRepository {
  return {
    listRules: listRulesSupabase,
    createRule: createRuleSupabase,
    updateRule: updateRuleSupabase,
    evaluate: evaluatePolicy,
    listEvaluations: listEvaluationsSupabase,
    getMetrics: getMetricsSupabase,
    resolveAssigneeByRole: resolveAssigneeSupabase,
    persistEvaluation: persistEvaluationSupabase,
  };
}
