/**
 * server/pipeline/channelIngest.ts
 *
 * Channel Ingest handler — Phase 2 pipeline step 1b.
 *
 * Handles CHANNEL_INGEST jobs, which are produced when a customer message
 * arrives via a direct messaging channel (WhatsApp, email, web chat, SMS)
 * rather than a commerce webhook (Shopify/Stripe).
 *
 * Responsibilities:
 *  1. Load the raw message from the canonical_event's normalized_payload
 *  2. Identify or create the customer via linked_identities
 *  3. Find or create a conversation thread for the channel/sender pair
 *  4. Persist the inbound message to the messages table
 *  5. Emit a INTENT_ROUTE job so the message follows the same intent
 *     classification path as commerce events
 *
 * Channel message formats supported:
 *  - WhatsApp (via Meta Business API webhook)
 *  - Email (via Postmark / SendGrid inbound webhook)
 *  - Web chat (via embedded widget, formatted identically to WhatsApp)
 *  - SMS (via Twilio inbound webhook)
 */

import { randomUUID } from 'crypto';
import { getDb }        from '../db/client.js';
import { enqueue }      from '../queue/client.js';
import { JobType }      from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }       from '../utils/logger.js';
import type { ChannelIngestPayload, JobContext } from '../queue/types.js';

// ── Normalised inbound message shape ─────────────────────────────────────────
//
// All channel adapters (WhatsApp, email, etc.) must store the message in this
// format inside canonical_events.normalized_payload before emitting CHANNEL_INGEST.

interface NormalizedChannelMessage {
  /** The raw message content (plain text, HTML stripped for email) */
  messageContent: string;
  /** Sender identifier: phone number, email address, or session ID */
  senderId: string;
  /** Human-readable sender name if available */
  senderName?: string;
  /** Channel the message arrived on */
  channel: 'email' | 'web_chat' | 'whatsapp' | 'sms';
  /** Platform-native message ID (for dedup) */
  externalMessageId: string;
  /** ISO timestamp the message was sent */
  sentAt: string;
  /** Optional: a prior conversation/thread ID from the channel */
  externalThreadId?: string;
  /** Optional: subject line (email only) */
  subject?: string;
  /** Optional: attachments list (filenames only for now) */
  attachments?: string[];
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handleChannelIngest(
  payload: ChannelIngestPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:           ctx.jobId,
    canonicalEventId: payload.canonicalEventId,
    channel:         payload.channel,
    traceId:         ctx.traceId,
  });

  const db          = getDb();
  const tenantId    = ctx.tenantId    ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';

  // ── 1. Load canonical event ───────────────────────────────────────────────
  const event = db.prepare(
    'SELECT * FROM canonical_events WHERE id = ?'
  ).get(payload.canonicalEventId) as any;

  if (!event) {
    log.warn('Canonical event not found');
    return;
  }

  if (event.status !== 'pending' && event.status !== 'received') {
    log.debug('Channel event already processed, skipping', { status: event.status });
    return;
  }

  // ── 2. Parse normalised message ───────────────────────────────────────────
  let msg: NormalizedChannelMessage;
  try {
    msg = JSON.parse(event.normalized_payload) as NormalizedChannelMessage;
  } catch {
    log.warn('Failed to parse normalized_payload for channel event');
    return;
  }

  if (!msg.messageContent || !msg.senderId) {
    log.warn('Channel message missing required fields (messageContent, senderId)');
    return;
  }

  log.info('Processing channel message', {
    channel:  msg.channel,
    senderId: msg.senderId,
  });

  // ── 3. Resolve customer ───────────────────────────────────────────────────
  // Try to find an existing customer by their channel identity.
  // linked_identities maps (system, external_id) → customer_id.
  const identitySystem = channelToSystem(msg.channel);
  const existingIdentity = db.prepare(`
    SELECT customer_id FROM linked_identities
    WHERE system = ? AND external_id = ?
    LIMIT 1
  `).get(identitySystem, msg.senderId) as any;

  let customerId: string;

  if (existingIdentity) {
    customerId = existingIdentity.customer_id;
    log.debug('Found existing customer via linked identity', { customerId });
  } else {
    // Create a stub customer that can be enriched later by the Identity agent
    customerId = randomUUID();
    const canonicalName = msg.senderName ?? deriveDisplayName(msg.senderId, msg.channel);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO customers (
        id, canonical_name, canonical_email, email, phone,
        segment, risk_level, lifetime_value, total_orders,
        workspace_id, tenant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'standard', 'low', 0, 0, ?, ?, ?, ?)
    `).run(
      customerId,
      canonicalName,
      msg.channel === 'email' ? msg.senderId : null,  // canonical_email
      msg.channel === 'email' ? msg.senderId : null,  // email (alias)
      ['whatsapp', 'sms'].includes(msg.channel) ? msg.senderId : null,
      workspaceId,
      tenantId,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO linked_identities (
        id, customer_id, tenant_id, workspace_id, system, external_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), customerId, tenantId, workspaceId, identitySystem, msg.senderId, now);

    log.info('Created stub customer for new channel sender', {
      customerId,
      channel: msg.channel,
      senderId: msg.senderId,
    });
  }

  // ── 4. Find or create conversation thread ─────────────────────────────────
  // A conversation groups all messages in the same channel thread.
  // Match on (customer_id, channel, status != closed) to reuse open threads.
  const existingConv = db.prepare(`
    SELECT id FROM conversations
    WHERE customer_id = ?
      AND channel     = ?
      AND tenant_id   = ?
      AND status NOT IN ('closed', 'resolved')
    ORDER BY last_message_at DESC
    LIMIT 1
  `).get(customerId, msg.channel, tenantId) as any;

  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;

    // Bump last_message_at so the inbox sorts this conversation to the top
    db.prepare(`
      UPDATE conversations
      SET last_message_at = ?,
          updated_at      = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(msg.sentAt, conversationId);

    log.debug('Reusing existing open conversation', { conversationId });
  } else {
    conversationId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO conversations (
        id, customer_id, channel, status,
        subject, external_thread_id,
        tenant_id, workspace_id,
        first_message_at, last_message_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      customerId,
      msg.channel,
      msg.subject ?? null,
      msg.externalThreadId ?? null,
      tenantId,
      workspaceId,
      msg.sentAt,
      msg.sentAt,
      now,
      now,
    );

    log.info('Created new conversation', { conversationId, channel: msg.channel });
  }

  // ── 5. Persist inbound message ────────────────────────────────────────────
  // Check for duplicate (same externalMessageId on the same conversation)
  const existingMsg = db.prepare(`
    SELECT id FROM messages
    WHERE conversation_id   = ?
      AND external_message_id = ?
    LIMIT 1
  `).get(conversationId, msg.externalMessageId) as any;

  let messageId: string;

  if (existingMsg) {
    messageId = existingMsg.id;
    log.debug('Message already persisted (duplicate delivery), reusing', { messageId });
  } else {
    messageId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, customer_id,
        direction, channel,
        content, content_type,
        external_message_id,
        attachments,
        sent_at, created_at,
        tenant_id
      ) VALUES (?, ?, ?, 'inbound', ?, ?, 'text', ?, ?, ?, ?, ?)
    `).run(
      messageId,
      conversationId,
      customerId,
      msg.channel,
      msg.messageContent,
      msg.externalMessageId,
      JSON.stringify(msg.attachments ?? []),
      msg.sentAt,
      now,
      tenantId,
    );

    log.debug('Message persisted', { messageId });
  }

  // ── 6. Update canonical event with resolved entity refs ──────────────────
  db.prepare(`
    UPDATE canonical_events
    SET status               = 'canonicalized',
        canonical_entity_type = 'customer',
        canonical_entity_id   = ?,
        normalized_payload   = ?
    WHERE id = ?
  `).run(
    customerId,
    // Re-encode with resolved IDs so INTENT_ROUTE can read them cleanly
    JSON.stringify({
      ...msg,
      customerId,
      conversationId,
      messageId,
    }),
    payload.canonicalEventId,
  );

  log.info('Channel event canonicalized', {
    customerId,
    conversationId,
    messageId,
  });

  // ── 7. Enqueue intent classification ─────────────────────────────────────
  enqueue(
    JobType.INTENT_ROUTE,
    { canonicalEventId: payload.canonicalEventId },
    { tenantId, workspaceId, traceId: ctx.traceId, priority: 5 },
  );

  log.debug('Enqueued INTENT_ROUTE for channel message');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function channelToSystem(channel: string): string {
  const map: Record<string, string> = {
    whatsapp: 'whatsapp',
    email:    'email',
    sms:      'sms',
    web_chat: 'web_chat',
  };
  return map[channel] ?? channel;
}

function deriveDisplayName(senderId: string, channel: string): string {
  if (channel === 'email') {
    // 'john.doe@example.com' → 'John Doe'
    const local = senderId.split('@')[0] ?? senderId;
    return local
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  if (channel === 'whatsapp' || channel === 'sms') {
    return `Customer ${senderId.slice(-4)}`;
  }
  return `Customer ${senderId.slice(0, 8)}`;
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.CHANNEL_INGEST, handleChannelIngest);

export { handleChannelIngest };
