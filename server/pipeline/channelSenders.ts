/**
 * server/pipeline/channelSenders.ts
 *
 * Shared channel sender functions used by both the message pipeline worker
 * and the Plan Engine message tool for direct (non-case-threaded) sends.
 *
 * Each function is self-contained: if the relevant credentials are not
 * configured, it returns a { simulated: true } result so the demo
 * environment works without real API keys.
 */

import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface ChannelSendResult {
  messageId: string;
  simulated: boolean;
}

// ── WhatsApp via Meta Cloud API ───────────────────────────────────────────────

export async function sendWhatsApp(
  to: string,
  content: string,
): Promise<ChannelSendResult> {
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
    type: 'text',
    text: { body: content },
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

// ── Email via Postmark ────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  content: string,
  caseNumberOrRef: string = 'direct',
): Promise<ChannelSendResult> {
  const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
  const fromEmail     = process.env.EMAIL_FROM ?? 'support@example.com';

  if (!postmarkToken) {
    logger.debug('Email: no Postmark token configured, simulating send', { to });
    return { messageId: `sim_email_${randomUUID()}`, simulated: true };
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
    const errText = await res.text();
    throw new Error(`Postmark API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  return { messageId: json.MessageID ?? randomUUID(), simulated: false };
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────

export async function sendSms(
  to: string,
  content: string,
): Promise<ChannelSendResult> {
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom  = process.env.TWILIO_FROM_NUMBER;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    logger.debug('SMS: no Twilio credentials configured, simulating send', { to });
    return { messageId: `sim_sms_${randomUUID()}`, simulated: true };
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
    const errText = await res.text();
    throw new Error(`Twilio API error ${res.status}: ${errText}`);
  }

  const json = await res.json() as any;
  return { messageId: json.sid ?? randomUUID(), simulated: false };
}
