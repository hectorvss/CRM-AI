import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface ResolutionScope {
  tenantId: string;
  workspaceId: string;
}

export interface ResolutionRepository {
  createPlan(scope: ResolutionScope, data: any): Promise<string>;
  getPlan(scope: ResolutionScope, id: string): Promise<any | null>;
  updatePlan(scope: ResolutionScope, id: string, updates: any): Promise<void>;
  listPlansByCase(scope: ResolutionScope, caseId: string): Promise<any[]>;
  
  createActionAttempt(scope: ResolutionScope, data: any): Promise<string>;
  updateActionAttempt(scope: ResolutionScope, id: string, updates: any): Promise<void>;
  getAttemptByIdempotencyKey(scope: ResolutionScope, key: string): Promise<any | null>;
}

function parsePlan(row: any) {
  const parsed = parseRow(row);
  if (parsed?.steps && typeof parsed.steps === 'string') {
    try {
      parsed.steps = JSON.parse(parsed.steps);
    } catch {
      parsed.steps = [];
    }
  }
  return parsed;
}

class SQLiteResolutionRepository implements ResolutionRepository {
  async createPlan(scope: ResolutionScope, data: any) {
    const db = getDb();
    const id = data.id || randomUUID();
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(f => {
      const val = data[f];
      return (val && typeof val === 'object') ? JSON.stringify(val) : val;
    });

    db.prepare(`
      INSERT INTO execution_plans (${fields.join(', ')}, tenant_id)
      VALUES (${placeholders}, ?)
    `).run(...values, scope.tenantId);
    return id;
  }

  async getPlan(scope: ResolutionScope, id: string) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM execution_plans WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId);
    return row ? parsePlan(row) : null;
  }

  async updatePlan(scope: ResolutionScope, id: string, updates: any) {
    const db = getDb();
    const fields = Object.keys(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      const val = updates[f];
      return (val && typeof val === 'object') ? JSON.stringify(val) : val;
    });
    db.prepare(`UPDATE execution_plans SET ${setClause} WHERE id = ? AND tenant_id = ?`).run(...values, id, scope.tenantId);
  }

  async listPlansByCase(scope: ResolutionScope, caseId: string) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM execution_plans WHERE case_id = ? AND tenant_id = ?').all(caseId, scope.tenantId);
    return rows.map(parsePlan);
  }

  async createActionAttempt(scope: ResolutionScope, data: any) {
    const db = getDb();
    const id = data.id || randomUUID();
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(f => {
      const val = data[f];
      return (val && typeof val === 'object') ? JSON.stringify(val) : val;
    });

    db.prepare(`
      INSERT INTO tool_action_attempts (${fields.join(', ')}, tenant_id)
      VALUES (${placeholders}, ?)
    `).run(...values, scope.tenantId);
    return id;
  }

  async updateActionAttempt(scope: ResolutionScope, id: string, updates: any) {
    const db = getDb();
    const fields = Object.keys(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      const val = updates[f];
      return (val && typeof val === 'object') ? JSON.stringify(val) : val;
    });
    db.prepare(`UPDATE tool_action_attempts SET ${setClause} WHERE id = ? AND tenant_id = ?`).run(...values, id, scope.tenantId);
  }

  async getAttemptByIdempotencyKey(scope: ResolutionScope, key: string) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tool_action_attempts WHERE idempotency_key = ? AND tenant_id = ?').get(key, scope.tenantId);
    return row ? parseRow(row) : null;
  }
}

class SupabaseResolutionRepository implements ResolutionRepository {
  async createPlan(scope: ResolutionScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('execution_plans').insert({ ...data, tenant_id: scope.tenantId });
    if (error) throw error;
    return data.id || randomUUID();
  }

  async getPlan(scope: ResolutionScope, id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('execution_plans').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async updatePlan(scope: ResolutionScope, id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('execution_plans').update(updates).eq('id', id).eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }

  async listPlansByCase(scope: ResolutionScope, caseId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('execution_plans').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId);
    if (error) throw error;
    return data || [];
  }

  async createActionAttempt(scope: ResolutionScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('tool_action_attempts').insert({ ...data, tenant_id: scope.tenantId });
    if (error) throw error;
    return data.id || randomUUID();
  }

  async updateActionAttempt(scope: ResolutionScope, id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('tool_action_attempts').update(updates).eq('id', id).eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }

  async getAttemptByIdempotencyKey(scope: ResolutionScope, key: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('tool_action_attempts').select('*').eq('idempotency_key', key).eq('tenant_id', scope.tenantId).maybeSingle();
    if (error) throw error;
    return data;
  }
}

export function createResolutionRepository(): ResolutionRepository {
  const provider = getDatabaseProvider();
  return provider === 'supabase' ? new SupabaseResolutionRepository() : new SQLiteResolutionRepository();
}
