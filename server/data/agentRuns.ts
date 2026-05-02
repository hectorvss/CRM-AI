import { getSupabaseAdmin } from '../db/supabase.js';

export interface AgentRunScope {
  tenantId: string;
  workspaceId: string;
}

async function listRunsSupabase(scope: AgentRunScope, agentId: string, limit: number) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('agent_id', agentId)
    .eq('tenant_id', scope.tenantId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const caseIds = Array.from(new Set(rows.map((row) => row.case_id).filter(Boolean)));
  if (!caseIds.length) return rows;
  const { data: cases, error: casesError } = await supabase
    .from('cases')
    .select('id, case_number')
    .in('id', caseIds)
    .eq('tenant_id', scope.tenantId);
  if (casesError) throw casesError;
  const caseMap = new Map<string, any>((cases ?? []).map((row: any) => [row.id, row]));
  return rows.map((row) => ({ ...row, case_number: row.case_id ? caseMap.get(row.case_id)?.case_number || null : null }));
}

async function createRunSupabase(scope: AgentRunScope, data: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('agent_runs').insert({
    ...data,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    trigger_type: data.trigger_type ?? 'agent_event',
    outcome_status: data.outcome_status ?? data.status ?? 'running',
  });
  if (error) throw error;
  return data.id;
}

async function updateRunSupabase(scope: AgentRunScope, runId: string, updates: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('agent_runs')
    .update({
      ...updates,
      outcome_status: updates.outcome_status ?? updates.status,
      ended_at: updates.ended_at ?? updates.finished_at ?? (updates.status ? new Date().toISOString() : undefined),
    })
    .eq('id', runId)
    .eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

export interface AgentRunRepository {
  list(scope: AgentRunScope, agentId: string, limit: number): Promise<any[]>;
  create(scope: AgentRunScope, data: any): Promise<string>;
  update(scope: AgentRunScope, runId: string, updates: any): Promise<void>;
}

export function createAgentRunRepository(): AgentRunRepository {
  return {
    list: listRunsSupabase,
    create: createRunSupabase,
    update: updateRunSupabase,
  };
}
