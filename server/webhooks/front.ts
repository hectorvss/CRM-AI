/**
 * server/webhooks/front.ts
 *
 * Front webhook handler.
 * Headers:
 *   X-Front-Signature:         base64 HMAC-SHA256 of `<timestamp>:<rawBody>` keyed with app secret
 *   X-Front-Request-Timestamp: unix seconds (rejected if drift > 5 min)
 *
 * Front signs with the **app secret** (= OAuth client_secret), so the
 * signature is identical for all tenants that installed this app. We
 * verify once with the app secret, then fan-out the event to every
 * connected tenant.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/front-oauth.js';
import { findFrontTenants } from '../integrations/front-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const frontWebhookRouter = Router();

frontWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('X-Front-Signature') || '');
  const timestamp = String(req.header('X-Front-Request-Timestamp') || '');
  if (!signature || !timestamp) {
    logger.warn('front webhook: missing signature or timestamp');
    return res.status(401).end();
  }

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    logger.warn('front webhook: no raw body captured');
    return res.status(400).end();
  }

  const appSecret = process.env.FRONT_CLIENT_SECRET || '';
  if (!appSecret) {
    logger.error('front webhook: FRONT_CLIENT_SECRET not configured');
    return res.status(503).end();
  }

  if (!verifyWebhookSignature({ rawBody, signature, timestamp, appSecret })) {
    logger.warn('front webhook: signature mismatch');
    return res.status(401).end();
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  // Front URL verification handshake (sends a payload with type=challenge)
  if (event?.type === 'challenge' && event?.token) {
    return res.status(200).json({ challenge: event.token });
  }

  const tenants = await findFrontTenants(event);
  if (tenants.length === 0) {
    logger.warn('front webhook: no connected tenants');
    return res.status(200).end();
  }

  const eventType = String(event?.type ?? 'unknown');
  const conversation = event?.conversation ?? null;
  const message = event?.message ?? null;
  const deliveryId = event?.id ?? message?.id ?? conversation?.id ?? randomUUID();

  const supabase = getSupabaseAdmin();
  for (const t of tenants) {
    const externalId = `front::${t.connectorId}::${deliveryId}`;
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: t.tenantId,
      source_system: 'front',
      event_type: `front.${eventType}`,
      raw_payload: {
        type: eventType,
        // Quick-access fields
        conversation_id: conversation?.id ?? null,
        conversation_subject: conversation?.subject ?? null,
        conversation_status: conversation?.status ?? null,
        recipient_handle: conversation?.recipient?.handle ?? null,
        assignee_email: conversation?.assignee?.email ?? null,
        message_id: message?.id ?? null,
        message_type: message?.type ?? null,
        message_is_inbound: message?.is_inbound ?? null,
        message_blurb: message?.blurb ?? null,
        author_email: message?.author?.email ?? null,
        connector_id: t.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('front persist failed', { tenantId: t.tenantId, error: error.message });
      continue;
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: persistedId,
          source: 'front',
        }, { tenantId: t.tenantId });
      } catch (err) {
        logger.warn('front enqueue failed', { tenantId: t.tenantId, error: String(err) });
      }
    }
  }

  return res.status(200).end();
});
