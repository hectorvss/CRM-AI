/**
 * server/webhooks/dhl.ts
 *
 * DHL push notifications. The DHL Tracking Push API delivers JSON to the
 * URL configured at subscription time. There is no signature; auth is by
 * URL secrecy — we register a per-tenant random `?secret=...` in the URL
 * and reverse-look up the tenant by it.
 *
 * Notification body roughly:
 *   {
 *     "trackingNumber": "JD0140...",
 *     "shipperReference": "...",
 *     "service": "express",
 *     "events": [
 *       { "timestamp":"2025-05-04T...", "statusCode":"transit",
 *         "description":"...", "location": { ... } }
 *     ],
 *     "status": { "statusCode":"transit","timestamp":"..." },
 *     "estimatedTimeOfDelivery": "..."
 *   }
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByDhlSecret } from '../integrations/dhl-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const dhlWebhookRouter = Router();

dhlWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const secret = typeof req.query.secret === 'string' ? req.query.secret : '';
    if (!secret) {
      logger.warn('dhl webhook: missing secret');
      return res.status(401).end();
    }
    const tenantInfo = await findTenantByDhlSecret(secret);
    if (!tenantInfo) {
      logger.warn('dhl webhook: secret does not match any connector');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const trackingNumber = String(event?.trackingNumber ?? '');
    const lastEvent = (event?.events ?? [])[0] ?? {};
    const statusCode = String(event?.status?.statusCode ?? lastEvent?.statusCode ?? 'unknown');
    const ts = String(event?.status?.timestamp ?? lastEvent?.timestamp ?? '');
    const externalId = `dhl::${trackingNumber}::${statusCode}::${ts}`;

    const supabase = getSupabaseAdmin();
    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'dhl',
      event_type: `dhl.tracking.${statusCode.toLowerCase() || 'event'}`,
      raw_payload: {
        tracking_number: trackingNumber,
        status_code: statusCode,
        status_description: lastEvent?.description ?? null,
        timestamp: ts,
        location: lastEvent?.location ?? null,
        service: event?.service ?? null,
        shipper_reference: event?.shipperReference ?? null,
        estimated_delivery: event?.estimatedTimeOfDelivery ?? null,
        signed_for_by: event?.proofOfDelivery?.signedBy ?? null,
        connector_id: tenantInfo.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('dhl persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'dhl',
        }, { tenantId: tenantInfo.tenantId });
      } catch (err) {
        logger.warn('dhl enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
