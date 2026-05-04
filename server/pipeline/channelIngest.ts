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
import { createIntegrationRepository } from '../data/integrations.js';
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

/**
 * Every messaging channel — WhatsApp, email, Messenger, Telegram, Slack,
 * Teams, Front, Intercom, Zendesk, Aircall, Discord, Instagram, SMS, web
 * chat, plus the email-as-API channels (Gmail, Outlook, Postmark) — must
 * normalise its inbound webhook into this shape inside
 * `canonical_events.normalized_payload` before emitting CHANNEL_INGEST.
 *
 * The `metadata` bag carries the channel-specific reply context that the
 * outbound dispatcher (`channelSenders.sendOnTenantChannel`) needs to
 * thread the response correctly:
 *   - slack:    { thread_ts }
 *   - teams:    { teamId, channelId, messageId }   (parent message id)
 *   - intercom: { adminId }
 *   - gmail:    { threadId, inReplyTo, references[] }
 *   - outlook:  { messageId }                       (parent message id)
 *   - aircall:  { callId }
 */
export type SupportedChannel =
  | 'email' | 'web_chat' | 'whatsapp' | 'sms'
  | 'gmail' | 'outlook' | 'postmark'
  | 'messenger' | 'instagram' | 'telegram' | 'discord'
  | 'slack' | 'teams' | 'front' | 'intercom' | 'zendesk' | 'aircall';

export interface NormalizedChannelMessage {
  messageContent: string;
  senderId: string;
  senderName?: string;
  channel: SupportedChannel;
  /** Platform-native message ID (for dedup) */
  externalMessageId: string;
  /** ISO timestamp the message was sent */
  sentAt: string;
  /** Channel thread/recipient ID — the reply target. */
  externalThreadId?: string;
  /** Optional: subject line (email-style channels only) */
  subject?: string;
  /** Optional: attachments list (filenames only for now) */
  attachments?: string[];
  /** Channel-specific reply metadata. See type comment above. */
  metadata?: Record<string, any>;
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

  const integrationRepo = createIntegrationRepository();
  const customerRepo = createCustomerRepository();
  const caseRepo = createCaseRepository();

  const scope = requireScope(ctx, 'channelIngest');
  const { tenantId, workspaceId } = scope;

  // ── 1. Load canonical event ───────────────────────────────────────────────
  const event = await integrationRepo.getCanonicalEvent(payload.canonicalEventId);

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
  // Three-tier resolution to avoid duplicate canonical rows for the same
  // human across different messaging channels:
  //   (a) exact (system, external_id) hit on linked_identities
  //   (b) cross-channel match by email/phone on customers
  //   (c) create a new stub
  const identitySystem = channelToSystem(msg.channel);
  const isEmailLike = msg.channel === 'email' || msg.channel === 'gmail' || msg.channel === 'outlook' || msg.channel === 'postmark';
  const isPhoneLike = msg.channel === 'whatsapp' || msg.channel === 'sms' || msg.channel === 'aircall';

  const existingIdentity = await customerRepo.getIdentity(scope, identitySystem, msg.senderId);

  let customerId: string;

  if (existingIdentity) {
    customerId = existingIdentity.customer_id;
    log.debug('Found existing customer via linked identity', { customerId });
  } else {
    // (b) Try cross-channel match by email/phone before creating a new
    // canonical row. If an existing customer has the same email or phone,
    // we attach a NEW linked_identity to them instead of duplicating.
    const candidateEmail = isEmailLike ? msg.senderId : null;
    const candidatePhone = isPhoneLike ? msg.senderId : null;
    const candidate = (candidateEmail || candidatePhone)
      ? await customerRepo.findByEmailOrPhone(scope, candidateEmail, candidatePhone)
      : null;

    if (candidate?.id) {
      customerId = candidate.id;
      // Attach the new identity so the next inbound on this channel hits (a).
      const supabase = (await import('../db/supabase.js')).getSupabaseAdmin();
      const { error: liErr } = await supabase.from('linked_identities').insert({
        id: randomUUID(),
        customer_id: customerId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        system: identitySystem,
        external_id: msg.senderId,
        confidence: 0.9,
        verified: false,
      });
      if (liErr && liErr.code !== '23505') {
        log.warn('Failed to attach new linked_identity to matched customer', { error: liErr.message });
      }
      log.info('Cross-channel dedup: matched existing customer by email/phone', {
        customerId,
        channel: msg.channel,
        senderId: msg.senderId,
      });
    } else {
      customerId = randomUUID();
      const canonicalName = msg.senderName ?? deriveDisplayName(msg.senderId, msg.channel);
      await customerRepo.createStub(scope, {
        id: customerId,
        canonicalName,
        canonicalEmail: candidateEmail,
        email: candidateEmail,
        phone: candidatePhone,
        identitySystem,
        identityExternalId: msg.senderId,
      });
      log.info('Created stub customer for new channel sender', {
        customerId,
        channel: msg.channel,
        senderId: msg.senderId,
      });
    }
  }

  // ── 4. Find or create conversation thread ─────────────────────────────────
  const existingConv = await caseRepo.getConversationByChannel(scope, customerId, msg.channel);

  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;
    // Merge new metadata (e.g., updated thread_ts on later messages) into the
    // existing row so the reply path always sees the freshest reply context.
    const mergedMeta = { ...(parseMetadata(existingConv.metadata) || {}), ...(msg.metadata || {}) };
    await caseRepo.updateConversation(scope, conversationId, {
      last_message_at: msg.sentAt,
      ...(Object.keys(mergedMeta).length ? { metadata: mergedMeta } : {}),
      ...(msg.externalThreadId && !existingConv.external_thread_id ? { external_thread_id: msg.externalThreadId } : {}),
    } as any);
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
      metadata: msg.metadata ?? {},
      tenant_id: tenantId,
      workspace_id: workspaceId,
      first_message_at: msg.sentAt,
      last_message_at: msg.sentAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

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
  await integrationRepo.updateCanonicalEvent(payload.canonicalEventId, {
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
  // Identity system aligned with the channel slug — keeps linked_identities
  // consistent so a Messenger user and a Telegram user with overlapping
  // numeric IDs aren't accidentally collapsed into one customer.
  return channel;
}

function deriveDisplayName(senderId: string, channel: string): string {
  if (channel === 'email' || channel === 'gmail' || channel === 'outlook' || channel === 'postmark') {
    // 'john.doe@example.com' → 'John Doe'
    const local = senderId.split('@')[0] ?? senderId;
    return local
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
  if (channel === 'whatsapp' || channel === 'sms' || channel === 'aircall') {
    return `Customer ${senderId.slice(-4)}`;
  }
  return `Customer ${senderId.slice(0, 8)}`;
}

function parseMetadata(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.CHANNEL_INGEST, handleChannelIngest);

export { handleChannelIngest };
