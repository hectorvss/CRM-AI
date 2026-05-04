/**
 * server/webhooks/intercom.ts
 *
 * Intercom webhook handler. Notes:
 *   - Signature header is `X-Hub-Signature` (HMAC-SHA1 hex, prefixed
 *     `sha1=`) keyed with the App's client_secret.
 *   - There is no timestamp; replay is mitigated by deduping on the
 *     `id` field of the topic envelope.
 *   - Body is `{ type: 'notification_event', topic: 'conversation.user.replied',
 *     id: 'notif_…', app_id: 'iq6c1g0j', data: { item: {...} } }`.
 *   - The same App + client_secret are used by every workspace, so
 *     signature verification + tenant lookup happen separately:
 *       1. Verify HMAC with INTERCOM_CLIENT_SECRET (single app secret).
 *       2. Look up the tenant by `app_id` from the body.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByIntercomAppId } from '../integrations/intercom-tenant.js';
import { verifyWebhookSignature } from '../integrations/intercom-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const intercomWebhookRouter = Router();

intercomWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const clientSecret = process.env.INTERCOM_CLIENT_SECRET || '';
    if (!clientSecret) {
      logger.warn('intercom webhook: INTERCOM_CLIENT_SECRET not configured');
      return res.status(503).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    const signature = String(req.header('X-Hub-Signature') || '');
    if (!verifyWebhookSignature({ rawBody, signature, clientSecret })) {
      logger.warn('intercom webhook: signature mismatch');
      return res.status(401).end();
    }

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    // Dev-mode "ping" to verify the URL — Intercom sends this from the
    // Developer Hub. We just ack 200.
    if (payload?.type === 'ping') return res.status(200).end();

    const appId = String(payload?.app_id ?? '');
    const tenantInfo = appId ? await findTenantByIntercomAppId(appId) : null;
    if (!tenantInfo) {
      logger.warn('intercom webhook: app_id does not match any connector', { appId });
      // Still 200 so Intercom doesn't retry a removed install indefinitely.
      return res.status(200).end();
    }

    const topic = String(payload?.topic ?? 'unknown');
    const externalId = `intercom::${appId}::${payload?.id ?? randomUUID()}`;

    const supabase = getSupabaseAdmin();
    const eventId = randomUUID();
    const item = payload?.data?.item ?? null;

    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'intercom',
      event_type: `intercom.${topic.replace(/\./g, '_')}`,
      raw_payload: {
        intercom_id: payload?.id ?? null,
        app_id: appId,
        topic,
        delivery_attempts: payload?.delivery_attempts ?? null,
        first_sent_at: payload?.first_sent_at ?? null,
        item_type: item?.type ?? null,
        item_id: item?.id ?? null,
        // Common quick-access fields per topic family
        conversation_id: item?.type === 'conversation' ? item.id : (item?.conversation_id ?? null),
        contact_id: item?.type === 'contact' ? item.id : (item?.user?.id ?? null),
        admin_id: item?.assignee_admin_id ?? null,
        state: item?.state ?? null,
        connector_id: tenantInfo.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('intercom persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'intercom',
        }, { tenantId: tenantInfo.tenantId });
      } catch (err) {
        logger.warn('intercom enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
