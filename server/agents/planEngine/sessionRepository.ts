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

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour default

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
      ttl_at: session.ttlAt,
    });
    if (error) throw error;
  } catch (err) {
    logger.warn('SessionRepository.save failed', { sessionId: session.id, error: String(err) });
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
