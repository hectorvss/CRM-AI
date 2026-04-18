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
import { createCanonicalRepository } from '../data/canonical.js';
import { createCustomerRepository } from '../data/customers.js';
import { createCaseRepository } from '../data/cases.js';
import { enqueue }      from '../queue/client.js';
import { JobType }      from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }       from '../utils/logger.js';
import { requireScope } from '../lib/scope.js';
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

  const canonicalRepo = createCanonicalRepository();
  const customerRepo = createCustomerRepository();
  const caseRepo = createCaseRepository();

  const scope = requireScope(ctx, 'channelIngest');
  const { tenantId, workspaceId } = scope;

  // ── 1. Load canonical event ───────────────────────────────────────────────
  const event = await canonicalRepo.getEvent(scope, payload.canonicalEventId);

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
    msg = typeof event.normalized_payload === 'string' 
      ? JSON.parse(event.normalized_payload) as NormalizedChannelMessage 
      : event.normalized_payload;
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
  const identitySystem = channelToSystem(msg.channel);
  const existingIdentity = await customerRepo.getIdentity(scope, identitySystem, msg.senderId);

  let customerId: string;

  if (existingIdentity) {
    customerId = existingIdentity.customer_id;
    log.debug('Found existing customer via linked identity', { customerId });
  } else {
    customerId = randomUUID();
    const canonicalName = msg.senderName ?? deriveDisplayName(msg.senderId, msg.channel);
    
    await customerRepo.createStub(scope, {
      id: customerId,
      canonicalName,
      canonicalEmail: msg.channel === 'email' ? msg.senderId : null,
      email: msg.channel === 'email' ? msg.senderId : null,
      phone: ['whatsapp', 'sms'].includes(msg.channel) ? msg.senderId : null,
      identitySystem,
      identityExternalId: msg.senderId,
    });

    log.info('Created stub customer for new channel sender', {
      customerId,
      channel: msg.channel,
      senderId: msg.senderId,
    });
  }

  // ── 4. Find or create conversation thread ─────────────────────────────────
  const existingConv = await caseRepo.getConversationByChannel(scope, customerId, msg.channel);

  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;
    await caseRepo.updateConversation(scope, conversationId, {
      last_message_at: msg.sentAt,
    });
    log.debug('Reusing existing open conversation', { conversationId });
  } else {
    conversationId = randomUUID();
    await caseRepo.createConversation(scope, {
      id: conversationId,
      customer_id: customerId,
      channel: msg.channel,
      status: 'open',
      subject: msg.subject ?? null,
      external_thread_id: msg.externalThreadId ?? null,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      first_message_at: msg.sentAt,
      last_message_at: msg.sentAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    log.info('Created new conversation', { conversationId, channel: msg.channel });
  }

  // ── 5. Persist inbound message ────────────────────────────────────────────
  const existingMsg = await caseRepo.getMessageByExternalId(scope, conversationId, msg.externalMessageId);

  let messageId: string;

  if (existingMsg) {
    messageId = existingMsg.id;
    log.debug('Message already persisted (duplicate delivery), reusing', { messageId });
  } else {
    messageId = randomUUID();
    await caseRepo.createMessage(scope, {
      id: messageId,
      conversation_id: conversationId,
      customer_id: customerId,
      direction: 'inbound',
      channel: msg.channel,
      content: msg.messageContent,
      content_type: 'text',
      external_message_id: msg.externalMessageId,
      attachments: msg.attachments ?? [],
      sent_at: msg.sentAt,
      created_at: new Date().toISOString(),
      tenant_id: tenantId,
    });

    log.debug('Message persisted', { messageId });
  }

  // ── 6. Update canonical event with resolved entity refs ──────────────────
  await canonicalRepo.updateEventStatus(scope, payload.canonicalEventId, {
    status: 'canonicalized',
    canonical_entity_type: 'customer',
    canonical_entity_id: customerId,
    normalized_payload: {
      ...msg,
      customerId,
      conversationId,
      messageId,
    },
  });

  log.info('Channel event canonicalized', {
    customerId,
    conversationId,
    messageId,
  });

  // ── 7. Enqueue intent classification ─────────────────────────────────────
  await enqueue(
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
