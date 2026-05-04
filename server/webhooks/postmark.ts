/**
 * server/webhooks/postmark.ts
 *
 * Postmark webhook handler. Postmark has no signature on webhook
 * deliveries — auth is by URL secrecy. We register a webhook URL with a
 * per-tenant random `?token=...` and resolve the tenant by reverse-
 * looking up that token in connectors.auth_config.webhook_token.
 *
 * RecordTypes we care about (RecordType field in body):
 *   Delivery      — sent successfully
 *   Bounce        — hard/soft bounce
 *   SpamComplaint — recipient marked as spam
 *   Open          — recipient opened (with open tracking on)
 *   Click         — recipient clicked a tracked link
 *   SubscriptionChange — list-unsubscribe event
 *
 * For inbound email Postmark uses a different webhook (per-server
 * Inbound URL), which is out-of-scope here — most merchants will use
 * Gmail/Outlook for inbound and Postmark only for outbound.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByPostmarkToken } from '../integrations/postmark-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const postmarkWebhookRouter = Router();

postmarkWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      logger.warn('postmark webhook: missing token query param');
      return res.status(401).end();
    }

    const tenantInfo = await findTenantByPostmarkToken(token);
    if (!tenantInfo) {
      logger.warn('postmark webhook: token does not match any connector');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const recordType = String(event?.RecordType ?? 'unknown');
    const messageId = String(event?.MessageID ?? '');
    const recipient = String(event?.Recipient ?? event?.Email ?? '');
    const externalId = `postmark::${recordType}::${messageId}::${recipient}::${event?.ReceivedAt ?? event?.BouncedAt ?? event?.OpenedAt ?? event?.ClickedAt ?? ''}`;

    const supabase = getSupabaseAdmin();
    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'postmark',
      event_type: `postmark.${recordType.toLowerCase()}`,
      raw_payload: {
        record_type: recordType,
        message_id: messageId,
        recipient,
        message_stream: event?.MessageStream ?? null,
        tag: event?.Tag ?? null,
        metadata: event?.Metadata ?? null,
        // Bounce-specific
        bounce_id: event?.ID ?? null,
        bounce_type: event?.Type ?? null,
        bounce_description: event?.Description ?? null,
        inactive: event?.Inactive ?? null,
        // Spam complaint
        complaint_id: event?.ID ?? null,
        // Open / Click
        opened_at: event?.OpenedAt ?? null,
        clicked_at: event?.ClickedAt ?? null,
        click_url: event?.OriginalLink ?? null,
        user_agent: event?.UserAgent ?? null,
        connector_id: tenantInfo.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('postmark persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      // Side-effects: bounce + spam complaint should mark the customer
      // as undeliverable. We hand to the worker queue for that.
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'postmark',
        }, { tenantId: tenantInfo.tenantId });
      } catch (err) {
        logger.warn('postmark enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
