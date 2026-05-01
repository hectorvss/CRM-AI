import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

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

function listRunsSqlite(scope: AgentRunScope, agentId: string, limit: number) {
  const db = getDb();
  return db.prepare(`
    SELECT ar.*, c.case_number
    FROM agent_runs ar
    LEFT JOIN cases c ON ar.case_id = c.id
    WHERE ar.agent_id = ? AND ar.tenant_id = ?
    ORDER BY ar.started_at DESC
    LIMIT ?
  `).all(agentId, scope.tenantId, limit).map(parseRow);
}

function createRunSqlite(scope: AgentRunScope, data: any) {
  const db = getDb();
  const payload = {
    ...data,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    trigger_type: data.trigger_type ?? 'agent_event',
    outcome_status: data.outcome_status ?? data.status ?? 'running',
  };
  const fields = Object.keys(payload);
  const values = Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value);
  db.prepare(`INSERT INTO agent_runs (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...values);
  return data.id;
}

function updateRunSqlite(scope: AgentRunScope, runId: string, updates: any) {
  const db = getDb();
  const payload = {
    ...updates,
    outcome_status: updates.outcome_status ?? updates.status,
    ended_at: updates.ended_at ?? updates.finished_at ?? (updates.status ? new Date().toISOString() : undefined),
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const fields = Object.keys(payload);
  if (!fields.length) return;
  const values = fields.map((field) => {
    const value = payload[field];
    return value && typeof value === 'object' ? JSON.stringify(value) : value;
  });
  db.prepare(`UPDATE agent_runs SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`)
    .run(...values, runId, scope.tenantId);
}

export interface AgentRunRepository {
  list(scope: AgentRunScope, agentId: string, limit: number): Promise<any[]>;
  create(scope: AgentRunScope, data: any): Promise<string>;
  update(scope: AgentRunScope, runId: string, updates: any): Promise<void>;
}

export function createAgentRunRepository(): AgentRunRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      list: listRunsSupabase,
      create: createRunSupabase,
      update: updateRunSupabase,
    };
  }
  return {
    list: async (scope, agentId, limit) => listRunsSqlite(scope, agentId, limit),
    create: async (scope, data) => createRunSqlite(scope, data),
    update: async (scope, runId, updates) => updateRunSqlite(scope, runId, updates),
  };
}
