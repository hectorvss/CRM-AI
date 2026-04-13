import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface AgentRunScope {
  tenantId: string;
  workspaceId: string;
}

export interface AgentRunRepository {
  list(scope: AgentRunScope, agentId: string, limit: number): Promise<any[]>;
  create(scope: AgentRunScope, data: any): Promise<string>;
  update(scope: AgentRunScope, id: string, updates: any): Promise<void>;
  get(scope: AgentRunScope, id: string): Promise<any | null>;
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

export function createAgentRunRepository(): AgentRunRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      list: listRunsSupabase,
      create: async (scope, data) => {
        const supabase = getSupabaseAdmin();
        const id = data.id || randomUUID();
        const { error } = await supabase.from('agent_runs').insert({ ...data, id, tenant_id: scope.tenantId, workspace_id: scope.workspaceId });
        if (error) throw error;
        return id;
      },
      update: async (scope, id, updates) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('agent_runs').update(updates).eq('id', id).eq('tenant_id', scope.tenantId);
        if (error) throw error;
      },
      get: async (scope, id) => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('agent_runs').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
        if (error) throw error;
        return data;
      }
    };
  }

  return {
    list: async (scope, agentId, limit) => listRunsSqlite(scope, agentId, limit),
    create: async (scope, data) => {
      const db = getDb();
      const id = data.id || randomUUID();
      const fields = Object.keys(data);
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map(f => {
        const val = data[f];
        return (val && typeof val === 'object') ? JSON.stringify(val) : val;
      });
      db.prepare(`
        INSERT INTO agent_runs (${fields.join(', ')}, tenant_id, workspace_id)
        VALUES (${placeholders}, ?, ?)
      `).run(...values, scope.tenantId, scope.workspaceId);
      return id;
    },
    update: async (scope, id, updates) => {
      const db = getDb();
      const fields = Object.keys(updates);
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => {
        const val = updates[f];
        return (val && typeof val === 'object') ? JSON.stringify(val) : val;
      });
      db.prepare(`UPDATE agent_runs SET ${setClause} WHERE id = ? AND tenant_id = ?`).run(...values, id, scope.tenantId);
    },
    get: async (scope, id) => {
      const db = getDb();
      const row = db.prepare('SELECT * FROM agent_runs WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId);
      return row ? parseRow(row) : null;
    }
  };
}
