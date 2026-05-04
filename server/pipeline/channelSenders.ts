/**
 * server/pipeline/channelSenders.ts
 *
 * Shared channel sender functions used by both the message pipeline worker
 * and the Plan Engine message tool for direct (non-case-threaded) sends.
 *
 * Design (post-Flow-10):
 *  - Each sender is fail-safe: if the relevant credentials are not configured,
 *    it throws a typed `IntegrationNotConfiguredError` (subclass per channel).
 *    Callers translate that into a 503 response or a retry/dead-letter
 *    decision in the queue worker.
 *  - No silent simulation. Demos can register dummy creds in env if they need
 *    a no-op path; the previous "simulated send" behaviour leaked into
 *    production logs and hid misconfiguration.
 *
 * Outbound dispatch helper:
 *  - `sendOnChannel({ channel, to, content, subject? })` routes to the right
 *    sender so the queue's SEND_MESSAGE handler doesn't need to switch.
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { integrationRegistry } from '../integrations/registry.js';
import {
  PostmarkNotConfiguredError,
  TwilioNotConfiguredError,
  WhatsAppNotConfiguredError,
} from '../integrations/types.js';
import type { WhatsAppAdapter } from '../integrations/whatsapp.js';

export interface ChannelSendResult {
  /** Provider-assigned message ID (or a UUID fallback for SMS providers that don't return one). */
  messageId: string;
  /**
   * Always `false` after the Flow 10 hardening — channel senders no longer
   * silently stub when credentials are missing; they throw a typed
   * `IntegrationNotConfiguredError`. The field is retained for backwards
   * compatibility with downstream call sites (messageSender, workflows,
   * agents/planEngine/tools/messaging) that branch on it.
   */
  simulated: false;
}

export type OutboundChannel = 'whatsapp' | 'email' | 'sms';

/**
 * Channels that route to a per-tenant integration adapter instead of the
 * global env-credential senders above. These need a `tenantId` to resolve
 * the connector and (usually) a thread/recipient identifier from the
 * conversation row (`external_thread_id`).
 */
export type TenantOutboundChannel =
  | 'messenger'
  | 'instagram'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'teams'
  | 'front'
  | 'intercom'
  | 'zendesk'
  | 'aircall'
  | 'postmark'
  | 'gmail'
  | 'outlook';

export interface SendOnChannelParams {
  channel: OutboundChannel;
  to:      string;
  content: string;
  /** Email-only: subject line. */
  subject?: string;
  /** Email-only: case reference used to build the default subject. */
  caseRef?: string;
}

export interface SendOnTenantChannelParams {
  channel:     TenantOutboundChannel;
  tenantId:    string;
  workspaceId: string | null;
  /** Recipient/thread identifier (PSID, channel id, conversation id, ticket id, etc.). */
  to:          string;
  content:     string;
  subject?:    string;
  /**
   * Channel-specific extras carried from the originating conversation
   * (teams: { teamId, channelId, messageId }, slack: { channel }, etc.).
   */
  meta?: Record<string, any>;
}

// ── WhatsApp via Meta Cloud API ───────────────────────────────────────────────

/**
 * Send a WhatsApp text message. Throws `WhatsAppNotConfiguredError` when
 * `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` are missing.
 *
 * Uses the registered `WhatsAppAdapter` so credentials, retries and rate
 * limiting are handled in one place.
 */
export async function sendWhatsApp(
  to: string,
  content: string,
): Promise<ChannelSendResult> {
  const adapter = integrationRegistry.get<WhatsAppAdapter>('whatsapp');

  if (!adapter || !adapter.configured) {
    const missing = adapter?.missingSendCredentials() ?? [
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
    ];
    throw new WhatsAppNotConfiguredError(missing);
  }

  const result = await adapter.sendTextMessage(to, content);
  return { messageId: result.messageId, simulated: false };
}

// ── Email via Postmark ────────────────────────────────────────────────────────

/**
 * Send an email through Postmark. Throws `PostmarkNotConfiguredError` when
 * `POSTMARK_SERVER_TOKEN` is missing.
 */
export async function sendEmail(
  to: string,
  subject: string,
  content: string,
  caseNumberOrRef: string = 'direct',
): Promise<ChannelSendResult> {
  const postmarkToken = config.channels?.postmark?.serverToken;
  const fromEmail     = config.channels?.postmark?.fromEmail ?? 'support@example.com';

  if (!postmarkToken) {
    throw new PostmarkNotConfiguredError(['POSTMARK_SERVER_TOKEN']);
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method:  'POST',
    headers: {
      Accept:                    'application/json',
      'Content-Type':            'application/json',
      'X-Postmark-Server-Token': postmarkToken,
    },
    body: JSON.stringify({
      From:     fromEmail,
      To:       to,
      Subject:  subject || `Re: Your Support Request [${caseNumberOrRef}]`,
      TextBody: content,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '(unreadable)');
    throw new Error(`Postmark API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  logger.info('Email message sent via Postmark', { to, subject, caseNumberOrRef });
  return { messageId: json.MessageID ?? randomUUID(), simulated: false };
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────

/**
 * Send an SMS through Twilio. Throws `TwilioNotConfiguredError` when any of
 * `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` are missing.
 */
export async function sendSms(
  to: string,
  content: string,
): Promise<ChannelSendResult> {
  const twilioSid   = config.channels?.twilio?.accountSid;
  const twilioToken = config.channels?.twilio?.authToken;
  const twilioFrom  = config.channels?.twilio?.fromNumber;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    const missing: string[] = [];
    if (!twilioSid)   missing.push('TWILIO_ACCOUNT_SID');
    if (!twilioToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!twilioFrom)  missing.push('TWILIO_FROM_NUMBER');
    throw new TwilioNotConfiguredError(missing);
  }

  const url  = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
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
    const errText = await res.text().catch(() => '(unreadable)');
    throw new Error(`Twilio API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  logger.info('SMS sent via Twilio', { to });
  return { messageId: json.sid ?? randomUUID(), simulated: false };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Routes an outbound message to the right channel sender. Centralises the
 * channel switch so handlers (queue worker, plan engine, agents) don't repeat
 * it. Re-throws integration errors unchanged so the caller can map them to
 * 503 / retry decisions.
 */
export async function sendOnChannel(
  params: SendOnChannelParams,
): Promise<ChannelSendResult> {
  switch (params.channel) {
    case 'whatsapp':
      return sendWhatsApp(params.to, params.content);
    case 'email':
      return sendEmail(
        params.to,
        params.subject ?? '',
        params.content,
        params.caseRef ?? 'direct',
      );
    case 'sms':
      return sendSms(params.to, params.content);
    default: {
      const exhaustive: never = params.channel;
      throw new Error(`Unsupported outbound channel: ${exhaustive}`);
    }
  }
}

// ── Per-tenant channel dispatcher ─────────────────────────────────────────────

/**
 * Sends an outbound message on a per-tenant channel using the tenant's
 * connected integration. Resolves the adapter via the appropriate
 * `*ForTenant` helper, falls back to throwing IntegrationNotConfiguredError
 * when the connector is missing.
 *
 * Imported lazily with dynamic import() so this module doesn't pull in 13
 * tenant resolvers (and their adapters) at startup.
 */
export async function sendOnTenantChannel(
  params: SendOnTenantChannelParams,
): Promise<ChannelSendResult> {
  const { channel, tenantId, workspaceId, to, content, subject, meta } = params;
  const log = logger.child({ channel, tenantId });

  switch (channel) {
    case 'messenger': {
      const { messengerForTenant } = await import('../integrations/messenger-tenant.js');
      const r = await messengerForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Messenger connector not configured for tenant');
      const out = await r.adapter.sendText({ recipientId: to, text: content });
      return { messageId: out.messageId, simulated: false };
    }
    case 'instagram': {
      const { instagramForTenant } = await import('../integrations/instagram-tenant.js');
      const r = await instagramForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Instagram connector not configured for tenant');
      const out = await r.adapter.sendText({ recipientId: to, text: content });
      return { messageId: out.messageId, simulated: false };
    }
    case 'telegram': {
      const { telegramForTenant } = await import('../integrations/telegram-tenant.js');
      const r = await telegramForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Telegram connector not configured for tenant');
      const out = await r.adapter.sendMessage({ chatId: to, text: content });
      return { messageId: String((out as any).messageId ?? (out as any).message_id ?? randomUUID()), simulated: false };
    }
    case 'discord': {
      const { discordForTenant } = await import('../integrations/discord-tenant.js');
      const r = await discordForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Discord connector not configured for tenant');
      const out = await r.adapter.sendMessage(to, { content });
      return { messageId: String((out as any).id ?? randomUUID()), simulated: false };
    }
    case 'slack': {
      const { slackForTenant } = await import('../integrations/slack-tenant.js');
      const r = await slackForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Slack connector not configured for tenant');
      const out = await r.adapter.postMessage({ channel: to, text: content, thread_ts: meta?.threadTs });
      return { messageId: String((out as any).ts ?? randomUUID()), simulated: false };
    }
    case 'teams': {
      const { teamsForTenant } = await import('../integrations/teams-tenant.js');
      const r = await teamsForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Teams connector not configured for tenant');
      const teamId    = meta?.teamId    ?? to;
      const channelId = meta?.channelId ?? meta?.teamsChannelId;
      const messageId = meta?.messageId ?? meta?.parentMessageId;
      if (!teamId || !channelId || !messageId) {
        throw new Error('Teams reply requires meta.teamId, meta.channelId, meta.messageId');
      }
      const out = await r.adapter.replyToChannelMessage(teamId, channelId, messageId, { content, contentType: 'text' });
      return { messageId: String((out as any).id ?? randomUUID()), simulated: false };
    }
    case 'front': {
      const { frontForTenant } = await import('../integrations/front-tenant.js');
      const r = await frontForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Front connector not configured for tenant');
      const out = await r.adapter.sendReply(to, { body: content, type: 'reply' });
      return { messageId: String((out as any).message_uid ?? randomUUID()), simulated: false };
    }
    case 'intercom': {
      const { intercomForTenant } = await import('../integrations/intercom-tenant.js');
      const r = await intercomForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Intercom connector not configured for tenant');
      const out = await r.adapter.replyToConversation(to, {
        message_type: 'comment',
        type: 'admin',
        admin_id: meta?.adminId ?? meta?.intercomAdminId,
        body: content,
      } as any);
      return { messageId: String((out as any).id ?? randomUUID()), simulated: false };
    }
    case 'zendesk': {
      const { zendeskForTenant } = await import('../integrations/zendesk-tenant.js');
      const r = await zendeskForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Zendesk connector not configured for tenant');
      const ticketId = Number(to);
      if (!Number.isFinite(ticketId)) throw new Error('Zendesk reply requires a numeric ticket id');
      await r.adapter.addComment(ticketId, { body: content, public: true });
      return { messageId: `zendesk_${ticketId}_${Date.now()}`, simulated: false };
    }
    case 'aircall': {
      const { aircallForTenant } = await import('../integrations/aircall-tenant.js');
      const r = await aircallForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Aircall connector not configured for tenant');
      // Aircall is voice-first: reply lands as a call comment / note.
      const adapter: any = r.adapter;
      if (typeof adapter.addComment === 'function' && meta?.callId) {
        const out = await adapter.addComment(meta.callId, { content });
        return { messageId: String(out?.id ?? randomUUID()), simulated: false };
      }
      log.warn('Aircall has no message-reply API; logging as note');
      return { messageId: `aircall_note_${randomUUID()}`, simulated: false };
    }
    case 'postmark': {
      const { postmarkForTenant } = await import('../integrations/postmark-tenant.js');
      const r = await postmarkForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Postmark connector not configured for tenant');
      const c: any = r.connector;
      const fromAddr = c.defaultFromAddress
        ?? (process.env.POSTMARK_FROM_EMAIL as string | undefined)
        ?? null;
      if (!fromAddr) throw new Error('Postmark requires a default_from_address on the connector or POSTMARK_FROM_EMAIL env');
      const fromHeader = c.defaultFromName ? `${c.defaultFromName} <${fromAddr}>` : fromAddr;
      const out = await r.adapter.send({
        from: fromHeader,
        to,
        subject: subject ?? 'Re: Your support request',
        textBody: content,
      });
      return { messageId: String(out?.MessageID ?? randomUUID()), simulated: false };
    }
    case 'gmail': {
      const { gmailForTenant } = await import('../integrations/gmail-tenant.js');
      const { buildRfc5322Message } = await import('../integrations/gmail.js');
      const r = await gmailForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Gmail connector not configured for tenant');
      const raw = buildRfc5322Message({
        to,
        subject: subject ?? 'Re: Your support request',
        body: content,
        mimeType: 'text/plain',
        inReplyTo: meta?.inReplyTo,
        references: meta?.references,
      });
      const out = await r.adapter.sendMessage({
        raw,
        threadId: meta?.threadId,
      });
      return { messageId: String(out.id ?? randomUUID()), simulated: false };
    }
    case 'outlook': {
      const { outlookForTenant } = await import('../integrations/outlook-tenant.js');
      const r = await outlookForTenant(tenantId, workspaceId);
      if (!r) throw new Error('Outlook connector not configured for tenant');
      // Outlook's sendMail returns void; if we have an inbound messageId on
      // meta, prefer replyToMessage so the thread stays linked.
      if (meta?.messageId) {
        await r.adapter.replyToMessage(meta.messageId, { comment: content });
        return { messageId: `outlook_reply_${meta.messageId}_${Date.now()}`, simulated: false };
      }
      await r.adapter.sendMail({
        subject: subject ?? 'Re: Your support request',
        body: content,
        bodyType: 'text',
        to: [to],
      });
      return { messageId: `outlook_send_${Date.now()}`, simulated: false };
    }
    default: {
      const exhaustive: never = channel;
      throw new Error(`Unsupported tenant outbound channel: ${exhaustive}`);
    }
  }
}

/**
 * Returns true if the given channel string is one we know how to send on
 * (either via global creds or per-tenant resolver).
 */
export function isKnownOutboundChannel(channel: string): boolean {
  return (
    channel === 'whatsapp' ||
    channel === 'email' ||
    channel === 'sms' ||
    channel === 'web_chat' ||
    channel === 'messenger' ||
    channel === 'instagram' ||
    channel === 'telegram' ||
    channel === 'discord' ||
    channel === 'slack' ||
    channel === 'teams' ||
    channel === 'front' ||
    channel === 'intercom' ||
    channel === 'zendesk' ||
    channel === 'aircall' ||
    channel === 'postmark' ||
    channel === 'gmail' ||
    channel === 'outlook'
  );
}
