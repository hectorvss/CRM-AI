/**
 * server/pipeline/messageSender.ts
 *
 * Message Sender — Phase 5.
 *
 * Handles SEND_MESSAGE jobs. Delivers an outbound message to the customer
 * via the appropriate channel (email, WhatsApp, SMS, web chat).
 *
 * Flow:
 *  1. Load case + conversation context
 *  2. Dispatch to the channel-specific sender
 *  3. Persist the sent message to the messages table
 *  4. Update conversation last_message_at and status
 *  5. Mark the source draft_reply as 'sent' if one was referenced
 *  6. Write an audit log entry
 *
 * Channel implementations:
 *  - email:     Postmark / SendGrid (via HTTP, config-gated)
 *  - whatsapp:  Meta Cloud API (config-gated)
 *  - web_chat:  Server-Sent Events / WebSocket push (stub for Phase 5)
 *  - sms:       Twilio (config-gated)
 *
 * If a channel's credentials are not configured, the message is logged as
 * 'simulated' so the demo environment works without real API keys.
 */

import { randomUUID }         from 'crypto';
import { createCaseRepository } from '../data/cases.js';
import { createCustomerRepository } from '../data/customers.js';
import { createOperationsRepository } from '../data/operations.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import { requireScope }       from '../lib/scope.js';
import type { SendMessagePayload, JobContext } from '../queue/types.js';
import { sendEmail, sendWhatsApp, sendSms } from './channelSenders.js';

// ── Main handler ───────────────────────────────────────────────────────────────

async function handleSendMessage(
  payload: SendMessagePayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:          ctx.jobId,
    caseId:         payload.caseId,
    channel:        payload.channel,
    traceId:        ctx.traceId,
  });

  const caseRepo = createCaseRepository();
  const customerRepo = createCustomerRepository();
  const opsRepo = createOperationsRepository();

  const { tenantId, workspaceId } = requireScope(ctx, 'messageSender');
  const scope = { tenantId, workspaceId };

  // ── 1. Load case + conversation ───────────────────────────────────────────
  const caseRow = await caseRepo.get(scope, payload.caseId);
  if (!caseRow) {
    log.warn('Case not found for message send');
    return;
  }

  const conv = await caseRepo.getConversation(scope, payload.conversationId);
  if (!conv) {
    log.warn('Conversation not found', { conversationId: payload.conversationId });
    return;
  }

  // ── 2. Load customer contact info ─────────────────────────────────────────
  const customer = caseRow.customer_id
    ? await customerRepo.get(scope, caseRow.customer_id)
    : null;

  if (!customer && !caseRow.source_entity_id) {
    log.warn('No customer linked to case, cannot send message');
    return;
  }

  const channel = payload.channel;
  let recipientAddress: string | null = null;

  switch (channel) {
    case 'email':
      recipientAddress = customer?.email || customer?.canonical_email || caseRow.source_entity_id;
      break;
    case 'whatsapp':
    case 'sms':
      recipientAddress = customer?.phone || caseRow.source_entity_id;
      break;
    case 'web_chat':
      recipientAddress = customer?.id || caseRow.source_entity_id; // session keyed by customer_id
      break;
  }

  if (!recipientAddress) {
    log.warn('Customer has no contact address for channel', { channel, customerId: customer?.id ?? caseRow.customer_id ?? null });
    return;
  }

  log.info('Sending message', { channel, recipient: recipientAddress });

  // ── 3. Dispatch to channel ────────────────────────────────────────────────
  let externalMessageId: string;
  let simulated = false;

  try {
    switch (channel) {
      case 'whatsapp': {
        const result = await sendWhatsApp(recipientAddress, payload.content);
        externalMessageId = result.messageId;
        simulated         = result.simulated;
        break;
      }
      case 'email': {
        const subject = conv.subject ?? `Re: Your Support Request [${caseRow.case_number}]`;
        const result  = await sendEmail(recipientAddress, subject, payload.content, caseRow.case_number);
        externalMessageId = result.messageId;
        simulated         = result.simulated;
        break;
      }
      case 'sms': {
        const result = await sendSms(recipientAddress, payload.content);
        externalMessageId = result.messageId;
        simulated         = result.simulated;
        break;
      }
      case 'web_chat':
      default: {
        // Web chat delivery is handled by a WebSocket/SSE push layer outside this worker.
        // We persist the message and mark it as 'simulated' for now.
        externalMessageId = `webchat_${randomUUID()}`;
        simulated         = true;
        log.debug('Web chat: persisting outbound message (delivery via WebSocket)');
        break;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error('Message send failed', { channel, error: errMsg });
    // If the row was created in 'pending' state by the upstream tool, flip it
    // to 'failed' so the inbox shows the user a clear failure indicator.
    if (payload.queuedMessageId) {
      try {
        await caseRepo.updateMessage(scope, payload.queuedMessageId, {
          delivery_status: 'failed',
          delivery_error: errMsg,
        });
      } catch (updateErr) {
        log.warn('Failed to mark queued message as failed', {
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }
    }
    throw err; // Re-throw so the queue worker can retry
  }

  const now = new Date().toISOString();

  // ── 4. Persist outbound message ───────────────────────────────────────────
  const messageId = payload.queuedMessageId ?? randomUUID();
  if (payload.queuedMessageId) {
    await caseRepo.updateMessage(scope, payload.queuedMessageId, {
      external_message_id: externalMessageId,
      sent_at: now,
      delivered_at: simulated ? null : now,
      delivery_status: 'sent',
      delivery_error: null,
    });
  } else {
    await caseRepo.createMessage(scope, {
      id: messageId,
      conversation_id: payload.conversationId,
      case_id: payload.caseId,
      customer_id: customer?.id ?? caseRow.customer_id ?? null,
      type: 'agent',
      sender_id: 'system_send_message',
      sender_name: 'Alex Morgan',
      direction: 'outbound',
      channel,
      content: payload.content,
      content_type: 'text',
      external_message_id: externalMessageId,
      draft_reply_id: payload.draftReplyId ?? null,
      sent_at: now,
      created_at: now,
      tenant_id: tenantId
    });
  }

  // ── 5. Update conversation ────────────────────────────────────────────────
  await caseRepo.updateConversation(scope, payload.conversationId, {
    last_message_at: now
  });

  await caseRepo.update(scope, payload.caseId, {
    last_activity_at: now
  });

  // ── 6. Mark draft as sent ─────────────────────────────────────────────────
  if (payload.draftReplyId) {
    await caseRepo.updateDraft(scope, payload.draftReplyId, {
      status: 'sent',
      sent_at: now
    });
  }

  await opsRepo.logAudit(scope, {
    actorId: 'system_send_message',
    actorType: 'system',
    action: 'MESSAGE_SENT',
    entityType: 'case',
    entityId: payload.caseId,
    metadata: {
      conversationId: payload.conversationId,
      draftReplyId: payload.draftReplyId ?? null,
      queuedMessageId: payload.queuedMessageId ?? null,
      channel,
      externalMessageId,
      simulated,
    },
  });

  log.info('Message sent', {
    messageId,
    externalMessageId,
    channel,
    simulated,
  });
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.SEND_MESSAGE, handleSendMessage);

export { handleSendMessage };
