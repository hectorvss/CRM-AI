/**
 * server/webhooks/hubspot.ts
 *
 * HubSpot webhook handler. HubSpot signs each delivery with v3:
 *   X-HubSpot-Signature-v3: base64(HMAC-SHA256(method+url+rawBody+timestamp, clientSecret))
 *   X-HubSpot-Request-Timestamp: epoch ms
 *
 * The body is an array of events; each event has a `portalId` (hub_id)
 * we reverse-look up against connectors. We persist each event individually
 * with a deterministic dedupe key so retried deliveries are idempotent.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByHubId } from '../integrations/hubspot-tenant.js';
import { verifyWebhookV3 } from '../integrations/hubspot-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const hubspotWebhookRouter = Router();

hubspotWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const signature = String(req.header('X-HubSpot-Signature-v3') || '');
    const timestamp = String(req.header('X-HubSpot-Request-Timestamp') || '');
    if (!signature || !timestamp) {
      logger.warn('hubspot webhook: missing signature/timestamp');
      return res.status(401).end();
    }
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET || '';
    if (!clientSecret) {
      logger.warn('hubspot webhook: HUBSPOT_CLIENT_SECRET not configured');
      return res.status(503).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    const fullUrl = `https://${req.header('host')}${req.originalUrl}`;
    const ok = verifyWebhookV3({
      method: req.method,
      url: fullUrl,
      rawBody,
      signature,
      timestamp,
      clientSecret,
    });
    if (!ok) {
      logger.warn('hubspot webhook: signature mismatch');
      return res.status(401).end();
    }

    let events: any[];
    try {
      events = JSON.parse(rawBody);
    } catch {
      return res.status(200).end();
    }
    if (!Array.isArray(events)) events = [events];

    const supabase = getSupabaseAdmin();
    for (const event of events) {
      const portalId = Number(event?.portalId ?? 0);
      const tenantInfo = portalId ? await findTenantByHubId(portalId) : null;
      if (!tenantInfo) {
        logger.warn('hubspot webhook: portalId does not match any connector', { portalId });
        continue;
      }
      const eventId = randomUUID();
      const subscriptionType = String(event?.subscriptionType ?? 'unknown');
      const objectId = String(event?.objectId ?? '');
      const occurredAt = Number(event?.occurredAtMillis ?? Date.now());
      const externalId = `hubspot::${portalId}::${event?.eventId ?? `${subscriptionType}::${objectId}::${occurredAt}`}`;

      const { error } = await supabase.from('webhook_events').insert({
        id: eventId,
        tenant_id: tenantInfo.tenantId,
        source_system: 'hubspot',
        event_type: `hubspot.${subscriptionType.toLowerCase()}`,
        raw_payload: {
          subscription_type: subscriptionType,
          object_id: objectId,
          object_type_id: event?.objectTypeId ?? null,
          property_name: event?.propertyName ?? null,
          property_value: event?.propertyValue ?? null,
          change_source: event?.changeSource ?? null,
          source_id: event?.sourceId ?? null,
          message_id: event?.messageId ?? null,
          message_type: event?.messageType ?? null,
          portal_id: portalId,
          app_id: event?.appId ?? null,
          occurred_at_millis: occurredAt,
          connector_id: tenantInfo.connectorId,
        },
        received_at: new Date().toISOString(),
        status: 'received',
        dedupe_key: externalId,
      });

      if (error && error.code !== '23505') {
        logger.warn('hubspot persist failed', { error: error.message });
        continue;
      }

      if (error?.code !== '23505') {
        try {
          await enqueue(JobType.WEBHOOK_PROCESS, {
            webhookEventId: eventId,
            source: 'hubspot',
          }, { tenantId: tenantInfo.tenantId });
        } catch (err) {
          logger.warn('hubspot enqueue failed', { error: String(err) });
        }
      }
    }

    return res.status(200).end();
  },
);
