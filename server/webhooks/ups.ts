/**
 * server/webhooks/ups.ts
 *
 * UPS Track webhook handler. UPS doesn't sign webhooks with HMAC; instead
 * each delivery includes a `Credential` header (the value the merchant
 * configured at subscription time). We register a per-tenant random
 * credential and reverse-look up the tenant by it.
 *
 * Track Push notifications come as JSON like:
 *   {
 *     "trackingNumber": "1ZXXXXXX",
 *     "localActivityDate": "20250504",
 *     "localActivityTime": "143000",
 *     "activityLocation": { "city":"...","stateProvince":"...","country":"US" },
 *     "activityStatus": { "type":"D", "code":"FS", "description":"Delivered" },
 *     "scheduledDeliveryDate": "...",
 *     ...
 *   }
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByUpsCredential } from '../integrations/ups-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const upsWebhookRouter = Router();

upsWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    // UPS sends the credential either in a header or back in the URL on
    // some configurations — accept both.
    const credential = String(
      req.header('Credential') ||
      req.header('credential') ||
      req.query.credential || '',
    );
    if (!credential) {
      logger.warn('ups webhook: missing credential');
      return res.status(401).end();
    }

    const tenantInfo = await findTenantByUpsCredential(credential);
    if (!tenantInfo) {
      logger.warn('ups webhook: credential does not match any connector');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const trackingNumber = String(event?.trackingNumber ?? '');
    const statusType = String(event?.activityStatus?.type ?? '');
    const statusCode = String(event?.activityStatus?.code ?? '');
    const statusDesc = String(event?.activityStatus?.description ?? 'unknown');
    const activityDate = String(event?.localActivityDate ?? '');
    const activityTime = String(event?.localActivityTime ?? '');
    const externalId = `ups::${trackingNumber}::${statusCode}::${activityDate}::${activityTime}`;

    const supabase = getSupabaseAdmin();
    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'ups',
      event_type: `ups.tracking.${statusType.toLowerCase() || 'event'}`,
      raw_payload: {
        tracking_number: trackingNumber,
        status_type: statusType,
        status_code: statusCode,
        status_description: statusDesc,
        activity_date: activityDate,
        activity_time: activityTime,
        location: event?.activityLocation ?? null,
        scheduled_delivery_date: event?.scheduledDeliveryDate ?? null,
        actual_delivery_date: event?.actualDeliveryDate ?? null,
        signed_for_by: event?.signedForByName ?? null,
        connector_id: tenantInfo.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('ups persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'ups',
        }, { tenantId: tenantInfo.tenantId });
      } catch (err) {
        logger.warn('ups enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
