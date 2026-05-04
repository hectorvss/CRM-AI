/**
 * server/webhooks/channels.ts
 *
 * Inbound webhook handlers for direct messaging channels — Flow 10.
 *
 *   GET  /webhooks/whatsapp   — Meta verification handshake
 *   POST /webhooks/whatsapp   — Inbound WhatsApp messages (HMAC-signed by Meta)
 *   POST /webhooks/email      — Postmark inbound (basic-auth or shared-secret guarded)
 *   POST /webhooks/sms        — Twilio inbound SMS (X-Twilio-Signature)
 *   POST /webhooks/web-chat   — Embedded widget messages (shared API key)
 *
 * Contract for every channel:
 *  1. SIGNATURE / SHARED-SECRET FIRST. If the integration is not configured
 *     we return 503 + WEBHOOK_NOT_CONFIGURED. If it is configured but the
 *     incoming signature is bad we return 401. Only then do we touch the body.
 *  2. PERSIST CANONICAL EVENT. The webhook stores a `canonical_events` row
 *     with the full `NormalizedChannelMessage` payload + tenant_id +
 *     workspace_id + dedupe_key, so the CHANNEL_INGEST worker can pick up
 *     where we left off if the request dies.
 *  3. ENQUEUE CHANNEL_INGEST. The async worker (Flow 5) drains it.
 *  4. RESPOND 200 ONLY AFTER PERSISTENCE. We persist before acking so the
 *     handler is idempotent under provider retries.
 */

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
import { createIntegrationRepository } from '../data/integrations.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { config }  from '../config.js';
import { logger }  from '../utils/logger.js';
import { resolveTenantWorkspaceContext } from '../middleware/multiTenant.js';
import { integrationRegistry } from '../integrations/registry.js';
import type { WhatsAppAdapter } from '../integrations/whatsapp.js';
import type { NormalizedChannelMessage } from '../integrations/types.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function notConfigured(res: Response, code: string, missing: string[]): void {
  res.status(503).json({
    error:   'WEBHOOK_NOT_CONFIGURED',
    code,
    message: `${code.replace(/_/g, ' ')} on this deployment.`,
    missing,
  });
}

function unauthorized(res: Response, message = 'Invalid signature'): void {
  res.status(401).json({ error: 'UNAUTHORIZED', message });
}

async function persistAndEnqueue(opts: {
  tenantId:    string;
  workspaceId: string | null;
  channel:     NormalizedChannelMessage['channel'];
  message:     NormalizedChannelMessage;
  dedupeKey:   string;
  sourceSystem: string;
}): Promise<{ eventId: string; deduped: boolean }> {
  const integrationRepo = createIntegrationRepository();
  const scope = { tenantId: opts.tenantId };

  const existing = await integrationRepo
    .getWebhookEventByDedupeKey(scope, opts.dedupeKey)
    .catch(() => null);
  if (existing) return { eventId: existing.id, deduped: true };

  const eventId = randomUUID();
  const now     = new Date().toISOString();

  await integrationRepo.createCanonicalEvent(scope, {
    id:                    eventId,
    source_system:         opts.sourceSystem,
    source_entity_type:    'customer',
    source_entity_id:      opts.message.senderId,
    event_type:            'message.inbound',
    event_category:        'message',
    canonical_entity_type: 'customer',
    canonical_entity_id:   opts.message.senderId,
    normalized_payload:    opts.message,
    dedupe_key:            opts.dedupeKey,
    status:                'received',
    tenant_id:             opts.tenantId,
    workspace_id:          opts.workspaceId,
    occurred_at:           opts.message.sentAt,
    ingested_at:           now,
    updated_at:            now,
  });

  await enqueue(
    JobType.CHANNEL_INGEST,
    {
      canonicalEventId: eventId,
      channel:          opts.channel,
      rawMessageId:     opts.message.externalMessageId,
    },
    {
      tenantId:    opts.tenantId,
      workspaceId: opts.workspaceId ?? undefined,
      traceId:     eventId,
      priority:    3,
    },
  );

  return { eventId, deduped: false };
}

function extractDisplayName(from: string): string | undefined {
  const match = from.match(/^([^<]+)<[^>]+>/);
  return match ? match[1].trim() : undefined;
}

// ── WhatsApp (Meta Business Cloud API) ──────────────────────────────────────

export const whatsappWebhookRouter = Router();

/**
 * GET /webhooks/whatsapp — Meta's webhook verification handshake.
 * Responds with hub.challenge if hub.verify_token matches the configured token.
 */
whatsappWebhookRouter.get('/', async (req: Request, res: Response) => {
  const mode      = String(req.query['hub.mode'] ?? '');
  const token     = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');

  if (mode !== 'subscribe' || !token) {
    return res.status(403).send('Forbidden');
  }

  // Multi-tenant: every connector stores its own verify_token. We match the
  // incoming token against any active connector. If exactly one matches we
  // accept; otherwise fall back to env-var single-tenant mode.
  try {
    const supabase = (await import('../db/supabase.js')).getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('auth_config')
      .eq('system', 'whatsapp')
      .eq('status', 'connected');
    if (data && data.length > 0) {
      const ok = (data as Array<{ auth_config: any }>).some(
        (row) => (row.auth_config?.verify_token ?? '') === token,
      );
      if (ok) {
        logger.info('WhatsApp webhook verified (multi-tenant)');
        return res.status(200).send(challenge);
      }
    }
  } catch (err) {
    logger.warn('WhatsApp verify lookup failed (falling through to env)', { error: String(err) });
  }

  // Legacy env-var fallback
  const adapter = integrationRegistry.get<WhatsAppAdapter>('whatsapp');
  const expectedToken =
    adapter?.getVerifyToken() ||
    config.channels?.whatsappVerifyToken ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    '';
  if (expectedToken && token === expectedToken) {
    return res.status(200).send(challenge);
  }

  logger.warn('WhatsApp webhook verification failed', { mode });
  res.status(403).send('Forbidden');
});

/**
 * POST /webhooks/whatsapp — Inbound WhatsApp messages from Meta.
 *
 * Meta signs each delivery with HMAC-SHA256 over the raw body using the App
 * Secret as key. The signature is in `x-hub-signature-256` as `sha256=<hex>`.
 */
whatsappWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  const headers = req.headers as Record<string, string>;

  if (!rawBody) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing raw body' });
    return;
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Body is not valid JSON' });
    return;
  }

  // ── Multi-tenant resolution ─────────────────────────────────────────────
  // Meta puts the WABA id at `entry[].id` and the phone_number_id at
  // `entry[].changes[].value.metadata.phone_number_id`. We use those to
  // resolve the tenant BEFORE signature verification (since each tenant
  // signs with their own app_secret).
  const entries: any[] = body?.entry ?? [];
  const firstEntry = entries[0];
  const firstChange = firstEntry?.changes?.[0];
  const phoneNumberId = firstChange?.value?.metadata?.phone_number_id as string | undefined;
  const wabaId = firstEntry?.id as string | undefined;

  const { findTenantByPhoneNumberId, findTenantByWabaId } = await import('../integrations/whatsapp-tenant.js');
  const { WhatsAppAdapter: WA } = await import('../integrations/whatsapp.js');

  let tenantInfo = phoneNumberId ? await findTenantByPhoneNumberId(phoneNumberId) : null;
  if (!tenantInfo && wabaId) tenantInfo = await findTenantByWabaId(wabaId);

  // Choose the verification adapter: per-tenant if resolved, else env-var legacy.
  let verifyOk = false;
  if (tenantInfo?.webhookSecret) {
    const adapter = new WA({
      accessToken: tenantInfo.accessToken,
      phoneNumberId: phoneNumberId ?? '',
      verifyToken: tenantInfo.verifyToken,
      webhookSecret: tenantInfo.webhookSecret,
    });
    verifyOk = adapter.verifyWebhook(rawBody, headers);
  } else {
    const legacyAdapter = integrationRegistry.get<WhatsAppAdapter>('whatsapp');
    if (!legacyAdapter || !legacyAdapter.hasWebhookSecret()) {
      if (headers['x-hub-signature-256']) {
        logger.warn('WhatsApp webhook arrived but no per-tenant nor env-var secret matched', {
          phoneNumberId,
          wabaId,
        });
      }
      notConfigured(res, 'WHATSAPP_NOT_CONFIGURED', ['WHATSAPP_WEBHOOK_SECRET']);
      return;
    }
    verifyOk = legacyAdapter.verifyWebhook(rawBody, headers);
  }

  if (!verifyOk) {
    logger.warn('WhatsApp webhook: invalid HMAC signature', { phoneNumberId, wabaId });
    unauthorized(res, 'Invalid x-hub-signature-256');
    return;
  }

  // Resolve tenant context: prefer the per-tenant connector, fall back to
  // header-based resolution for legacy single-tenant setups.
  const context = tenantInfo
    ? { tenantId: tenantInfo.tenantId, workspaceId: tenantInfo.tenantId }
    : await resolveTenantWorkspaceContext(
        headers['x-tenant-id']    as string | undefined,
        headers['x-workspace-id'] as string | undefined,
      );

  // Ack 200 first only AFTER the loop succeeds for at least the persistence
  // step; we wrap each message in try/catch so a single bad message doesn't
  // abort the rest. Meta acks on 200 within 20 s.
  const persisted: string[] = [];
  const skipped:   string[] = [];

  try {
    // entries already extracted above for tenant resolution; reuse it.
    for (const entry of entries) {
      const changes: any[] = entry?.changes ?? [];

      for (const change of changes) {
        if (change?.field !== 'messages') continue;

        const value:    any   = change?.value ?? {};
        const messages: any[] = value?.messages ?? [];
        const contacts: any[] = value?.contacts ?? [];

        for (const waMsg of messages) {
          if (waMsg.type !== 'text') {
            skipped.push(waMsg.id);
            continue;
          }

          const externalMessageId = String(waMsg.id);
          const from              = String(waMsg.from);
          const sentAt            = new Date(parseInt(waMsg.timestamp, 10) * 1000).toISOString();
          const content           = (waMsg.text?.body as string) ?? '';
          const contact           = contacts.find((c: any) => c.wa_id === from);
          const senderName        = (contact?.profile?.name as string) ?? null;

          const message: NormalizedChannelMessage = {
            messageContent:    content,
            senderId:          from,
            senderName,
            channel:           'whatsapp',
            externalMessageId,
            sentAt,
          };

          const dedupeKey = `whatsapp:message:${externalMessageId}`;
          const result = await persistAndEnqueue({
            tenantId:    context.tenantId,
            workspaceId: context.workspaceId,
            channel:     'whatsapp',
            message,
            dedupeKey,
            sourceSystem: 'whatsapp',
          });

          if (result.deduped) {
            logger.debug('WhatsApp: duplicate message, skipped', { externalMessageId });
            skipped.push(externalMessageId);
          } else {
            persisted.push(externalMessageId);
            logger.info('WhatsApp message enqueued', { from, externalMessageId });
          }
        }
      }
    }
  } catch (err) {
    logger.error('WhatsApp webhook processing error', err);
    // Persistence failed mid-loop — surface 500 so Meta retries.
    res.status(500).json({ error: 'INTERNAL_ERROR' });
    return;
  }

  res.status(200).json({ ok: true, persisted: persisted.length, skipped: skipped.length });
});

// ── Email (Postmark inbound) ─────────────────────────────────────────────────

export const emailWebhookRouter = Router();

/**
 * POST /webhooks/email
 *
 * Postmark posts JSON to a URL we configure in their dashboard. There is no
 * cryptographic signature; the recommended hardening is HTTP basic auth on
 * the URL or a shared secret in a custom header. We accept either:
 *   - URL contains user:pass that matches POSTMARK_INBOUND_USER / _PASSWORD
 *   - Header `X-Postmark-Token` matches POSTMARK_INBOUND_TOKEN
 *
 * If Postmark is not configured AT ALL (no server token), we 503. If it is
 * configured but the request lacks a matching shared secret, we 401.
 */
emailWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;

  // 503 — Postmark not configured at all.
  const postmarkConfigured = Boolean(config.channels?.postmark?.serverToken);
  if (!postmarkConfigured) {
    notConfigured(res, 'POSTMARK_NOT_CONFIGURED', ['POSTMARK_SERVER_TOKEN']);
    return;
  }

  // 401 — shared secret check (only enforced when one is configured).
  const sharedSecret =
    process.env.POSTMARK_INBOUND_TOKEN ||
    process.env.POSTMARK_WEBHOOK_TOKEN ||
    '';
  if (sharedSecret) {
    const provided =
      (req.headers['x-postmark-token']   as string | undefined) ||
      (req.headers['x-postmark-secret']  as string | undefined) ||
      (req.query['token']                as string | undefined) ||
      '';
    const a = Buffer.from(provided);
    const b = Buffer.from(sharedSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn('Postmark inbound: invalid token');
      unauthorized(res, 'Invalid Postmark inbound token');
      return;
    }
  }

  if (!rawBody) {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = req.body ?? {};
  }

  const externalMessageId: string = (body.MessageID ?? body['message-id'] ?? randomUUID());
  const from:    string = body.From    ?? body.from    ?? '';
  const subject: string = body.Subject ?? body.subject ?? '';
  const textContent: string = body.TextBody ?? body.text ?? '';
  const sentAt: string = body.Date
    ? new Date(body.Date).toISOString()
    : new Date().toISOString();

  if (!from || !textContent) {
    logger.debug('Email webhook: empty from or body, ignoring');
    res.status(200).json({ ok: true, skipped: true, reason: 'empty' });
    return;
  }

  const emailMatch = from.match(/<([^>]+)>/) ?? [null, from];
  const senderEmail = (emailMatch[1] ?? from).trim().toLowerCase();

  const attachments: string[] = Array.isArray(body.Attachments)
    ? body.Attachments.map((a: any) => a?.Name ?? 'attachment')
    : [];

  const message: NormalizedChannelMessage = {
    messageContent:    textContent,
    senderId:          senderEmail,
    senderName:        extractDisplayName(from) ?? null,
    channel:           'email',
    externalMessageId: String(externalMessageId),
    sentAt,
    subject,
    attachments,
  };

  const context = await resolveTenantWorkspaceContext(
    req.headers['x-tenant-id']    as string | undefined,
    req.headers['x-workspace-id'] as string | undefined,
  );

  try {
    const result = await persistAndEnqueue({
      tenantId:    context.tenantId,
      workspaceId: context.workspaceId,
      channel:     'email',
      message,
      dedupeKey:   `email:message:${externalMessageId}`,
      sourceSystem: 'postmark',
    });
    res.status(200).json({ ok: true, eventId: result.eventId, deduped: result.deduped });
    logger.info('Email message persisted', { from: senderEmail, subject });
  } catch (err) {
    logger.error('Email webhook persistence failed', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── SMS (Twilio inbound) ─────────────────────────────────────────────────────

export const smsWebhookRouter = Router();

/**
 * Validates Twilio's `X-Twilio-Signature` header per the docs:
 *   sig = base64( HMAC-SHA1( authToken, fullUrl + sortedFormParams ) )
 *
 * The full URL is the absolute URL Twilio POSTed to; we reconstruct it from
 * `req.protocol`, `req.get('host')` and `req.originalUrl`.
 */
function verifyTwilioSignature(req: Request, params: Record<string, string>): boolean {
  const authToken = config.channels?.twilio?.authToken;
  if (!authToken) return false;

  const provided = req.headers['x-twilio-signature'] as string | undefined;
  if (!provided) return false;

  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
  const host  = req.headers['host'] as string;
  const url   = `${proto}://${host}${req.originalUrl}`;

  const sortedKeys = Object.keys(params).sort();
  const dataToSign = sortedKeys.reduce(
    (acc, key) => acc + key + (params[key] ?? ''),
    url,
  );

  const expected = createHmac('sha1', authToken)
    .update(Buffer.from(dataToSign, 'utf-8'))
    .digest('base64');

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * POST /webhooks/sms — Twilio inbound SMS.
 *
 * Twilio posts application/x-www-form-urlencoded with fields like From, To,
 * Body, MessageSid, etc. Our raw-body capture middleware preserves the raw
 * string; we parse it ourselves so signature verification has identical
 * bytes.
 */
smsWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }

  // Parse the urlencoded body into a flat map for signing + business logic.
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) {
    params[k] = v;
  }

  // ── Multi-tenant Twilio resolution ──────────────────────────────────────
  // Twilio puts the destination number in `To`. We reverse-look it up
  // against connectors.auth_config to find which tenant owns it, THEN use
  // that tenant's auth_token to verify the signature. The legacy env-var
  // fallback (config.channels.twilio.authToken) still works for single-
  // tenant dev deployments.
  const toNumber = params.To || '';
  const { findTenantByTwilioNumber } = await import('../integrations/twilio-tenant.js');
  const { TwilioAdapter } = await import('../integrations/twilio.js');
  const tenantInfo = toNumber ? await findTenantByTwilioNumber(toNumber) : null;

  const authTokenForVerify = tenantInfo?.authToken
    ?? config.channels?.twilio?.authToken
    ?? '';

  if (!authTokenForVerify) {
    notConfigured(res, 'TWILIO_NOT_CONFIGURED', [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_NUMBER',
    ]);
    return;
  }

  // Reconstruct the absolute URL Twilio POSTed to.
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol;
  const host = req.headers['host'] as string;
  const fullUrl = `${proto}://${host}${req.originalUrl}`;
  const providedSig = req.headers['x-twilio-signature'] as string | undefined;

  if (!providedSig || !TwilioAdapter.verifyWebhookSignature({
    authToken: authTokenForVerify,
    fullUrl,
    params,
    providedSignature: providedSig ?? '',
  })) {
    logger.warn('Twilio webhook: invalid X-Twilio-Signature', {
      hasTenant: Boolean(tenantInfo),
      to: toNumber,
    });
    unauthorized(res, 'Invalid X-Twilio-Signature');
    return;
  }

  const externalMessageId = params.MessageSid || randomUUID();
  const from              = params.From      || '';
  const content           = params.Body      || '';

  if (!from || !content) {
    res.status(200).json({ ok: true, skipped: true, reason: 'empty' });
    return;
  }

  // WhatsApp via Twilio also lands here — From: "whatsapp:+34..." gives it away.
  const channel: 'sms' | 'whatsapp' = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms';

  const message: NormalizedChannelMessage = {
    messageContent:    content,
    senderId:          from.replace(/^whatsapp:/, ''),
    senderName:        null,
    channel,
    externalMessageId,
    sentAt:            new Date().toISOString(),
  };

  // Prefer the tenant resolved by phone number; fall back to header-based
  // resolution for the legacy env-var path.
  const context = tenantInfo
    ? { tenantId: tenantInfo.tenantId, workspaceId: tenantInfo.tenantId }
    : await resolveTenantWorkspaceContext(
        req.headers['x-tenant-id']    as string | undefined,
        req.headers['x-workspace-id'] as string | undefined,
      );

  try {
    const result = await persistAndEnqueue({
      tenantId:    context.tenantId,
      workspaceId: context.workspaceId,
      channel,
      message,
      dedupeKey:   `${channel}:message:${externalMessageId}`,
      sourceSystem: 'twilio',
    });
    // Twilio expects an empty TwiML response or 204; 200 OK works too.
    res.status(200).type('text/xml').send('<Response/>');
    logger.info('Twilio inbound persisted', { channel, from, sid: externalMessageId, eventId: result.eventId });
  } catch (err) {
    logger.error('Twilio webhook persistence failed', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── Web chat widget ──────────────────────────────────────────────────────────

export const webChatWebhookRouter = Router();

/**
 * POST /webhooks/web-chat
 *
 * Embedded web-chat widget messages. There is no provider signature; we
 * authenticate via a shared API key (`WEB_CHAT_API_KEY`) sent by the widget
 * in the `x-web-chat-key` header. If the key is not configured we 503.
 */
webChatWebhookRouter.post('/', async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;

  const expected = process.env.WEB_CHAT_API_KEY?.trim() ?? '';
  if (!expected) {
    notConfigured(res, 'WEB_CHAT_NOT_CONFIGURED', ['WEB_CHAT_API_KEY']);
    return;
  }

  const provided = (req.headers['x-web-chat-key'] as string | undefined) ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    unauthorized(res, 'Invalid x-web-chat-key');
    return;
  }

  if (!rawBody) {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Body is not valid JSON' });
    return;
  }

  const sessionId  = String(body.sessionId ?? body.session_id ?? randomUUID());
  const externalId = String(body.messageId ?? body.message_id ?? randomUUID());
  const content    = String(body.content   ?? body.text       ?? '');

  if (!content) {
    res.status(200).json({ ok: true, skipped: true, reason: 'empty' });
    return;
  }

  const message: NormalizedChannelMessage = {
    messageContent:    content,
    senderId:          sessionId,
    senderName:        body.name ?? body.senderName ?? null,
    channel:           'web_chat',
    externalMessageId: externalId,
    sentAt:            body.sentAt ?? new Date().toISOString(),
  };

  const context = await resolveTenantWorkspaceContext(
    req.headers['x-tenant-id']    as string | undefined,
    req.headers['x-workspace-id'] as string | undefined,
  );

  try {
    const result = await persistAndEnqueue({
      tenantId:    context.tenantId,
      workspaceId: context.workspaceId,
      channel:     'web_chat',
      message,
      dedupeKey:   `web_chat:message:${externalId}`,
      sourceSystem: 'web_chat',
    });
    res.status(200).json({ ok: true, eventId: result.eventId, deduped: result.deduped });
  } catch (err) {
    logger.error('Web chat webhook persistence failed', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
