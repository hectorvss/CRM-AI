import { getSupabaseAdmin } from '../db/supabase.js';

export interface ToolScope { tenantId: string; workspaceId: string }

export type ToolType = 'http_request' | 'sql_query' | 'javascript' | 'mcp_call' | 'builtin';

export interface CreateAgentToolPayload {
  name:           string;
  description?:   string | null;
  tool_type:      ToolType;
  endpoint_url?:  string | null;
  http_method?:   string | null;
  headers?:       Record<string, string>;
  input_schema?:  Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  auth_type?:     string | null;
  auth_config?:   Record<string, unknown>;
  enabled?:       boolean;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listAgentTools(scope: ToolScope, onlyEnabled = false) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('agent_tools')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');
  if (onlyEnabled) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getAgentTool(scope: ToolScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_tools')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAgentTool(scope: ToolScope, payload: CreateAgentToolPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('agent_tools')
    .insert({
      id:            randomUUID(),
      tenant_id:     scope.tenantId,
      workspace_id:  scope.workspaceId,
      name:          payload.name,
      description:   payload.description ?? null,
      tool_type:     payload.tool_type,
      endpoint_url:  payload.endpoint_url ?? null,
      http_method:   payload.http_method ?? null,
      headers:       payload.headers ?? {},
      input_schema:  payload.input_schema ?? {},
      output_schema: payload.output_schema ?? {},
      auth_type:     payload.auth_type ?? 'none',
      auth_config:   payload.auth_config ?? {},
      enabled:       payload.enabled ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAgentTool(
  scope: ToolScope, id: string, payload: Partial<CreateAgentToolPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const keys: (keyof CreateAgentToolPayload)[] = [
    'name','description','tool_type','endpoint_url','http_method',
    'headers','input_schema','output_schema','auth_type','auth_config','enabled',
  ];
  for (const k of keys) {
    if (payload[k] !== undefined) updates[k] = payload[k];
  }
  const { data, error } = await supabase
    .from('agent_tools')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteAgentTool(scope: ToolScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('agent_tools')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── HTTP Tool Execution ───────────────────────────────────────────────────────

export interface ExecuteToolResult {
  success: boolean;
  status:  number;
  data:    unknown;
  error?:  string;
  duration_ms: number;
}

export async function executeHttpTool(
  tool: Record<string, unknown>,
  inputArgs: Record<string, unknown>,
): Promise<ExecuteToolResult> {
  const start = Date.now();

  if (tool.tool_type !== 'http_request' || !tool.endpoint_url) {
    return { success: false, status: 0, data: null, error: 'Tool is not an HTTP request tool', duration_ms: 0 };
  }

  try {
    // Replace template variables {{key}} in URL
    let url = tool.endpoint_url as string;
    for (const [k, v] of Object.entries(inputArgs)) {
      url = url.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }

    const method = (tool.http_method as string | undefined) ?? 'GET';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((tool.headers as Record<string, string> | undefined) ?? {}),
    };

    // Auth injection
    const authCfg = (tool.auth_config as Record<string, string> | undefined) ?? {};
    if (tool.auth_type === 'bearer' && authCfg.token) {
      headers['Authorization'] = `Bearer ${authCfg.token}`;
    } else if (tool.auth_type === 'api_key' && authCfg.key && authCfg.header) {
      headers[authCfg.header] = authCfg.key;
    }

    const fetchOpts: RequestInit = { method, headers };
    if (!['GET','HEAD'].includes(method)) {
      fetchOpts.body = JSON.stringify(inputArgs);
    }

    const resp = await fetch(url, fetchOpts);
    const text = await resp.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return {
      success:     resp.ok,
      status:      resp.status,
      data:        parsed,
      error:       resp.ok ? undefined : `HTTP ${resp.status}`,
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false, status: 0, data: null,
      error: err?.message ?? 'Unknown error',
      duration_ms: Date.now() - start,
    };
  }
}
