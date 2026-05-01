import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export type SuperAgentFeedbackDecision = 'approve' | 'reject' | 'override';
export type SuperAgentScheduledActionKind = 'reminder' | 'message' | 'workflow' | 'agent';
export type SuperAgentScheduledActionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface SuperAgentOpsScope {
  tenantId: string;
  workspaceId: string;
}

export interface SuperAgentFeedbackInput {
  sessionId?: string | null;
  runId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  tool?: string | null;
  decision: SuperAgentFeedbackDecision;
  accepted: boolean;
  rationale?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface SuperAgentScheduledActionInput {
  title: string;
  kind: SuperAgentScheduledActionKind;
  dueAt: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
  createdBy?: string | null;
  sessionId?: string | null;
  runId?: string | null;
}

export interface SuperAgentScheduledActionRecord {
  id: string;
  tenant_id: string;
  workspace_id: string;
  title: string;
  kind: SuperAgentScheduledActionKind;
  status: SuperAgentScheduledActionStatus;
  due_at: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  session_id: string | null;
  run_id: string | null;
  executed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuperAgentFeedbackRecord {
  id: string;
  tenant_id: string;
  workspace_id: string;
  session_id: string | null;
  run_id: string | null;
  target_type: string | null;
  target_id: string | null;
  tool: string | null;
  decision: SuperAgentFeedbackDecision;
  accepted: boolean;
  rationale: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface SuperAgentOpsRepository {
  recordFeedbackDecision(scope: SuperAgentOpsScope, input: SuperAgentFeedbackInput): Promise<SuperAgentFeedbackRecord>;
  listFeedbackDecisions(scope: SuperAgentOpsScope, limit?: number): Promise<SuperAgentFeedbackRecord[]>;
  createScheduledAction(scope: SuperAgentOpsScope, input: SuperAgentScheduledActionInput): Promise<SuperAgentScheduledActionRecord>;
  listScheduledActions(
    scope: SuperAgentOpsScope,
    options?: { status?: SuperAgentScheduledActionStatus | 'all'; limit?: number },
  ): Promise<SuperAgentScheduledActionRecord[]>;
  claimDueScheduledActions(scope: SuperAgentOpsScope, now?: string, limit?: number): Promise<SuperAgentScheduledActionRecord[]>;
  completeScheduledAction(scope: SuperAgentOpsScope, id: string, updates?: { executedAt?: string; lastError?: string | null }): Promise<void>;
  failScheduledAction(scope: SuperAgentOpsScope, id: string, error: string): Promise<void>;
  cancelScheduledAction(scope: SuperAgentOpsScope, id: string): Promise<void>;
}

function serializePayload(payload?: Record<string, unknown> | null) {
  return payload && typeof payload === 'object' ? payload : {};
}

function mapScheduledAction(row: any): SuperAgentScheduledActionRecord {
  return {
    ...row,
    payload: typeof row?.payload === 'string'
      ? JSON.parse(row.payload || '{}')
      : (row?.payload || {}),
  };
}

class SQLiteSuperAgentOpsRepository implements SuperAgentOpsRepository {
  async recordFeedbackDecision(scope: SuperAgentOpsScope, input: SuperAgentFeedbackInput): Promise<SuperAgentFeedbackRecord> {
    const db = getDb();
    const id = crypto.randomUUID();
    const record = {
      id,
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      tool: input.tool ?? null,
      decision: input.decision,
      accepted: input.accepted ? 1 : 0,
      rationale: input.rationale ?? null,
      metadata: JSON.stringify(serializePayload(input.metadata)),
      created_by: input.createdBy ?? null,
      created_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO super_agent_feedback
      (id, tenant_id, workspace_id, session_id, run_id, target_type, target_id, tool, decision, accepted, rationale, metadata, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.tenant_id,
      record.workspace_id,
      record.session_id,
      record.run_id,
      record.target_type,
      record.target_id,
      record.tool,
      record.decision,
      record.accepted,
      record.rationale,
      record.metadata,
      record.created_by,
      record.created_at,
    );

    return mapFeedbackRecord({
      ...record,
      metadata: serializePayload(input.metadata),
    });
  }

  async listFeedbackDecisions(scope: SuperAgentOpsScope, limit = 25): Promise<SuperAgentFeedbackRecord[]> {
    const db = getDb();
    return db.prepare(`
      SELECT *
      FROM super_agent_feedback
      WHERE tenant_id = ? AND workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(scope.tenantId, scope.workspaceId, limit).map(mapFeedbackRecord);
  }

  async createScheduledAction(scope: SuperAgentOpsScope, input: SuperAgentScheduledActionInput): Promise<SuperAgentScheduledActionRecord> {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = {
      id,
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      title: input.title,
      kind: input.kind,
      status: 'pending' as SuperAgentScheduledActionStatus,
      due_at: input.dueAt,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      payload: JSON.stringify(serializePayload(input.payload)),
      created_by: input.createdBy ?? null,
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      executed_at: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };

    db.prepare(`
      INSERT INTO super_agent_scheduled_actions
      (id, tenant_id, workspace_id, title, kind, status, due_at, target_type, target_id, payload, created_by, session_id, run_id, executed_at, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.tenant_id,
      record.workspace_id,
      record.title,
      record.kind,
      record.status,
      record.due_at,
      record.target_type,
      record.target_id,
      record.payload,
      record.created_by,
      record.session_id,
      record.run_id,
      record.executed_at,
      record.last_error,
      record.created_at,
      record.updated_at,
    );

    return mapScheduledAction({ ...record, payload: serializePayload(input.payload) });
  }

  async listScheduledActions(scope: SuperAgentOpsScope, options?: { status?: SuperAgentScheduledActionStatus | 'all'; limit?: number }): Promise<SuperAgentScheduledActionRecord[]> {
    const db = getDb();
    const limit = options?.limit ?? 25;
    const status = options?.status ?? 'all';
    const rows = status === 'all'
      ? db.prepare(`
          SELECT *
          FROM super_agent_scheduled_actions
          WHERE tenant_id = ? AND workspace_id = ?
          ORDER BY due_at DESC
          LIMIT ?
        `).all(scope.tenantId, scope.workspaceId, limit)
      : db.prepare(`
          SELECT *
          FROM super_agent_scheduled_actions
          WHERE tenant_id = ? AND workspace_id = ? AND status = ?
          ORDER BY due_at DESC
          LIMIT ?
        `).all(scope.tenantId, scope.workspaceId, status, limit);
    return rows.map(mapScheduledAction);
  }

  async claimDueScheduledActions(scope: SuperAgentOpsScope, now = new Date().toISOString(), limit = 25): Promise<SuperAgentScheduledActionRecord[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT *
      FROM super_agent_scheduled_actions
      WHERE tenant_id = ? AND workspace_id = ? AND status = 'pending' AND due_at <= ?
      ORDER BY due_at ASC
      LIMIT ?
    `).all(scope.tenantId, scope.workspaceId, now) as any[];

    for (const row of rows) {
      db.prepare(`
        UPDATE super_agent_scheduled_actions
        SET status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND workspace_id = ? AND status = 'pending'
      `).run(row.id, scope.tenantId, scope.workspaceId);
    }

    return rows.slice(0, limit).map(mapScheduledAction);
  }

  async completeScheduledAction(scope: SuperAgentOpsScope, id: string, updates?: { executedAt?: string; lastError?: string | null }): Promise<void> {
    const db = getDb();
    db.prepare(`
      UPDATE super_agent_scheduled_actions
      SET status = 'completed',
          executed_at = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(updates?.executedAt ?? new Date().toISOString(), updates?.lastError ?? null, id, scope.tenantId, scope.workspaceId);
  }

  async failScheduledAction(scope: SuperAgentOpsScope, id: string, error: string): Promise<void> {
    const db = getDb();
    db.prepare(`
      UPDATE super_agent_scheduled_actions
      SET status = 'failed',
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(error, id, scope.tenantId, scope.workspaceId);
  }

  async cancelScheduledAction(scope: SuperAgentOpsScope, id: string): Promise<void> {
    const db = getDb();
    db.prepare(`
      UPDATE super_agent_scheduled_actions
      SET status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(id, scope.tenantId, scope.workspaceId);
  }
}

class SupabaseSuperAgentOpsRepository implements SuperAgentOpsRepository {
  async recordFeedbackDecision(scope: SuperAgentOpsScope, input: SuperAgentFeedbackInput): Promise<SuperAgentFeedbackRecord> {
    const supabase = getSupabaseAdmin();
    const id = crypto.randomUUID();
    const payload = {
      id,
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      tool: input.tool ?? null,
      decision: input.decision,
      accepted: input.accepted,
      rationale: input.rationale ?? null,
      metadata: serializePayload(input.metadata),
      created_by: input.createdBy ?? null,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('super_agent_feedback').insert(payload);
    if (error) throw error;
    return mapFeedbackRecord(payload);
  }

  async listFeedbackDecisions(scope: SuperAgentOpsScope, limit = 25): Promise<SuperAgentFeedbackRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_feedback')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(mapFeedbackRecord);
  }

  async createScheduledAction(scope: SuperAgentOpsScope, input: SuperAgentScheduledActionInput): Promise<SuperAgentScheduledActionRecord> {
    const supabase = getSupabaseAdmin();
    const payload = {
      id: crypto.randomUUID(),
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      title: input.title,
      kind: input.kind,
      status: 'pending',
      due_at: input.dueAt,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      payload: serializePayload(input.payload),
      created_by: input.createdBy ?? null,
      session_id: input.sessionId ?? null,
      run_id: input.runId ?? null,
      executed_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('super_agent_scheduled_actions').insert(payload);
    if (error) throw error;
    return mapScheduledAction(payload);
  }

  async listScheduledActions(scope: SuperAgentOpsScope, options?: { status?: SuperAgentScheduledActionStatus | 'all'; limit?: number }): Promise<SuperAgentScheduledActionRecord[]> {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('super_agent_scheduled_actions')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .order('due_at', { ascending: false });
    if (options?.status && options.status !== 'all') query = query.eq('status', options.status);
    const { data, error } = await query.limit(options?.limit ?? 25);
    if (error) throw error;
    return (data || []).map(mapScheduledAction);
  }

  async claimDueScheduledActions(scope: SuperAgentOpsScope, now = new Date().toISOString(), limit = 25): Promise<SuperAgentScheduledActionRecord[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_scheduled_actions')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('status', 'pending')
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      await supabase
        .from('super_agent_scheduled_actions')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId)
        .eq('status', 'pending');
    }
    return rows.map(mapScheduledAction);
  }

  async completeScheduledAction(scope: SuperAgentOpsScope, id: string, updates?: { executedAt?: string; lastError?: string | null }): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('super_agent_scheduled_actions')
      .update({
        status: 'completed',
        executed_at: updates?.executedAt ?? new Date().toISOString(),
        last_error: updates?.lastError ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
  }

  async failScheduledAction(scope: SuperAgentOpsScope, id: string, errorMessage: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('super_agent_scheduled_actions')
      .update({
        status: 'failed',
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
  }

  async cancelScheduledAction(scope: SuperAgentOpsScope, id: string): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('super_agent_scheduled_actions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
  }
}

function mapFeedbackRecord(row: any): SuperAgentFeedbackRecord {
  return {
    ...row,
    accepted: Boolean(row?.accepted),
    metadata: typeof row?.metadata === 'string'
      ? JSON.parse(row.metadata || '{}')
      : (row?.metadata || {}),
  };
}

let instance: SuperAgentOpsRepository | null = null;

export function createSuperAgentOpsRepository(): SuperAgentOpsRepository {
  if (instance) return instance;
  instance = getDatabaseProvider() === 'supabase'
    ? new SupabaseSuperAgentOpsRepository()
    : new SQLiteSuperAgentOpsRepository();
  return instance;
}
