/**
 * server/agents/finAgent/connectors.ts
 *
 * Data Connectors (spec §5.1): typed actions against internal systems (the
 * plan-engine tool registry) or external HTTP APIs, governed by a per-action
 * policy:
 *
 *   read           — agent executes freely (side-effect-free)
 *   write_auto     — agent executes on its own (low-risk writes)
 *   write_approval — a fin_pending_actions row is created; a human approves
 *                    from the inbox and THEN the runtime executes
 *   blocked        — never executable
 *
 * External auth is encrypted at rest (AES-256-GCM, FIN_CONNECTOR_SECRET) and
 * NEVER returned by API reads nor shown to the model.
 */

import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { invokeTool } from '../planEngine/invokeTool.js';
import type { FinScope } from './config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionPolicy = 'read' | 'write_auto' | 'write_approval' | 'blocked';

export interface ConnectorAction {
  id: string;
  connector_id: string;
  name: string;
  description: string;
  tool_name: string | null;
  http_method: string | null;
  http_path: string | null;
  input_schema: Record<string, unknown>;
  policy: ActionPolicy;
  requires_identity: boolean;
}

export interface ConnectorRow {
  id: string;
  name: string;
  kind: 'internal' | 'http';
  base_url: string | null;
  auth_encrypted: string | null;
  active: boolean;
}

export type ActionExecution =
  | { status: 'executed'; result: unknown }
  | { status: 'pending_approval'; pendingActionId: string }
  | { status: 'blocked'; reason: string }
  | { status: 'failed'; error: string };

// ── Secrets (AES-256-GCM) ─────────────────────────────────────────────────────

function connectorKey(): Buffer | null {
  const secret = process.env.FIN_CONNECTOR_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptAuth(auth: Record<string, unknown>): string {
  const key = connectorKey();
  if (!key) {
    throw Object.assign(new Error('FIN_CONNECTOR_SECRET is not set — refusing to store connector credentials'), {
      code: 'FIN_SECRET_MISSING',
    });
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(auth), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function decryptAuth(payload: string): Record<string, unknown> {
  const key = connectorKey();
  if (!key) throw new Error('FIN_CONNECTOR_SECRET is not set');
  const [ivB64, tagB64, ctB64] = payload.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

// ── Lookup ────────────────────────────────────────────────────────────────────

export async function getActionWithConnector(
  scope: FinScope,
  actionId: string,
): Promise<{ action: ConnectorAction; connector: ConnectorRow } | null> {
  const supabase = getSupabaseAdmin();
  const { data: action, error } = await supabase
    .from('fin_connector_actions')
    .select('*')
    .eq('id', actionId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!action) return null;
  const { data: connector, error: cErr } = await supabase
    .from('fin_connectors')
    .select('*')
    .eq('id', action.connector_id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!connector || !connector.active) return null;
  return { action: action as ConnectorAction, connector: connector as ConnectorRow };
}

export async function listActionsForAgent(scope: FinScope): Promise<Array<ConnectorAction & { connector_name: string }>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('fin_connector_actions')
    .select('*, fin_connectors!inner(name, active)')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .neq('policy', 'blocked')
    .eq('fin_connectors.active', true);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, connector_name: r.fin_connectors?.name ?? '' }));
}

// ── Execution ─────────────────────────────────────────────────────────────────

async function executeNow(
  scope: FinScope,
  action: ConnectorAction,
  connector: ConnectorRow,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (connector.kind === 'internal') {
    if (!action.tool_name) throw new Error('internal action has no tool_name');
    const result = await invokeTool({
      toolName: action.tool_name,
      args,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: 'fin-agent',
      hasPermission: () => true, // policy gating happens at the action layer
      dryRun: false,
    });
    if (!result.ok) {
      const failed = result as Extract<typeof result, { ok: false }>;
      throw new Error(`${failed.errorCode}: ${failed.error}`);
    }
    return result.value;
  }

  // HTTP connector
  if (!connector.base_url || !action.http_path || !action.http_method) {
    throw new Error('http action is missing base_url/method/path');
  }
  // Path template: /orders/{order_id}
  let path = action.http_path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(args[k] ?? '')));
  const url = new URL(path, connector.base_url).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (connector.auth_encrypted) {
    const auth = decryptAuth(connector.auth_encrypted);
    if (typeof auth.bearer === 'string') headers.Authorization = `Bearer ${auth.bearer}`;
    if (typeof auth.header_name === 'string' && typeof auth.header_value === 'string') {
      headers[auth.header_name] = auth.header_value;
    }
  }
  const hasBody = !['GET', 'DELETE'].includes(action.http_method);
  const res = await fetch(url, {
    method: action.http_method,
    headers,
    ...(hasBody ? { body: JSON.stringify(args) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

export interface ExecuteActionInput {
  scope: FinScope;
  actionId: string;
  args: Record<string, unknown>;
  runId: string;
  caseId: string;
  /** true once the identity-verification step succeeded in this run */
  identityVerified: boolean;
  /** short human preview for the approval card */
  preview?: string;
}

/** Policy-governed execution entry point used by the procedure executor. */
export async function executeConnectorAction(input: ExecuteActionInput): Promise<ActionExecution> {
  const found = await getActionWithConnector(input.scope, input.actionId);
  if (!found) return { status: 'failed', error: 'action not found or connector inactive' };
  const { action, connector } = found;

  if (action.policy === 'blocked') return { status: 'blocked', reason: 'action policy is blocked' };
  if (action.requires_identity && !input.identityVerified) {
    return { status: 'blocked', reason: 'identity verification required before this action' };
  }

  if (action.policy === 'write_approval') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('fin_pending_actions').insert({
      tenant_id: input.scope.tenantId,
      workspace_id: input.scope.workspaceId,
      run_id: input.runId,
      case_id: input.caseId,
      action_id: input.actionId,
      args: input.args,
      preview: input.preview ?? `${connector.name} · ${action.name}`,
    }).select('id').single();
    if (error) return { status: 'failed', error: error.message };
    return { status: 'pending_approval', pendingActionId: data.id };
  }

  try {
    const result = await executeNow(input.scope, action, connector, input.args);
    return { status: 'executed', result };
  } catch (err: any) {
    return { status: 'failed', error: String(err?.message ?? err) };
  }
}

/** Approval resolution (called from the inbox API): executes on approve. */
export async function decidePendingAction(
  scope: FinScope,
  pendingId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data: pending, error } = await supabase
    .from('fin_pending_actions')
    .select('*')
    .eq('id', pendingId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!pending) return { ok: false, error: 'pending action not found (or already decided)' };

  const now = new Date().toISOString();
  if (decision === 'rejected') {
    await supabase.from('fin_pending_actions')
      .update({ status: 'rejected', decided_at: now, decided_by: decidedBy })
      .eq('id', pendingId);
    return { ok: true };
  }

  const found = await getActionWithConnector(scope, pending.action_id);
  if (!found) {
    await supabase.from('fin_pending_actions')
      .update({ status: 'failed', decided_at: now, decided_by: decidedBy, result: { error: 'action missing' } })
      .eq('id', pendingId);
    return { ok: false, error: 'action not found' };
  }
  try {
    const result = await executeNow(scope, found.action, found.connector, pending.args ?? {});
    await supabase.from('fin_pending_actions')
      .update({ status: 'executed', decided_at: now, decided_by: decidedBy, executed_at: new Date().toISOString(), result: { value: result } })
      .eq('id', pendingId);
    return { ok: true, result };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    await supabase.from('fin_pending_actions')
      .update({ status: 'failed', decided_at: now, decided_by: decidedBy, result: { error: msg } })
      .eq('id', pendingId);
    return { ok: false, error: msg };
  }
}
