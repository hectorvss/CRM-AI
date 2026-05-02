import { getSupabaseAdmin } from '../db/supabase.js';

export interface ReconciliationScope {
  tenantId: string;
  workspaceId: string;
}

export interface ReconciliationFilters {
  status?: string;
  severity?: string;
  entity_type?: string;
  case_id?: string;
}

export interface ReconciliationRepository {
  listIssues(scope: ReconciliationScope, filters: ReconciliationFilters): Promise<any[]>;
  getIssue(scope: ReconciliationScope, id: string): Promise<any | null>;
  getMetrics(scope: ReconciliationScope): Promise<any>;
  updateIssue(scope: ReconciliationScope, id: string, updates: any): Promise<void>;
  
  // Source of Truth Rules
  listSourceOfTruthRules(scope: ReconciliationScope): Promise<any[]>;
  getSourceOfTruthRule(scope: ReconciliationScope, entityType: string): Promise<any | null>;

  // System States & Canonical Decisions
  insertSystemState(scope: ReconciliationScope, state: any): Promise<void>;
  insertCanonicalDecision(scope: ReconciliationScope, decision: any): Promise<void>;
}

async function listIssuesSupabase(scope: ReconciliationScope, filters: ReconciliationFilters): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('reconciliation_issues')
    .select('*, cases!left(case_number, status)')
    .eq('tenant_id', scope.tenantId)
    .order('detected_at', { ascending: false })
    .limit(300);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.entity_type) query = query.eq('entity_type', filters.entity_type);
  if (filters.case_id) query = query.eq('case_id', filters.case_id);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map(row => {
    const c = (row as any).cases;
    return {
      ...row,
      cases: undefined,
      case_number: c?.case_number || null,
      case_status: c?.status || null
    };
  });
}

async function getIssueSupabase(scope: ReconciliationScope, id: string): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('reconciliation_issues')
    .select('*, cases!left(case_number, status)')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const c = (data as any).cases;
  return {
    ...data,
    cases: undefined,
    case_number: c?.case_number || null,
    case_status: c?.status || null
  };
}

async function getMetricsSupabase(scope: ReconciliationScope): Promise<any> {
  const supabase = getSupabaseAdmin();
  
  // Note: For complex aggregations in Supabase, we usually use RPC or multiple queries if high performance isn't critical.
  // Here we'll do basic counts.
  const { data, error } = await supabase
    .from('reconciliation_issues')
    .select('status, detected_at, resolved_at, resolution_plan')
    .eq('tenant_id', scope.tenantId);
  
  if (error) throw error;

  const rows = data ?? [];
  const status_breakdown = {
    open: rows.filter(r => r.status === 'open').length,
    in_progress: rows.filter(r => r.status === 'in_progress').length,
    escalated: rows.filter(r => r.status === 'escalated').length,
    resolved: rows.filter(r => r.status === 'resolved').length,
    ignored: rows.filter(r => r.status === 'ignored').length,
  };

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const auto_resolved_last_24h = rows.filter(r => 
    r.status === 'resolved' && 
    r.resolved_at && 
    new Date(r.resolved_at) >= dayAgo &&
    String(r.resolution_plan).startsWith('Auto')
  ).length;

  const resolvedRows = rows.filter(r => r.status === 'resolved' && r.resolved_at && r.detected_at);
  const avg_resolution_hours = resolvedRows.length > 0
    ? resolvedRows.reduce((acc, r) => {
        const diff = (new Date(r.resolved_at!).getTime() - new Date(r.detected_at).getTime()) / (1000 * 60 * 60);
        return acc + diff;
      }, 0) / resolvedRows.length
    : 0;

  return {
    total_issues: rows.length,
    status_breakdown,
    auto_resolved_last_24h,
    avg_resolution_hours
  };
}

async function updateIssueSupabase(scope: ReconciliationScope, id: string, updates: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('reconciliation_issues')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
  
  if (error) throw error;
}

async function insertSystemStateSupabase(scope: ReconciliationScope, state: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('system_states')
    .insert({
      id: crypto.randomUUID(),
      entity_type: state.entity_type,
      entity_id: state.entity_id,
      system: state.system,
      state_key: state.state_key,
      state_value: state.state_value,
      tenant_id: scope.tenantId
    });
  
  if (error) throw error;
}

async function insertCanonicalDecisionSupabase(scope: ReconciliationScope, decision: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('canonical_field_decisions')
    .insert({
      id: crypto.randomUUID(),
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      entity_type: decision.entity_type,
      entity_id: decision.entity_id,
      field_key: decision.field_key || 'status',
      chosen_system: decision.chosen_system,
      chosen_value: decision.chosen_value,
      candidates: decision.candidates || {},
      reason: decision.reason,
      issue_id: decision.issue_id,
      case_id: decision.case_id,
      decided_by: decision.decided_by
    });
  
  if (error) {
     // Ignore if table doesn't exist yet in Supabase (optional)
     console.warn('Canonical Decision skip in Supabase:', error.message);
  }
}

export function createReconciliationRepository(): ReconciliationRepository {
  return {
    listIssues: listIssuesSupabase,
    getIssue: getIssueSupabase,
    getMetrics: getMetricsSupabase,
    updateIssue: updateIssueSupabase,
    listSourceOfTruthRules: async (scope) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from('source_of_truth_rules').select('*').eq('tenant_id', scope.tenantId);
      if (error) throw error;
      return data || [];
    },
    getSourceOfTruthRule: async (scope, entityType) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.from('source_of_truth_rules').select('*').eq('tenant_id', scope.tenantId).eq('entity_type', entityType).maybeSingle();
      if (error) throw error;
      return data;
    },
    insertSystemState: insertSystemStateSupabase,
    insertCanonicalDecision: insertCanonicalDecisionSupabase
  };
}
