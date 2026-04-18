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

export interface AgentRunRepository {
  list(scope: AgentRunScope, agentId: string, limit: number): Promise<any[]>;
  create(scope: AgentRunScope, data: any): Promise<string>;
  update(scope: AgentRunScope, runId: string, updates: any): Promise<void>;
}

function toSqliteValue(value: any) {
  if (value === undefined) return null;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function createAgentRunRepository(): AgentRunRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      list: listRunsSupabase,
      create: async (scope, data) => {
        const supabase = getSupabaseAdmin();
        const payload = {
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          outcome_status: data.status === 'running' ? 'running' : data.status || 'completed',
          ...data,
        };
        const { error } = await supabase.from('agent_runs').insert(payload);
        if (error) throw error;
        return payload.id;
      },
      update: async (scope, runId, updates) => {
        const supabase = getSupabaseAdmin();
        const payload = {
          ...updates,
          outcome_status: updates.status ?? updates.outcome_status,
          ended_at: updates.ended_at ?? updates.finished_at,
        };
        const { error } = await supabase
          .from('agent_runs')
          .update(payload)
          .eq('id', runId)
          .eq('tenant_id', scope.tenantId)
          .eq('workspace_id', scope.workspaceId);
        if (error) throw error;
      },
    };
  }
  return {
    list: async (scope, agentId, limit) => listRunsSqlite(scope, agentId, limit),
    create: async (scope, data) => {
      const db = getDb();
      const payload = {
        tenant_id: scope.tenantId,
        workspace_id: scope.workspaceId,
        outcome_status: data.status === 'running' ? 'running' : data.status || 'completed',
        ...data,
      };
      const fields = Object.keys(payload).filter((key) => payload[key] !== undefined);
      db.prepare(`INSERT INTO agent_runs (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
        .run(...fields.map((key) => toSqliteValue(payload[key])));
      return payload.id;
    },
    update: async (scope, runId, updates) => {
      const db = getDb();
      const payload = {
        ...updates,
        outcome_status: updates.status ?? updates.outcome_status,
        ended_at: updates.ended_at ?? updates.finished_at,
      };
      const fields = Object.keys(payload).filter((key) => payload[key] !== undefined);
      if (!fields.length) return;
      db.prepare(`UPDATE agent_runs SET ${fields.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND tenant_id = ? AND workspace_id = ?`)
        .run(...fields.map((key) => toSqliteValue(payload[key])), runId, scope.tenantId, scope.workspaceId);
    },
  };
}
