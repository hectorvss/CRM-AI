import { getSupabaseAdmin } from '../db/supabase.js';

export interface McpScope { tenantId: string; workspaceId: string }

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface CreateMcpServerPayload {
  name:          string;
  description?:  string | null;
  transport:     McpTransport;
  endpoint_url?: string | null;
  command?:      string | null;
  args?:         string[];
  env_vars?:     Record<string, string>;
  tools_schema?: unknown[];
  resources?:    unknown[];
  enabled?:      boolean;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listMcpServers(scope: McpScope, onlyEnabled = false) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('mcp_servers')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');
  if (onlyEnabled) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getMcpServer(scope: McpScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('mcp_servers')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createMcpServer(scope: McpScope, payload: CreateMcpServerPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('mcp_servers')
    .insert({
      id:            randomUUID(),
      tenant_id:     scope.tenantId,
      workspace_id:  scope.workspaceId,
      name:          payload.name,
      description:   payload.description ?? null,
      transport:     payload.transport,
      endpoint_url:  payload.endpoint_url ?? null,
      command:       payload.command ?? null,
      args:          payload.args ?? [],
      env_vars:      payload.env_vars ?? {},
      tools_schema:  payload.tools_schema ?? [],
      resources:     payload.resources ?? [],
      enabled:       payload.enabled ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateMcpServer(
  scope: McpScope, id: string, payload: Partial<CreateMcpServerPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = ['name','description','transport','endpoint_url','command','args','env_vars','tools_schema','resources','enabled'] as const;
  for (const f of fields) {
    if (payload[f] !== undefined) updates[f] = payload[f];
  }
  const { data, error } = await supabase
    .from('mcp_servers')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteMcpServer(scope: McpScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('mcp_servers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

/** Update the last_ping_at timestamp (called by health-check) */
export async function pingMcpServer(scope: McpScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('mcp_servers')
    .update({ last_ping_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

/** Persist the tools_schema discovered from the MCP server */
export async function updateToolsSchema(
  scope: McpScope,
  id: string,
  toolsSchema: unknown[],
  resources: unknown[] = [],
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('mcp_servers')
    .update({
      tools_schema: toolsSchema,
      resources,
      last_ping_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}
