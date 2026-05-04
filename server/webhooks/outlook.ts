/**
 * server/webhooks/outlook.ts
 *
 * Microsoft Graph subscription handler. Two distinct flows on the same
 * URL:
 *
 *  1. **Validation handshake** — when we (or the renewal cron) create a
 *     subscription, Graph immediately POSTs to our URL with a query
 *     parameter `?validationToken=<random>`. We MUST echo that exact
 *     string as plain text within 10 seconds or the subscription is
 *     rejected. No body, no auth — Graph just wants to verify we own the
 *     URL. This must run BEFORE any tenant resolution.
 *
 *  2. **Change notifications** — once validated, Graph POSTs JSON like:
 *     {
 *       "value": [{
 *         "subscriptionId": "<id>",
 *         "subscriptionExpirationDateTime": "<iso>",
 *         "changeType": "created",
 *         "resource": "users('me')/messages('AAMkA...')",
 *         "resourceData": { "@odata.type": "#Microsoft.Graph.Message", "id": "AAMkA..." },
 *         "clientState": "<our shared secret>"
 *       }]
 *     }
 *     We verify `clientState` matches what we stored, fetch the message,
 *     and enqueue a webhook_events row for the canonicalizer pipeline.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/webhooks
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { OutlookAdapter, extractOutlookBody, senderAddress } from '../integrations/outlook.js';
import { findTenantBySubscriptionId, outlookForTenant } from '../integrations/outlook-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const outlookWebhookRouter = Router();

outlookWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    // ── 1. Validation handshake ─────────────────────────────────────────
    // Graph passes ?validationToken=... on the subscription creation call.
    // We must respond text/plain with the token verbatim.
    const validationToken = req.query.validationToken;
    if (typeof validationToken === 'string' && validationToken.length > 0) {
      res.status(200).type('text/plain').send(validationToken);
      return;
    }

    // ── 2. Change notification ─────────────────────────────────────────
    let body: any;
    try {
      body = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch {
      logger.warn('outlook webhook: malformed JSON');
      return res.status(202).end();
    }

    const notifications: any[] = Array.isArray(body?.value) ? body.value : [];
    if (notifications.length === 0) {
      return res.status(202).end();
    }

    // Process each notification. Graph allows up to 100s per response, so
    // we run synchronously. A bad notification doesn't fail the whole
    // batch — Graph retries individually-failed notifications anyway.
    for (const note of notifications) {
      try {
        await handleNotification(note);
      } catch (err) {
        logger.warn('outlook notification handler threw', { error: String(err) });
      }
    }

    // 202 Accepted is the conventional success code for Graph webhooks.
    return res.status(202).end();
  },
);

async function handleNotification(note: {
  subscriptionId: string;
  clientState?: string;
  changeType?: string;
  resource?: string;
  resourceData?: { id?: string; '@odata.type'?: string };
}): Promise<void> {
  const subscriptionId = String(note.subscriptionId || '');
  const clientState = String(note.clientState || '');
  const messageId = String(note.resourceData?.id || '');
  if (!subscriptionId || !clientState || !messageId) {
    logger.debug('outlook notification: missing fields', { subscriptionId, hasClientState: Boolean(clientState), messageId });
    return;
  }

  const tenantInfo = await findTenantBySubscriptionId(subscriptionId, clientState);
  if (!tenantInfo) {
    logger.warn('outlook notification: no tenant for subscription', { subscriptionId });
    return;
  }

  const resolved = await outlookForTenant(tenantInfo.tenantId, null);
  if (!resolved) {
    logger.warn('outlook notification: tenant resolver returned null', { tenantId: tenantInfo.tenantId });
    return;
  }

  let message;
  try {
    message = await resolved.adapter.getMessage(messageId, { expandAttachments: false });
  } catch (err: any) {
    if (err?.statusCode === 404) {
      logger.debug('outlook notification: message gone (deleted before fetch)', { messageId });
      return;
    }
    logger.warn('outlook notification: getMessage failed', { messageId, error: String(err) });
    return;
  }

  const body = extractOutlookBody(message);
  const fromAddr = senderAddress(message);

  const supabase = getSupabaseAdmin();
  const eventId = randomUUID();
  const { error } = await supabase.from('webhook_events').insert({
    id: eventId,
    tenant_id: tenantInfo.tenantId,
    source_system: 'outlook',
    event_type: 'message.received',
    raw_payload: {
      graph_message_id: message.id,
      conversation_id: message.conversationId ?? null,
      internet_message_id: message.internetMessageId,
      from: fromAddr,
      subject: message.subject ?? '(no subject)',
      body_preview: message.bodyPreview ?? '',
      body_plain: body.plain,
      body_html: body.html,
      received_at: message.receivedDateTime,
      is_read: message.isRead === true,
      has_attachments: message.hasAttachments === true,
      categories: message.categories ?? [],
      connector_id: tenantInfo.connectorId,
      recipient_email: resolved.email,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: `outlook::${message.id}`,
  });
  if (error && error.code !== '23505') {
    logger.warn('outlook ingest: webhook_events insert failed', { error: error.message });
    return;
  }

  try {
    await enqueue(JobType.WEBHOOK_PROCESS, {
      webhookEventId: eventId,
      source: 'outlook',
    }, { tenantId: tenantInfo.tenantId });
  } catch (err) {
    logger.warn('outlook ingest: enqueue failed', { error: String(err) });
  }
}
