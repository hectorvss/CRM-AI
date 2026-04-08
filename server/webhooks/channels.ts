/**
 * server/webhooks/channels.ts
 *
 * Inbound webhook handlers for direct messaging channels:
 *   POST /webhooks/whatsapp  — Meta Business API (WhatsApp Cloud API)
 *   POST /webhooks/email     — Postmark / SendGrid Inbound
 *
 * Flow for both channels:
 *  1. Parse and validate the incoming payload
 *  2. Deduplicate using the platform's message ID
 *  3. Persist a canonical_event with the normalised message payload
 *  4. Respond 200 immediately
 *  5. Enqueue CHANNEL_INGEST for background processing
 *
 * Design notes:
 *  - We do NOT enqueue WEBHOOK_PROCESS here — channel messages bypass the
 *    commerce webhook pipeline and go straight to CHANNEL_INGEST.
 *  - The normalised_payload stored in canonical_events must conform to the
 *    NormalizedChannelMessage interface defined in channelIngest.ts.
 *  - WhatsApp GET requests are used for webhook verification (challenge echo).
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb }   from '../db/client.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { config }  from '../config.js';
import { logger }  from '../utils/logger.js';
import { resolveTenantWorkspaceContext } from '../middleware/multiTenant.js';

// ── WhatsApp (Meta Business API) ──────────────────────────────────────────────

export const whatsappWebhookRouter = Router();

/**
 * GET /webhooks/whatsapp
 * Meta's webhook verification handshake.
 * Responds with hub.challenge if hub.verify_token matches config.
 */
whatsappWebhookRouter.get('/', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = config.channels?.whatsappVerifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expectedToken) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, token });
    res.status(403).send('Forbidden');
  }
});

/**
 * POST /webhooks/whatsapp
 * Incoming messages from Meta Business API.
 *
 * Meta payload structure (simplified):
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [{
 *     "id": "<WABA_ID>",
 *     "changes": [{
 *       "value": {
 *         "messaging_product": "whatsapp",
 *         "contacts": [{ "wa_id": "<phone>", "profile": { "name": "<name>" } }],
 *         "messages": [{
 *           "id": "<msg_id>",
 *           "from": "<phone>",
 *           "timestamp": "<unix>",
 *           "type": "text",
 *           "text": { "body": "<content>" }
 *         }]
 *       },
 *       "field": "messages"
 *     }]
 *   }]
 * }
 */
whatsappWebhookRouter.post('/', (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    res.status(400).send('bad request');
    return;
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    logger.warn('WhatsApp webhook: invalid JSON');
    res.status(400).send('bad request');
    return;
  }

  // Respond immediately — Meta retries if no 200 within 20 s
  res.status(200).send('ok');

  const db = getDb();
  const context = resolveTenantWorkspaceContext(
    req.headers['x-tenant-id'] as string | undefined,
    req.headers['x-workspace-id'] as string | undefined,
  );

  try {
    const entries: any[] = body?.entry ?? [];

    for (const entry of entries) {
      const changes: any[] = entry?.changes ?? [];

      for (const change of changes) {
        if (change?.field !== 'messages') continue;

        const value    = change?.value ?? {};
        const messages: any[] = value?.messages ?? [];
        const contacts: any[] = value?.contacts ?? [];

        for (const waMsgRaw of messages) {
          // Only handle text messages in Phase 2; media skipped for now
          if (waMsgRaw.type !== 'text') continue;

          const externalMessageId = waMsgRaw.id as string;
          const from              = waMsgRaw.from as string;
          const sentAt            = new Date(parseInt(waMsgRaw.timestamp, 10) * 1000).toISOString();
          const content           = waMsgRaw.text?.body as string ?? '';
          const contact           = contacts.find((c: any) => c.wa_id === from);
          const senderName        = contact?.profile?.name as string | undefined;

          // Deduplicate by externalMessageId
          const dedupeKey = `whatsapp:message:${externalMessageId}`;
          const existing = db.prepare(
            'SELECT id FROM canonical_events WHERE dedupe_key = ? LIMIT 1'
          ).get(dedupeKey);

          if (existing) {
            logger.debug('WhatsApp: duplicate message, skipping', { externalMessageId });
            continue;
          }

          const normalized = JSON.stringify({
            messageContent:    content,
            senderId:          from,
            senderName:        senderName ?? null,
            channel:           'whatsapp',
            externalMessageId,
            sentAt,
          });

          const eventId = randomUUID();
          const now     = new Date().toISOString();

          db.prepare(`
            INSERT INTO canonical_events (
              id, source_system, source_entity_type, source_entity_id,
              event_type, occurred_at,
              canonical_entity_type, canonical_entity_id,
              normalized_payload, dedupe_key,
              status, tenant_id, workspace_id, created_at, updated_at
            ) VALUES (?, 'whatsapp', 'customer', ?, 'message.inbound', ?, 'customer', ?, ?, ?, 'received', ?, ?, ?, ?)
          `).run(eventId, from, sentAt, from, normalized, dedupeKey, context.tenantId, context.workspaceId, now, now);

          enqueue(
            JobType.CHANNEL_INGEST,
            { canonicalEventId: eventId, channel: 'whatsapp', rawMessageId: externalMessageId },
            { tenantId: context.tenantId, workspaceId: context.workspaceId, traceId: eventId, priority: 3 },
          );

          logger.info('WhatsApp message enqueued', { from, externalMessageId });
        }
      }
    }
  } catch (err) {
    logger.error('WhatsApp webhook processing error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── Email (Postmark / SendGrid Inbound) ───────────────────────────────────────

export const emailWebhookRouter = Router();

/**
 * POST /webhooks/email
 *
 * Supports two common inbound email webhook formats:
 *
 * Postmark:
 * { "MessageID": "...", "From": "...", "Subject": "...", "TextBody": "...", "Attachments": [] }
 *
 * SendGrid:
 * { "message-id": "...", "from": "...", "subject": "...", "text": "...", "attachments": "0" }
 *
 * We detect the format by checking for Postmark's capital-cased keys.
 */
emailWebhookRouter.post('/', (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    res.status(400).send('bad request');
    return;
  }

  let body: any;
  try {
    // Postmark sends JSON; SendGrid sends multipart/form-data encoded as JSON
    body = JSON.parse(rawBody);
  } catch {
    // SendGrid multipart fallback: body is already parsed by express if content-type matches
    body = req.body ?? {};
  }

  // Respond immediately
  res.status(200).send('ok');

  const db = getDb();
  const context = resolveTenantWorkspaceContext(
    req.headers['x-tenant-id'] as string | undefined,
    req.headers['x-workspace-id'] as string | undefined,
  );

  try {
    // Normalise across Postmark / SendGrid
    const isPostmark = Boolean(body.MessageID);

    const externalMessageId: string = (isPostmark ? body.MessageID : body['message-id']) ?? randomUUID();
    const from: string               = (isPostmark ? body.From      : body.from)        ?? '';
    const subject: string            = (isPostmark ? body.Subject   : body.subject)     ?? '';
    const textContent: string        = (isPostmark ? body.TextBody  : body.text)        ?? '';
    const sentAt: string             = (isPostmark ? body.Date      : body.date)
      ? new Date(isPostmark ? body.Date : body.date).toISOString()
      : new Date().toISOString();

    const attachments: string[] = isPostmark
      ? (body.Attachments ?? []).map((a: any) => a.Name ?? 'attachment')
      : [];

    if (!from || !textContent) {
      logger.debug('Email webhook: empty from or body, skipping');
      return;
    }

    // Extract plain email address from "Name <email@example.com>" format
    const emailMatch = from.match(/<([^>]+)>/) ?? [null, from];
    const senderEmail = (emailMatch[1] ?? from).trim().toLowerCase();

    const dedupeKey = `email:message:${externalMessageId}`;
    const existing  = db.prepare(
      'SELECT id FROM canonical_events WHERE dedupe_key = ? LIMIT 1'
    ).get(dedupeKey);

    if (existing) {
      logger.debug('Email: duplicate message, skipping', { externalMessageId });
      return;
    }

    const normalized = JSON.stringify({
      messageContent:    textContent,
      senderId:          senderEmail,
      senderName:        extractDisplayName(from),
      channel:           'email',
      externalMessageId,
      sentAt,
      subject,
      attachments,
    });

    const eventId = randomUUID();
    const now     = new Date().toISOString();

    db.prepare(`
      INSERT INTO canonical_events (
        id, source_system, source_entity_type, source_entity_id,
        event_type, occurred_at,
        canonical_entity_type, canonical_entity_id,
        normalized_payload, dedupe_key,
        status, tenant_id, workspace_id, created_at, updated_at
      ) VALUES (?, 'email', 'customer', ?, 'message.inbound', ?, 'customer', ?, ?, ?, 'received', ?, ?, ?, ?)
    `).run(eventId, senderEmail, sentAt, senderEmail, normalized, dedupeKey, context.tenantId, context.workspaceId, now, now);

    enqueue(
      JobType.CHANNEL_INGEST,
      { canonicalEventId: eventId, channel: 'email', rawMessageId: externalMessageId },
      { tenantId: context.tenantId, workspaceId: context.workspaceId, traceId: eventId, priority: 3 },
    );

    logger.info('Email message enqueued', { from: senderEmail, subject, externalMessageId });

  } catch (err) {
    logger.error('Email webhook processing error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDisplayName(from: string): string | undefined {
  // 'John Doe <john@example.com>' → 'John Doe'
  const match = from.match(/^([^<]+)<[^>]+>/);
  return match ? match[1].trim() : undefined;
}
