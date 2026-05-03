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

export interface SendOnChannelParams {
  channel: OutboundChannel;
  to:      string;
  content: string;
  /** Email-only: subject line. */
  subject?: string;
  /** Email-only: case reference used to build the default subject. */
  caseRef?: string;
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
