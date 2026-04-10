import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';

export interface ConversationScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export interface AppendMessageInput {
  conversationId: string;
  caseId: string | null;
  customerId?: string | null;
  type: string;
  direction?: string;
  senderId?: string | null;
  senderName?: string | null;
  content: string;
  channel: string;
  draftReplyId?: string | null;
  externalMessageId?: string | null;
  sentAt?: string;
}

export interface InternalNoteInput {
  caseId: string;
  content: string;
  createdBy?: string | null;
}

async function getConversationByCaseSupabase(scope: ConversationScope, caseId: string) {
  const supabase = getSupabaseAdmin();
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('*')
    .eq('case_id', caseId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return null;

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .eq('tenant_id', scope.tenantId)
    .order('sent_at', { ascending: true });
  if (messagesError) throw messagesError;

  return { ...conversation, messages: messages ?? [] };
}

async function getConversationSupabase(scope: ConversationScope, conversationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function listMessagesSupabase(scope: ConversationScope, conversationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', scope.tenantId)
    .order('sent_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function ensureConversationForCaseSupabase(scope: ConversationScope, caseRow: any) {
  const supabase = getSupabaseAdmin();

  if (caseRow.conversation_id) {
    const existing = await getConversationSupabase(scope, caseRow.conversation_id);
    if (existing) return existing;
  }

  const { data: byCase, error: byCaseError } = await supabase
    .from('conversations')
    .select('*')
    .eq('case_id', caseRow.id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byCaseError) throw byCaseError;
  if (byCase) return byCase;

  const now = new Date().toISOString();
  const conversationId = crypto.randomUUID();
  const payload = {
    id: conversationId,
    case_id: caseRow.id,
    customer_id: caseRow.customer_id || null,
    channel: caseRow.source_channel || 'web_chat',
    status: 'open',
    subject: null,
    external_thread_id: caseRow.source_entity_id || null,
    first_message_at: now,
    last_message_at: now,
    created_at: now,
    updated_at: now,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
  };

  const { error: insertError } = await supabase.from('conversations').insert(payload);
  if (insertError) throw insertError;

  const { error: caseError } = await supabase
    .from('cases')
    .update({ conversation_id: conversationId, updated_at: now })
    .eq('id', caseRow.id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (caseError) throw caseError;

  return payload;
}

async function appendMessageSupabase(scope: ConversationScope, input: AppendMessageInput) {
  const supabase = getSupabaseAdmin();
  const now = input.sentAt || new Date().toISOString();
  const messageId = crypto.randomUUID();
  const payload = {
    id: messageId,
    conversation_id: input.conversationId,
    case_id: input.caseId,
    customer_id: input.customerId || null,
    type: input.type,
    direction: input.direction || 'outbound',
    sender_id: input.senderId || null,
    sender_name: input.senderName || null,
    content: input.content,
    content_type: 'text',
    channel: input.channel,
    external_message_id: input.externalMessageId || null,
    draft_reply_id: input.draftReplyId || null,
    sent_at: now,
    created_at: now,
    tenant_id: scope.tenantId,
  };

  const { error: insertError } = await supabase.from('messages').insert(payload);
  if (insertError) throw insertError;

  const { error: conversationError } = await supabase
    .from('conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', input.conversationId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (conversationError) throw conversationError;

  if (input.caseId) {
    const { error: caseError } = await supabase
      .from('cases')
      .update({ last_activity_at: now, updated_at: now })
      .eq('id', input.caseId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (caseError) throw caseError;
  }

  return { id: messageId, ...payload };
}

async function createInternalNoteSupabase(scope: ConversationScope, input: InternalNoteInput) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const noteId = crypto.randomUUID();
  const payload = {
    id: noteId,
    case_id: input.caseId,
    content: input.content,
    created_by: input.createdBy || scope.userId || 'user_local',
    created_by_type: 'human',
    created_at: now,
    tenant_id: scope.tenantId,
  };

  const { error } = await supabase.from('internal_notes').insert(payload);
  if (error) throw error;

  return { id: noteId, ...payload };
}

function getConversationByCaseSqlite(scope: ConversationScope, caseId: string) {
  const db = getDb();
  const conv = db.prepare('SELECT * FROM conversations WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?').get(caseId, scope.tenantId, scope.workspaceId) as any;
  if (!conv) return null;
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY sent_at ASC').all(conv.id, scope.tenantId);
  return { ...parseRow(conv), messages: messages.map(parseRow) };
}

function getConversationSqlite(scope: ConversationScope, conversationId: string) {
  const db = getDb();
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(conversationId, scope.tenantId, scope.workspaceId);
  return conv ? parseRow(conv) : null;
}

function listMessagesSqlite(scope: ConversationScope, conversationId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY sent_at ASC').all(conversationId, scope.tenantId).map(parseRow);
}

function ensureConversationForCaseSqlite(scope: ConversationScope, caseRow: any) {
  const db = getDb();
  const existing = db.prepare(`
    SELECT *
    FROM conversations
    WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?
    ORDER BY last_message_at DESC, created_at DESC
    LIMIT 1
  `).get(caseRow.id, scope.tenantId, scope.workspaceId) as any;
  if (existing) return parseRow(existing);

  const now = new Date().toISOString();
  const conversationId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO conversations (
      id, case_id, customer_id, channel, status, subject, external_thread_id,
      first_message_at, last_message_at, created_at, updated_at, tenant_id, workspace_id
    )
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversationId,
    caseRow.id,
    caseRow.customer_id || null,
    caseRow.source_channel || 'web_chat',
    null,
    caseRow.source_entity_id || null,
    now,
    now,
    now,
    now,
    scope.tenantId,
    scope.workspaceId,
  );

  db.prepare(`
    UPDATE cases
    SET conversation_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).run(conversationId, caseRow.id, scope.tenantId, scope.workspaceId);

  return getConversationSqlite(scope, conversationId);
}

function appendMessageSqlite(scope: ConversationScope, input: AppendMessageInput) {
  const db = getDb();
  const now = input.sentAt || new Date().toISOString();
  const messageId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO messages (
      id, conversation_id, case_id, customer_id, type, direction, sender_id, sender_name,
      content, content_type, channel, external_message_id, draft_reply_id,
      sent_at, created_at, tenant_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'text', ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    input.conversationId,
    input.caseId,
    input.customerId || null,
    input.type,
    input.direction || 'outbound',
    input.senderId || null,
    input.senderName || null,
    input.content,
    input.channel,
    input.externalMessageId || null,
    input.draftReplyId || null,
    now,
    now,
    scope.tenantId,
  );

  db.prepare(`UPDATE conversations SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND workspace_id = ?`)
    .run(now, input.conversationId, scope.tenantId, scope.workspaceId);
  if (input.caseId) {
    db.prepare(`UPDATE cases SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND workspace_id = ?`)
      .run(now, input.caseId, scope.tenantId, scope.workspaceId);
  }

  return {
    id: messageId,
    conversation_id: input.conversationId,
    case_id: input.caseId,
    customer_id: input.customerId || null,
    type: input.type,
    direction: input.direction || 'outbound',
    sender_id: input.senderId || null,
    sender_name: input.senderName || null,
    content: input.content,
    channel: input.channel,
    sent_at: now,
  };
}

function createInternalNoteSqlite(scope: ConversationScope, input: InternalNoteInput) {
  const db = getDb();
  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO internal_notes (id, case_id, content, created_by, created_by_type, created_at, tenant_id)
    VALUES (?, ?, ?, ?, 'human', ?, ?)
  `).run(noteId, input.caseId, input.content, input.createdBy || scope.userId || 'user_local', now, scope.tenantId);
  return {
    id: noteId,
    case_id: input.caseId,
    content: input.content,
    created_by: input.createdBy || scope.userId || 'user_local',
    created_at: now,
  };
}

export interface ConversationRepository {
  getByCase(scope: ConversationScope, caseId: string): Promise<any | null>;
  get(scope: ConversationScope, conversationId: string): Promise<any | null>;
  listMessages(scope: ConversationScope, conversationId: string): Promise<any[]>;
  ensureForCase(scope: ConversationScope, caseRow: any): Promise<any>;
  appendMessage(scope: ConversationScope, input: AppendMessageInput): Promise<any>;
  createInternalNote(scope: ConversationScope, input: InternalNoteInput): Promise<any>;
}

export function createConversationRepository(): ConversationRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      getByCase: getConversationByCaseSupabase,
      get: getConversationSupabase,
      listMessages: listMessagesSupabase,
      ensureForCase: ensureConversationForCaseSupabase,
      appendMessage: appendMessageSupabase,
      createInternalNote: createInternalNoteSupabase,
    };
  }

  return {
    getByCase: async (scope, caseId) => getConversationByCaseSqlite(scope, caseId),
    get: async (scope, conversationId) => getConversationSqlite(scope, conversationId),
    listMessages: async (scope, conversationId) => listMessagesSqlite(scope, conversationId),
    ensureForCase: async (scope, caseRow) => ensureConversationForCaseSqlite(scope, caseRow),
    appendMessage: async (scope, input) => appendMessageSqlite(scope, input),
    createInternalNote: async (scope, input) => createInternalNoteSqlite(scope, input),
  };
}
