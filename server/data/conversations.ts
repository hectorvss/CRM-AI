import crypto from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';

export interface ConversationScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export interface MessageAttachment {
  /** Stable id within the message payload (UUID generated client-side OK). */
  id: string;
  /** Original filename. */
  name: string;
  /** Bytes. */
  size: number;
  /** MIME type, e.g. image/png. */
  type: string;
  /** Base64 data URL (data:<mime>;base64,…). Stored verbatim — Supabase
   *  Storage upload will replace this with a signed URL in a follow-up. */
  dataUrl?: string;
  /** Optional public URL once uploaded. */
  url?: string;
}

export interface AppendMessageInput {
  /** Optional pre-generated id (used when caller wants to correlate with a queued job). */
  id?: string;
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
  /** 'pending' | 'sent' | 'failed'. Defaults to 'sent' for backward compatibility. */
  deliveryStatus?: 'pending' | 'sent' | 'failed';
  deliveryError?: string | null;
  /** File previews / data URIs attached to this reply. Stored as JSON in
   *  the messages.attachments column (legacy schema already supports it). */
  attachments?: MessageAttachment[];
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
  const messageId = input.id || crypto.randomUUID();
  const payload: Record<string, any> = {
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
    // Note: messages has no delivery_status / delivery_error / workspace_id
    // columns — keep this payload minimal to avoid 42703 inserts.
  };
  // Attachments are stored as JSON text in the legacy messages.attachments
  // column. Only include the field when there is at least one attachment so
  // older Supabase schemas without the column won't choke on the insert.
  if (input.attachments && input.attachments.length > 0) {
    payload.attachments = JSON.stringify(input.attachments);
  }

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

async function updateInternalNoteSupabase(
  scope: ConversationScope,
  caseId: string,
  noteId: string,
  content: string,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('internal_notes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('case_id', caseId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteInternalNoteSupabase(scope: ConversationScope, caseId: string, noteId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('internal_notes')
    .delete()
    .eq('id', noteId)
    .eq('case_id', caseId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
  return { ok: true };
}


export interface ConversationRepository {
  getByCase(scope: ConversationScope, caseId: string): Promise<any | null>;
  get(scope: ConversationScope, conversationId: string): Promise<any | null>;
  listMessages(scope: ConversationScope, conversationId: string): Promise<any[]>;
  ensureForCase(scope: ConversationScope, caseRow: any): Promise<any>;
  appendMessage(scope: ConversationScope, input: AppendMessageInput): Promise<any>;
  createInternalNote(scope: ConversationScope, input: InternalNoteInput): Promise<any>;
  updateInternalNote(scope: ConversationScope, caseId: string, noteId: string, content: string): Promise<any>;
  deleteInternalNote(scope: ConversationScope, caseId: string, noteId: string): Promise<any>;
}

export function createConversationRepository(): ConversationRepository {
  return {
    getByCase: getConversationByCaseSupabase,
    get: getConversationSupabase,
    listMessages: listMessagesSupabase,
    ensureForCase: ensureConversationForCaseSupabase,
    appendMessage: appendMessageSupabase,
    createInternalNote: createInternalNoteSupabase,
    updateInternalNote: updateInternalNoteSupabase,
    deleteInternalNote: deleteInternalNoteSupabase,
  };
}
