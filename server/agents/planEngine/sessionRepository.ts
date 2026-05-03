/**
 * server/agents/planEngine/sessionRepository.ts
 *
 * Supabase-backed session store for Plan Engine conversational state (CIL L1/L2).
 *
 * Sessions are keyed by id (UUIDv4). TTL is enforced via ttl_at and a
 * periodic cleanup query (done lazily on access and via pruneExpiredSessions).
 */

import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { SessionState, Turn, Slot, ConversationTarget } from './types.js';

// 30 days. Conversations are persistent per user (the chat history sidebar
// surfaces them); the TTL is a safety net for abandoned threads only —
// active sessions get their `ttl_at` refreshed on every saveSession call.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToSession(row: any): SessionState {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id ?? null,
    turns: JSON.parse(row.turns_json || '[]') as Turn[],
    summary: row.summary ?? '',
    slots: JSON.parse(row.slots_json || '{}') as Record<string, Slot>,
    recentTargets: JSON.parse(row.recent_targets_json || '[]') as ConversationTarget[],
    pendingApprovalIds: JSON.parse(row.pending_approval_ids_json || '[]') as string[],
    activePlanId: row.active_plan_id ?? undefined,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
    ttlAt: typeof row.ttl_at === 'string' ? row.ttl_at : new Date(row.ttl_at).toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<SessionState | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !data) return null;

    const session = rowToSession(data);
    // Lazy TTL enforcement
    if (new Date(session.ttlAt) < new Date()) {
      await supabase.from('super_agent_sessions').delete().eq('id', sessionId);
      return null;
    }
    return session;
  } catch (err) {
    logger.warn('SessionRepository.get failed', { sessionId, error: String(err) });
    return null;
  }
}

export async function createSession(
  id: string,
  userId: string,
  tenantId: string,
  workspaceId: string | null,
): Promise<SessionState> {
  const now = new Date().toISOString();
  const ttlAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const session: SessionState = {
    id,
    userId,
    tenantId,
    workspaceId,
    turns: [],
    summary: '',
    slots: {},
    recentTargets: [],
    pendingApprovalIds: [],
    createdAt: now,
    updatedAt: now,
    ttlAt,
  };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('super_agent_sessions').upsert({
      id,
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      turns_json: '[]',
      summary: '',
      slots_json: '{}',
      recent_targets_json: '[]',
      pending_approval_ids_json: '[]',
      active_plan_id: null,
      created_at: now,
      updated_at: now,
      ttl_at: ttlAt,
    });
    if (error) throw error;
  } catch (err) {
    logger.warn('SessionRepository.create failed', { id, error: String(err) });
  }
  return session;
}

export async function getOrCreateSession(
  sessionId: string,
  userId: string,
  tenantId: string,
  workspaceId: string | null,
): Promise<SessionState> {
  return (await getSession(sessionId)) ?? (await createSession(sessionId, userId, tenantId, workspaceId));
}

export async function saveSession(session: SessionState): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    // Refresh the TTL on every write so active threads never expire while
    // the user is using them.
    const refreshedTtl = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    session.ttlAt = refreshedTtl;
    const { error } = await supabase.from('super_agent_sessions').upsert({
      id: session.id,
      user_id: session.userId,
      tenant_id: session.tenantId,
      workspace_id: session.workspaceId ?? null,
      turns_json: JSON.stringify(session.turns),
      summary: session.summary,
      slots_json: JSON.stringify(session.slots),
      recent_targets_json: JSON.stringify(session.recentTargets ?? []),
      pending_approval_ids_json: JSON.stringify(session.pendingApprovalIds),
      active_plan_id: session.activePlanId ?? null,
      created_at: session.createdAt,
      updated_at: now,
      ttl_at: refreshedTtl,
    });
    if (error) throw error;
  } catch (err) {
    logger.warn('SessionRepository.save failed', { sessionId: session.id, error: String(err) });
  }
}

/**
 * Saved-conversation summary returned by the sidebar list endpoint.
 * Strictly scoped: caller must pass userId, tenantId, workspaceId — the
 * query filters by all three so a user can only see THEIR own threads.
 */
export interface SessionSummary {
  id: string;
  title: string;
  preview: string;
  turnCount: number;
  updatedAt: string;
  createdAt: string;
}

function deriveTitle(turns: Turn[], summary: string): string {
  const firstUser = turns.find((t) => t.role === 'user' && t.content?.trim());
  if (firstUser) {
    const text = firstUser.content.trim().replace(/\s+/g, ' ');
    return text.length > 60 ? `${text.slice(0, 57).trimEnd()}...` : text;
  }
  if (summary && summary.trim()) return summary.trim().slice(0, 60);
  return 'New conversation';
}

function derivePreview(turns: Turn[]): string {
  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant' && t.content?.trim());
  const target = lastAssistant ?? turns[turns.length - 1];
  if (!target?.content) return '';
  const text = String(target.content).replace(/\s+/g, ' ').trim();
  return text.length > 110 ? `${text.slice(0, 107).trimEnd()}...` : text;
}

/**
 * List all sessions belonging to a specific user within a tenant+workspace.
 *
 * Privacy invariant: every filter (user_id, tenant_id, workspace_id) MUST be
 * applied — never relax this. The service-role client bypasses RLS, so this
 * function is the only barrier between users seeing each other's threads.
 */
export async function listSessionsForUser(
  userId: string,
  tenantId: string,
  workspaceId: string | null,
  limit = 50,
): Promise<SessionSummary[]> {
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('super_agent_sessions')
      .select('id, turns_json, summary, updated_at, created_at, ttl_at')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .gt('ttl_at', new Date().toISOString())
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (workspaceId === null) {
      query = query.is('workspace_id', null);
    } else {
      query = query.eq('workspace_id', workspaceId);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    return rows
      .map((row: any) => {
        const turns = (() => {
          try { return JSON.parse(row.turns_json || '[]') as Turn[]; } catch { return []; }
        })();
        return {
          id: row.id,
          title: deriveTitle(turns, row.summary || ''),
          preview: derivePreview(turns),
          turnCount: turns.length,
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(row.updated_at).toISOString(),
          createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
        };
      })
      // Hide empty sessions (created but never had a user turn) so the
      // sidebar doesn't fill up with placeholders.
      .filter((s) => s.turnCount > 0);
  } catch (err) {
    logger.warn('SessionRepository.listForUser failed', { userId, error: String(err) });
    return [];
  }
}

/**
 * Delete a session. Privacy invariant: scoped to the owning user — the
 * route handler must pass req.userId so a user cannot delete someone else's
 * thread by guessing its UUID.
 */
export async function deleteSessionForUser(
  sessionId: string,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  } catch (err) {
    logger.warn('SessionRepository.deleteForUser failed', { sessionId, userId, error: String(err) });
    return false;
  }
}

/**
 * Set or clear the human-readable summary (used as the sidebar title).
 * Same privacy invariant as delete.
 */
export async function renameSessionForUser(
  sessionId: string,
  userId: string,
  tenantId: string,
  newTitle: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const trimmed = newTitle.trim().slice(0, 200);
    const { data, error } = await supabase
      .from('super_agent_sessions')
      .update({ summary: trimmed, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  } catch (err) {
    logger.warn('SessionRepository.renameForUser failed', { sessionId, userId, error: String(err) });
    return false;
  }
}

/** Prune expired sessions. Call periodically from a scheduled job. */
export async function pruneExpiredSessions(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('super_agent_sessions')
      .delete()
      .lt('ttl_at', new Date().toISOString())
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
