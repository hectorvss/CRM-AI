/**
 * server/data/agentConversations.ts
 *
 * Data store for the operator Super Agent conversations, backed by the
 * `agent_conversations` + `agent_messages` tables (migration 20260511_0008).
 *
 * Modeled after PostHog's Conversation persistence (ee_conversation) but as a
 * lightweight message log instead of full LangGraph checkpoints. The pending
 * approval "checkpoint" lives in `agent_conversations.pending_action` (phase 2
 * migration) — the PostHog equivalent of interrupting the graph.
 *
 * Follows the repo data-store convention: plain async functions taking an
 * explicit scope, querying via the service-role client with `.eq('tenant_id')`
 * filters (RLS is disabled — tenant isolation is an app-layer invariant).
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentScope {
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
}

/** One executed tool call, persisted inside agent_messages.tool_calls. */
export interface StoredToolCall {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  ok: boolean;
  durationMs: number;
  /** Set on approval-gated calls once decided. */
  approvalStatus?: 'approved' | 'rejected';
}

export interface AgentConversationRow {
  id: string;
  tenant_id: string;
  workspace_id: string | null;
  user_id: string | null;
  title: string;
  message_count: number;
  status?: string;             // 'active' | 'awaiting_approval' (phase 2 column)
  pending_action?: PendingAction | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls: StoredToolCall[] | null;
  created_at: string;
}

/** One provider message, stored verbatim in the pending checkpoint. */
export interface CheckpointMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolCallId?: string;
  isError?: boolean;
  toolCalls?: Array<{ id: string; toolName: string; args: Record<string, unknown> }>;
}

/**
 * Lightweight checkpoint for an approval-paused turn (phase 2).
 * Mirrors PostHog's pending ApprovalRequest + interrupted graph state, but
 * instead of a full LangGraph checkpoint we store just enough to resume: the
 * conversation state up to and including the interrupted assistant turn, the
 * tool calls awaiting a decision, and what to persist once the turn finishes.
 */
export interface PendingAction {
  proposalId: string;
  /** Full provider message state, including the interrupted assistant turn. */
  checkpointMessages: CheckpointMessage[];
  /** Tool calls from the interrupted turn awaiting execution/rejection. */
  requestedToolCalls: Array<{ toolCallId: string; toolName: string; args: unknown; risk: string }>;
  /** The high/critical tool that triggered the gate (surfaced in the UI card). */
  primaryToolName: string;
  primaryArgs: unknown;
  risk: string;
  /** Human-readable action summary, so the card can be rebuilt on reload. */
  preview: string;
  /** Assistant text accumulated across this run so far, for final persistence. */
  accumulatedText: string;
  /** Tool calls executed earlier in this run, for final persistence. */
  executedToolCalls: StoredToolCall[];
  createdAt: string;
  requestedBy: string | null;
}

/** Max serialized bytes persisted per tool result (model can always re-query). */
const MAX_RESULT_BYTES = 4096;

// ── Conversations ─────────────────────────────────────────────────────────────

export async function createConversation(
  scope: AgentScope,
  opts?: { id?: string; title?: string },
): Promise<AgentConversationRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_conversations')
    .insert({
      id: opts?.id ?? randomUUID(),
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      user_id: scope.userId,
      title: opts?.title ?? 'New conversation',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as AgentConversationRow;
}

export async function getConversation(
  scope: AgentScope,
  conversationId: string,
): Promise<AgentConversationRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_conversations')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data as AgentConversationRow) ?? null;
}

export async function listConversations(
  scope: AgentScope,
  limit = 50,
): Promise<AgentConversationRow[]> {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('agent_conversations')
    .select('id, tenant_id, workspace_id, user_id, title, message_count, created_at, updated_at')
    .eq('tenant_id', scope.tenantId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  // Conversations are personal to the operator (PostHog scopes them per user too).
  if (scope.userId) q = q.eq('user_id', scope.userId);

  const { data, error } = await q;
  if (error) {
    // 42P01 = table missing (migration not applied) — tolerate like other stores.
    if ((error as { code?: string }).code === '42P01') return [];
    throw error;
  }
  return (data ?? []) as AgentConversationRow[];
}

export async function updateTitle(
  scope: AgentScope,
  conversationId: string,
  title: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('agent_conversations')
    .update({ title: title.slice(0, 250), updated_at: new Date().toISOString() })
    .eq('tenant_id', scope.tenantId)
    .eq('id', conversationId);
  if (error) throw error;
}

export async function deleteConversation(
  scope: AgentScope,
  conversationId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  // agent_messages cascade via FK ON DELETE CASCADE.
  const { error } = await supabase
    .from('agent_conversations')
    .delete()
    .eq('tenant_id', scope.tenantId)
    .eq('id', conversationId);
  if (error) throw error;
}

/** Phase 2: persist / clear the approval checkpoint. */
export async function setPendingAction(
  scope: AgentScope,
  conversationId: string,
  pending: PendingAction | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('agent_conversations')
    .update({
      pending_action: pending,
      status: pending ? 'awaiting_approval' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', scope.tenantId)
    .eq('id', conversationId);
  if (error) throw error;
}

// ── Messages ──────────────────────────────────────────────────────────────────

function truncateResult(result: unknown): unknown {
  try {
    const json = JSON.stringify(result);
    if (json == null || json.length <= MAX_RESULT_BYTES) return result;
    return { _truncated: true, preview: json.slice(0, MAX_RESULT_BYTES) };
  } catch {
    return { _truncated: true, preview: String(result).slice(0, MAX_RESULT_BYTES) };
  }
}

export async function appendMessage(
  scope: AgentScope,
  conversationId: string,
  msg: {
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: StoredToolCall[];
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const toolCalls = msg.toolCalls?.length
    ? msg.toolCalls.map((tc) => ({ ...tc, result: truncateResult(tc.result) }))
    : null;

  const { error } = await supabase.from('agent_messages').insert({
    id: randomUUID(),
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    // Column is TEXT (see migration) — store serialized JSON.
    tool_calls: toolCalls ? JSON.stringify(toolCalls) : null,
  });
  if (error) throw error;

  const { error: rpcError } = await supabase.rpc('increment_agent_message_count', {
    conv_id: conversationId,
  });
  if (rpcError) {
    logger.warn('agentConversations: increment_agent_message_count failed', {
      error: rpcError.message,
      conversationId,
    });
  }
}

export async function listMessages(
  scope: AgentScope,
  conversationId: string,
  limit = 200,
): Promise<AgentMessageRow[]> {
  const supabase = getSupabaseAdmin();

  // Ownership check first — agent_messages has no tenant_id column.
  const conversation = await getConversation(scope, conversationId);
  if (!conversation) return [];

  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    tool_calls: parseToolCalls(row.tool_calls),
  })) as AgentMessageRow[];
}

function parseToolCalls(raw: unknown): StoredToolCall[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw as StoredToolCall[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as StoredToolCall[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}
