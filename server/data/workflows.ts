import { getSupabaseAdmin } from '../db/supabase.js';

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
  /**
   * Look up a workflow_version by id. The `scope` parameter enforces tenant
   * isolation at the DB layer — even when the caller has already verified the
   * parent definition, this prevents accidental cross-tenant reads. Note that
   * `workflow_versions` does NOT carry workspace_id (only the parent
   * `workflow_definitions` does), so only `tenantId` is filtered here.
   */
  getVersion(id: string, scope: { tenantId: string; workspaceId?: string }): Promise<any>;
  getLatestVersion(workflowId: string, scope: { tenantId: string; workspaceId?: string }): Promise<any>;
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

  listRecentRuns(tenantId: string, workspaceId?: string, limit?: number): Promise<any[]>;
  listRunsByWorkflow(workflowId: string, tenantId: string, limit?: number): Promise<any[]>;
  getMetrics(workflowId: string, tenantId: string): Promise<any>;
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

  async getVersion(id: string, scope: { tenantId: string; workspaceId?: string }) {
    const supabase = getSupabaseAdmin();
    // workflow_versions has tenant_id but no workspace_id; filter on tenant
    // only. Use maybeSingle() so cross-tenant lookups return null instead of
    // throwing the PGRST116 "no rows" error.
    const { data } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle();
    return data;
  }

  async getLatestVersion(workflowId: string, scope: { tenantId: string; workspaceId?: string }) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('tenant_id', scope.tenantId)
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

  async listRecentRuns(tenantId: string, workspaceId?: string, limit = 50) {
    const supabase = getSupabaseAdmin();
    // workflow_runs now carries workspace_id directly (see migration
    // 20260503_0002). Scope by both tenant_id and workspace_id.
    let query = supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(workflow_id, workflow_definitions!workflow_versions_workflow_id_fkey(name, workspace_id)), cases(case_number)')
      .eq('tenant_id', tenantId);
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query
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
      .select('id, status, started_at, ended_at, workflow_versions!inner(workflow_id)')
      .eq('tenant_id', tenantId)
      .eq('workflow_versions.workflow_id', workflowId);

    if (error) throw error;

    const runs = data || [];
    const total = runs.length;
    const completed = runs.filter(r => r.status === 'completed').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const running = runs.filter(r => r.status === 'running').length;
    const lastRunAt = runs.length > 0 ? runs.reduce((max, r) => r.started_at > max ? r.started_at : max, runs[0].started_at) : null;
    const runIds = runs.map((run: any) => run.id);
    let approvalsCreated = 0;
    let actionsBlocked = 0;
    let agentsInvoked = 0;
    if (runIds.length) {
      const { data: steps, error: stepsError } = await supabase
        .from('workflow_run_steps')
        .select('status, node_type')
        .in('workflow_run_id', runIds);
      if (stepsError) throw stepsError;
      approvalsCreated = (steps || []).filter((step: any) => ['waiting', 'waiting_approval'].includes(String(step.status))).length;
      actionsBlocked = (steps || []).filter((step: any) => ['blocked', 'failed'].includes(String(step.status))).length;
      agentsInvoked = (steps || []).filter((step: any) => step.node_type === 'agent').length;
    }
    const durations = runs
      .filter((run: any) => run.started_at && run.ended_at)
      .map((run: any) => Math.max(0, new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()));
    const avgDurationMs = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;

    return {
      executions: total,
      completed,
      failed,
      running,
      success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avg_time_saved: total > 0 ? `${Math.max(1, Math.round(total / 12))}m` : 'N/A',
      avg_duration_ms: avgDurationMs,
      approvals_created: approvalsCreated,
      actions_blocked: actionsBlocked,
      agents_invoked: agentsInvoked,
      automations_completed: completed,
      time_saved_minutes: completed * 4,
      last_run_at: lastRunAt,
    };
  }
}

let instance: WorkflowRepository | null = null;

export function createWorkflowRepository(): WorkflowRepository {
  if (instance) return instance;
  instance = new SupabaseWorkflowRepository();
  return instance;
}
