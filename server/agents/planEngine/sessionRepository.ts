/**
 * server/agents/planEngine/sessionRepository.ts
 *
 * DB-backed session store for Plan Engine conversational state (CIL L1/L2).
 * Replaces the in-memory Map in planEngine/index.ts.
 *
 * Sessions are keyed by id (UUIDv4). TTL is enforced via ttl_at and a
 * periodic cleanup query (not a cron; done lazily on access).
 */

import { getDb } from '../../db/client.js';
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ttlAt: row.ttl_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getSession(sessionId: string): SessionState | null {
  try {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM super_agent_sessions WHERE id = ?')
      .get(sessionId);
    if (!row) return null;

    const session = rowToSession(row);
    // Lazy TTL enforcement
    if (new Date(session.ttlAt) < new Date()) {
      db.prepare('DELETE FROM super_agent_sessions WHERE id = ?').run(sessionId);
      return null;
    }
    return session;
  } catch (err) {
    logger.warn('SessionRepository.get failed', { sessionId, error: String(err) });
    return null;
  }
}

export function createSession(
  id: string,
  userId: string,
  tenantId: string,
  workspaceId: string | null,
): SessionState {
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
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO super_agent_sessions
        (id, user_id, tenant_id, workspace_id, turns_json, summary,
         slots_json, recent_targets_json, pending_approval_ids_json, active_plan_id,
         created_at, updated_at, ttl_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, tenantId, workspaceId,
      '[]', '', '{}', '[]', '[]', null,
      now, now, ttlAt,
    );
  } catch (err) {
    logger.warn('SessionRepository.create failed — using in-memory fallback', { id, error: String(err) });
  }
  return session;
}

export function getOrCreateSession(
  sessionId: string,
  userId: string,
  tenantId: string,
  workspaceId: string | null,
): SessionState {
  return getSession(sessionId) ?? createSession(sessionId, userId, tenantId, workspaceId);
}

export function saveSession(session: SessionState): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO super_agent_sessions
        (id, user_id, tenant_id, workspace_id, turns_json, summary,
         slots_json, recent_targets_json, pending_approval_ids_json, active_plan_id,
         created_at, updated_at, ttl_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.userId,
      session.tenantId,
      session.workspaceId ?? null,
      JSON.stringify(session.turns),
      session.summary,
      JSON.stringify(session.slots),
      JSON.stringify(session.recentTargets ?? []),
      JSON.stringify(session.pendingApprovalIds),
      session.activePlanId ?? null,
      session.createdAt,
      now,
      session.ttlAt,
    );
  } catch (err) {
    logger.warn('SessionRepository.save failed', { sessionId: session.id, error: String(err) });
  }
}

/** Prune expired sessions. Call periodically (e.g. every 10 min) from a scheduled job. */
export function pruneExpiredSessions(): number {
  try {
    const db = getDb();
    const result = db
      .prepare("DELETE FROM super_agent_sessions WHERE ttl_at < datetime('now')")
      .run();
    return result.changes;
  } catch {
    return 0;
  }
}
