import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { getDatabaseProvider } from '../db/provider.js';
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

// ── Helpers ──────────────────────────────────────────────────

function parseReconciliationIssue(row: any) {
  const parsed = parseRow(row);
  if (parsed?.conflicting_systems && typeof parsed.conflicting_systems === 'string') {
    try {
      parsed.conflicting_systems = JSON.parse(parsed.conflicting_systems);
    } catch {
      parsed.conflicting_systems = [];
    }
  }
  if (parsed?.actual_states && typeof parsed.actual_states === 'string') {
    try {
      parsed.actual_states = JSON.parse(parsed.actual_states);
    } catch {
      parsed.actual_states = {};
    }
  }
  return parsed;
}

function normalizeSqlValue(value: any): any {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

// ── SQLite implementation ────────────────────────────────────

function listIssuesSqlite(scope: ReconciliationScope, filters: ReconciliationFilters): any[] {
  const db = getDb();
  let query = `
    SELECT r.*, c.case_number, c.status as case_status
    FROM reconciliation_issues r
    LEFT JOIN cases c ON c.id = r.case_id
    WHERE r.tenant_id = ?
  `;
  const params: any[] = [scope.tenantId];

  if (filters.status) { query += ' AND r.status = ?'; params.push(filters.status); }
  if (filters.severity) { query += ' AND r.severity = ?'; params.push(filters.severity); }
  if (filters.entity_type) { query += ' AND r.entity_type = ?'; params.push(filters.entity_type); }
  if (filters.case_id) { query += ' AND r.case_id = ?'; params.push(filters.case_id); }

  query += ' ORDER BY r.detected_at DESC LIMIT 300';
  
  const rows = db.prepare(query).all(...params);
  return rows.map(parseReconciliationIssue);
}

function getIssueSqlite(scope: ReconciliationScope, id: string): any | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.*, c.case_number, c.status as case_status
    FROM reconciliation_issues r
    LEFT JOIN cases c ON c.id = r.case_id
    WHERE r.id = ? AND r.tenant_id = ?
    LIMIT 1
  `).get(id, scope.tenantId);
  
  return row ? parseReconciliationIssue(row) : null;
}

function getMetricsSqlite(scope: ReconciliationScope): any {
  const db = getDb();
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
      SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) as escalated_count,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
      SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) as ignored_count
    FROM reconciliation_issues
    WHERE tenant_id = ?
  `).get(scope.tenantId) as any;

  const autoResolved24h = db.prepare(`
    SELECT COUNT(*) as total
    FROM reconciliation_issues
    WHERE tenant_id = ? AND status = 'resolved'
      AND resolved_at >= datetime('now', '-24 hours')
      AND resolution_plan LIKE 'Auto%'
  `).get(scope.tenantId) as any;

  const avgResolve = db.prepare(`
    SELECT AVG((julianday(resolved_at) - julianday(detected_at)) * 24.0) as avg_hours
    FROM reconciliation_issues
    WHERE tenant_id = ? AND status = 'resolved' AND resolved_at IS NOT NULL
  `).get(scope.tenantId) as any;

  return {
    total_issues: totals?.total || 0,
    status_breakdown: {
      open: totals?.open_count || 0,
      in_progress: totals?.in_progress_count || 0,
      escalated: totals?.escalated_count || 0,
      resolved: totals?.resolved_count || 0,
      ignored: totals?.ignored_count || 0,
    },
    auto_resolved_last_24h: autoResolved24h?.total || 0,
    avg_resolution_hours: avgResolve?.avg_hours ? Number(avgResolve.avg_hours) : 0,
  };
}

function updateIssueSqlite(scope: ReconciliationScope, id: string, updates: any): void {
  const db = getDb();
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const params = [...Object.values(updates).map(normalizeSqlValue), id, scope.tenantId];

  db.prepare(`
    UPDATE reconciliation_issues
    SET ${setClause}
    WHERE id = ? AND tenant_id = ?
  `).run(...params);
}

function insertSystemStateSqlite(scope: ReconciliationScope, state: any): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO system_states (id, entity_type, entity_id, system, state_key, state_value, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    state.entity_type,
    state.entity_id,
    state.system,
    state.state_key,
    state.state_value,
    scope.tenantId
  );
}

function insertCanonicalDecisionSqlite(scope: ReconciliationScope, decision: any): void {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO canonical_field_decisions (
        id, tenant_id, workspace_id, entity_type, entity_id, field_key,
        chosen_system, chosen_value, candidates, reason, issue_id, case_id, decided_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      scope.tenantId,
      scope.workspaceId,
      decision.entity_type,
      decision.entity_id,
      decision.field_key || 'status',
      decision.chosen_system,
      decision.chosen_value,
      decision.candidates ? JSON.stringify(decision.candidates) : '{}',
      decision.reason,
      decision.issue_id,
      decision.case_id,
      decision.decided_by
    );
  } catch (err) {
    console.warn('Canonical Decision skip (table likely missing):', err);
  }
}

// ── Supabase implementation ──────────────────────────────────

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
  if (getDatabaseProvider() === 'supabase') {
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

  return {
    listIssues: async (scope, filters) => listIssuesSqlite(scope, filters),
    getIssue: async (scope, id) => getIssueSqlite(scope, id),
    getMetrics: async (scope) => getMetricsSqlite(scope),
    updateIssue: async (scope, id, updates) => updateIssueSqlite(scope, id, updates),
    listSourceOfTruthRules: async (scope) => {
      const db = getDb();
      return db.prepare('SELECT * FROM source_of_truth_rules WHERE tenant_id = ?').all(scope.tenantId);
    },
    getSourceOfTruthRule: async (scope, entityType) => {
      const db = getDb();
      return db.prepare('SELECT * FROM source_of_truth_rules WHERE tenant_id = ? AND entity_type = ?').get(scope.tenantId, entityType);
    },
    insertSystemState: async (scope, state) => insertSystemStateSqlite(scope, state),
    insertCanonicalDecision: async (scope, decision) => insertCanonicalDecisionSqlite(scope, decision)
  };
}
