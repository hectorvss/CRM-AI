import { getSupabaseAdmin } from '../db/supabase.js';

export interface FlowScope { tenantId: string; workspaceId: string }

export interface CreateFlowPayload {
  name:        string;
  description?: string | null;
  nodes?:      unknown[];
  edges?:      unknown[];
  viewport?:   Record<string, unknown>;
  status?:     'draft' | 'published' | 'archived';
  created_by?: string | null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listVisualFlows(scope: FlowScope, status?: 'draft' | 'published' | 'archived') {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('visual_flows').select('id, name, description, status, created_at, updated_at, published_at')
    .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('updated_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getVisualFlow(scope: FlowScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('visual_flows').select('*')
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createVisualFlow(scope: FlowScope, payload: CreateFlowPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('visual_flows').insert({
    id:           randomUUID(),
    tenant_id:    scope.tenantId,
    workspace_id: scope.workspaceId,
    name:         payload.name,
    description:  payload.description ?? null,
    nodes:        payload.nodes ?? [],
    edges:        payload.edges ?? [],
    viewport:     payload.viewport ?? {},
    status:       payload.status ?? 'draft',
    created_by:   payload.created_by ?? null,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateVisualFlow(
  scope: FlowScope, id: string, payload: Partial<CreateFlowPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: (keyof CreateFlowPayload)[] = ['name','description','nodes','edges','viewport','status'];
  for (const f of fields) if (payload[f] !== undefined) updates[f] = payload[f];
  if (payload.status === 'published') updates.published_at = new Date().toISOString();

  const { data, error } = await supabase.from('visual_flows').update(updates)
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteVisualFlow(scope: FlowScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('visual_flows').delete()
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Versioning ────────────────────────────────────────────────────────────────

export async function createFlowVersion(
  scope: FlowScope,
  flowId: string,
  changeSummary?: string,
  createdBy?: string,
) {
  const flow = await getVisualFlow(scope, flowId);
  if (!flow) throw new Error('Flow not found');

  const supabase = getSupabaseAdmin();
  // Get next version number
  const { data: latest } = await supabase
    .from('visual_flow_versions')
    .select('version')
    .eq('flow_id', flowId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('visual_flow_versions').insert({
    id:             randomUUID(),
    flow_id:        flowId,
    tenant_id:      scope.tenantId,
    version:        nextVersion,
    nodes:          flow.nodes,
    edges:          flow.edges,
    created_by:     createdBy ?? null,
    change_summary: changeSummary ?? null,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function listFlowVersions(scope: FlowScope, flowId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('visual_flow_versions')
    .select('id, version, created_by, change_summary, created_at')
    .eq('flow_id', flowId)
    .eq('tenant_id', scope.tenantId)
    .order('version', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function restoreFlowVersion(scope: FlowScope, flowId: string, version: number) {
  const supabase = getSupabaseAdmin();
  const { data: ver } = await supabase.from('visual_flow_versions').select('*')
    .eq('flow_id', flowId).eq('tenant_id', scope.tenantId).eq('version', version).maybeSingle();
  if (!ver) throw new Error('Version not found');
  return updateVisualFlow(scope, flowId, { nodes: ver.nodes, edges: ver.edges, status: 'draft' });
}
