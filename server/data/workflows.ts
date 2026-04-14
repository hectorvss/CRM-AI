import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface WorkflowRepository {
  listDefinitions(tenantId: string, workspaceId: string): Promise<any[]>;
  getDefinition(id: string, tenantId: string, workspaceId: string): Promise<any>;
  createDefinition(data: {
    id: string;
    tenantId: string;
    workspaceId: string;
    name: string;
    description?: string;
    currentVersionId?: string;
    createdBy?: string;
  }): Promise<void>;
  updateDefinition(id: string, tenantId: string, workspaceId: string, updates: any): Promise<void>;

  listVersions(workflowId: string): Promise<any[]>;
  getVersion(id: string): Promise<any>;
  getLatestVersion(workflowId: string): Promise<any>;
  createVersion(data: {
    id: string;
    workflowId: string;
    versionNumber: number;
    status: string;
    nodes: any;
    edges: any;
    trigger: any;
    tenantId: string;
  }): Promise<void>;
  updateVersion(id: string, updates: any): Promise<void>;

  listRecentRuns(tenantId: string, limit?: number): Promise<any[]>;
  listRunsByWorkflow(workflowId: string, tenantId: string, limit?: number): Promise<any[]>;
  getMetrics(workflowId: string, tenantId: string): Promise<any>;
}

class SQLiteWorkflowRepository implements WorkflowRepository {
  async listDefinitions(tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT wd.*, wv.status as version_status, wv.version_number, wv.trigger, wv.nodes, wv.edges
      FROM workflow_definitions wd
      LEFT JOIN workflow_versions wv ON wd.current_version_id = wv.id
      WHERE wd.tenant_id = ? AND wd.workspace_id = ?
      ORDER BY wd.updated_at DESC
    `).all(tenantId, workspaceId);
  }

  async getDefinition(id: string, tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM workflow_definitions WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(id, tenantId, workspaceId);
  }

  async createDefinition(data: any) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO workflow_definitions (
        id, tenant_id, workspace_id, name, description, current_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.tenantId, data.workspaceId, data.name, data.description || '',
      data.currentVersionId || null, data.createdBy || 'system', now, now
    );
  }

  async updateDefinition(id: string, tenantId: string, workspaceId: string, updates: any) {
    const db = getDb();
    const fields = [];
    const params = [];
    const now = new Date().toISOString();
    
    if (updates.name) { fields.push('name = ?'); params.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
    if (updates.currentVersionId) { fields.push('current_version_id = ?'); params.push(updates.currentVersionId); }
    
    if (fields.length === 0) return;
    
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id, tenantId, workspaceId);
    
    db.prepare(`UPDATE workflow_definitions SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ? AND workspace_id = ?`).run(...params);
  }

  async listVersions(workflowId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY version_number DESC
    `).all(workflowId);
  }

  async getVersion(id: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM workflow_versions WHERE id = ?').get(id);
  }

  async getLatestVersion(workflowId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY version_number DESC LIMIT 1
    `).get(workflowId);
  }

  async createVersion(data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO workflow_versions (
        id, workflow_id, version_number, status, nodes, edges, trigger, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.workflowId, data.versionNumber, data.status,
      JSON.stringify(data.nodes), JSON.stringify(data.edges), JSON.stringify(data.trigger), data.tenantId
    );
  }

  async updateVersion(id: string, updates: any) {
    const db = getDb();
    const fields = [];
    const params = [];
    
    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.nodes) { fields.push('nodes = ?'); params.push(JSON.stringify(updates.nodes)); }
    if (updates.edges) { fields.push('edges = ?'); params.push(JSON.stringify(updates.edges)); }
    if (updates.trigger) { fields.push('trigger = ?'); params.push(JSON.stringify(updates.trigger)); }
    if (updates.publishedBy) { fields.push('published_by = ?'); params.push(updates.publishedBy); }
    if (updates.publishedAt) { fields.push('published_at = ?'); params.push(updates.publishedAt); }
    
    if (fields.length === 0) return;
    params.push(id);
    db.prepare(`UPDATE workflow_versions SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  async listRecentRuns(tenantId: string, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT wr.*, wd.name as workflow_name, c.case_number
      FROM workflow_runs wr
      LEFT JOIN workflow_versions wv ON wr.workflow_version_id = wv.id
      LEFT JOIN workflow_definitions wd ON wv.workflow_id = wd.id
      LEFT JOIN cases c ON wr.case_id = c.id
      WHERE wr.tenant_id = ?
      ORDER BY wr.started_at DESC LIMIT ?
    `).all(tenantId, limit);
  }

  async listRunsByWorkflow(workflowId: string, tenantId: string, limit = 20) {
    const db = getDb();
    return db.prepare(`
      SELECT wr.*, c.case_number
      FROM workflow_runs wr
      LEFT JOIN cases c ON wr.case_id = c.id
      WHERE wr.workflow_version_id IN (SELECT id FROM workflow_versions WHERE workflow_id = ?)
        AND wr.tenant_id = ?
      ORDER BY wr.started_at DESC LIMIT ?
    `).all(workflowId, tenantId, limit);
  }

  async getMetrics(workflowId: string, tenantId: string) {
    const db = getDb();
    const runs = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running,
             MAX(started_at) as last_run_at
      FROM workflow_runs
      WHERE workflow_version_id IN (
        SELECT id FROM workflow_versions WHERE workflow_id = ?
      ) AND tenant_id = ?
    `).get(workflowId, tenantId) as any;

    const total = Number(runs?.total || 0);
    const completed = Number(runs?.completed || 0);

    return {
      executions: total,
      completed,
      failed: Number(runs?.failed || 0),
      running: Number(runs?.running || 0),
      success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avg_time_saved: total > 0 ? `${Math.max(1, Math.round(total / 12))}m` : 'N/A',
      last_run_at: runs?.last_run_at || null,
    };
  }
}

class SupabaseWorkflowRepository implements WorkflowRepository {
  async listDefinitions(tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workflow_definitions')
      .select('*, workflow_versions!workflow_definitions_current_version_id_fkey(status, version_number, trigger, nodes, edges)')
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map(d => {
      const v = d.workflow_versions;
      return {
        ...d,
        version_status: v?.status,
        version_number: v?.version_number,
        trigger: v?.trigger,
        nodes: v?.nodes,
        edges: v?.edges
      };
    });
  }

  async getDefinition(id: string, tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('workflow_definitions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .single();
    return data;
  }

  async createDefinition(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('workflow_definitions').insert({
      id: data.id,
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description,
      current_version_id: data.currentVersionId,
      created_by: data.createdBy || 'system'
    });
    if (error) throw error;
  }

  async updateDefinition(id: string, tenantId: string, workspaceId: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = { updated_at: new Date().toISOString() };
    if (updates.name) toUpdate.name = updates.name;
    if (updates.description !== undefined) toUpdate.description = updates.description;
    if (updates.currentVersionId) toUpdate.current_version_id = updates.currentVersionId;

    const { error } = await supabase
      .from('workflow_definitions')
      .update(toUpdate)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
  }

  async listVersions(workflowId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('version_number', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getVersion(id: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('workflow_versions').select('*').eq('id', id).single();
    return data;
  }

  async getLatestVersion(workflowId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('version_number', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  }

  async createVersion(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('workflow_versions').insert({
      id: data.id,
      workflow_id: data.workflowId,
      version_number: data.versionNumber,
      status: data.status,
      nodes: data.nodes,
      edges: data.edges,
      trigger: data.trigger,
      tenant_id: data.tenantId
    });
    if (error) throw error;
  }

  async updateVersion(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = {};
    if (updates.status) toUpdate.status = updates.status;
    if (updates.nodes) toUpdate.nodes = updates.nodes;
    if (updates.edges) toUpdate.edges = updates.edges;
    if (updates.trigger) toUpdate.trigger = updates.trigger;
    if (updates.publishedBy) toUpdate.published_by = updates.publishedBy;
    if (updates.publishedAt) toUpdate.published_at = updates.publishedAt;

    const { error } = await supabase.from('workflow_versions').update(toUpdate).eq('id', id);
    if (error) throw error;
  }

  async listRecentRuns(tenantId: string, limit = 50) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(workflow_id, workflow_definitions!inner(name)), cases(case_number)')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(r => ({
      ...r,
      workflow_name: r.workflow_versions?.workflow_definitions?.name,
      case_number: r.cases?.case_number
    }));
  }

  async listRunsByWorkflow(workflowId: string, tenantId: string, limit = 20) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workflow_runs')
      .select('*, cases(case_number), workflow_versions!inner(workflow_id)')
      .eq('tenant_id', tenantId)
      .eq('workflow_versions.workflow_id', workflowId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(r => ({
      ...r,
      case_number: r.cases?.case_number
    }));
  }

  async getMetrics(workflowId: string, tenantId: string) {
    const supabase = getSupabaseAdmin();
    // Complex aggregations are better via RPC or separate queries in Supabase if not using raw SQL
    // For now, we'll use a simplified version or raw select if possible
    const { data, error } = await supabase
      .from('workflow_runs')
      .select('status, started_at, workflow_versions!inner(workflow_id)')
      .eq('tenant_id', tenantId)
      .eq('workflow_versions.workflow_id', workflowId);
    
    if (error) throw error;
    
    const runs = data || [];
    const total = runs.length;
    const completed = runs.filter(r => r.status === 'completed').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const running = runs.filter(r => r.status === 'running').length;
    const lastRunAt = runs.length > 0 ? runs.reduce((max, r) => r.started_at > max ? r.started_at : max, runs[0].started_at) : null;

    return {
      executions: total,
      completed,
      failed,
      running,
      success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avg_time_saved: total > 0 ? `${Math.max(1, Math.round(total / 12))}m` : 'N/A',
      last_run_at: lastRunAt,
    };
  }
}

let instance: WorkflowRepository | null = null;

export function createWorkflowRepository(): WorkflowRepository {
  if (instance) return instance;
  const provider = getDatabaseProvider();
  instance = provider === 'supabase' ? new SupabaseWorkflowRepository() : new SQLiteWorkflowRepository();
  return instance;
}
