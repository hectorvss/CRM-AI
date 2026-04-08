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
import { getDb }              from '../db/client.js';
import { config }             from '../config.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import { logAudit }           from '../db/utils.js';
import type { SendMessagePayload, JobContext } from '../queue/types.js';

// ── Channel senders ───────────────────────────────────────────────────────────

async function sendWhatsApp(
  to: string,
  content: string,
): Promise<{ messageId: string; simulated: boolean }> {
  const accessToken   = config.channels?.whatsappAccessToken;
  const phoneNumberId = config.channels?.whatsappPhoneNumberId;

  if (!accessToken || !phoneNumberId) {
    logger.debug('WhatsApp: no credentials configured, simulating send', { to });
    return { messageId: `sim_wa_${randomUUID()}`, simulated: true };
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const body = JSON.stringify({
    messaging_product: 'whatsapp',
    to,
    type:   'text',
    text:   { body: content },
  });

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  return { messageId: json?.messages?.[0]?.id ?? randomUUID(), simulated: false };
}

async function sendEmail(
  to: string,
  subject: string,
  content: string,
  caseNumber: string,
): Promise<{ messageId: string; simulated: boolean }> {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const fromEmail     = process.env.EMAIL_FROM ?? 'support@example.com';

  if (!postmarkToken) {
    logger.debug('Email: no Postmark token configured, simulating send', { to });
    return { messageId: `sim_email_${randomUUID()}`, simulated: true };
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method:  'POST',
    headers: {
      Accept:                  'application/json',
      'Content-Type':          'application/json',
      'X-Postmark-Server-Token': postmarkToken,
    },
    body: JSON.stringify({
      From:     fromEmail,
      To:       to,
      Subject:  subject || `Re: Your Support Request [${caseNumber}]`,
      TextBody: content,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Postmark API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  return { messageId: json.MessageID ?? randomUUID(), simulated: false };
}

async function sendSms(
  to: string,
  content: string,
): Promise<{ messageId: string; simulated: boolean }> {
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_FROM_NUMBER;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    logger.debug('SMS: no Twilio credentials configured, simulating send', { to });
    return { messageId: `sim_sms_${randomUUID()}`, simulated: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: twilioFrom, Body: content });

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Twilio API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  return { messageId: json.sid ?? randomUUID(), simulated: false };
}

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

  const db       = getDb();
  const tenantId = ctx.tenantId ?? 'org_default';

  // ── 1. Load case + conversation ───────────────────────────────────────────
  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(payload.caseId) as any;
  if (!caseRow) {
    log.warn('Case not found for message send');
    return;
  }

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(payload.conversationId) as any;
  if (!conv) {
    log.warn('Conversation not found', { conversationId: payload.conversationId });
    return;
  }

  // ── 2. Load customer contact info ─────────────────────────────────────────
  const customer = caseRow.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(caseRow.customer_id) as any
    : null;

  if (!customer) {
    log.warn('No customer linked to case, cannot send message');
    return;
  }

  const channel = payload.channel;
  let recipientAddress: string | null = null;

  switch (channel) {
    case 'email':
      recipientAddress = customer.email;
      break;
    case 'whatsapp':
    case 'sms':
      recipientAddress = customer.phone;
      break;
    case 'web_chat':
      recipientAddress = customer.id; // session keyed by customer_id
      break;
  }

  if (!recipientAddress) {
    log.warn('Customer has no contact address for channel', { channel, customerId: customer.id });
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
    log.error('Message send failed', {
      channel,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err; // Re-throw so the queue worker can retry
  }

  const now = new Date().toISOString();

  // ── 4. Persist outbound message ───────────────────────────────────────────
  const messageId = randomUUID();
  db.prepare(`
    INSERT INTO messages (
      id, conversation_id, case_id, customer_id,
      direction, channel, content, content_type,
      external_message_id,
      draft_reply_id,
      sent_at, created_at, tenant_id
    ) VALUES (?, ?, ?, ?, 'outbound', ?, ?, 'text', ?, ?, ?, ?, ?)
  `).run(
    messageId,
    payload.conversationId,
    payload.caseId,
    customer.id,
    channel,
    payload.content,
    externalMessageId,
    payload.draftReplyId ?? null,
    now,
    now,
    tenantId,
  );

  // ── 5. Update conversation ────────────────────────────────────────────────
  db.prepare(`
    UPDATE conversations
    SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(now, payload.conversationId);

  db.prepare(`
    UPDATE cases
    SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(now, payload.caseId);

  // ── 6. Mark draft as sent ─────────────────────────────────────────────────
  if (payload.draftReplyId) {
    db.prepare(`
      UPDATE draft_replies SET status = 'sent', sent_at = ? WHERE id = ?
    `).run(now, payload.draftReplyId);
  }

  logAudit(db, {
    tenantId,
    workspaceId: ctx.workspaceId ?? 'ws_default',
    actorId: 'system_send_message',
    actorType: 'system',
    action: 'MESSAGE_SENT',
    entityType: 'case',
    entityId: payload.caseId,
    metadata: {
      conversationId: payload.conversationId,
      draftReplyId: payload.draftReplyId ?? null,
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
