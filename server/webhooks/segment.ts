/**
 * server/webhooks/segment.ts
 *
 * Segment inbound webhook endpoint — used when Segment is configured as a
 * Destination Function with our URL `/webhooks/segment/<token>`. The token
 * is the per-connector discriminator (Segment doesn't sign payloads).
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantBySegmentWebhookToken } from '../integrations/segment-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const segmentWebhookRouter = Router();

segmentWebhookRouter.post('/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  if (!token) return res.status(404).end();

  const matched = await findTenantBySegmentWebhookToken(token);
  if (!matched) { logger.warn('segment webhook: token not matched'); return res.status(401).end(); }

  const rawBody = (req as any).rawBody as string | undefined;
  let event: any; try { event = rawBody ? JSON.parse(rawBody) : req.body; } catch { return res.status(200).end(); }

  const eventType = String(event?.type ?? 'unknown');
  const deliveryId = String(event?.messageId ?? randomUUID());
  const externalId = `segment::${matched.connectorId}::${deliveryId}`;
  const persistedId = randomUUID();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'segment',
    event_type: `segment.${eventType}`,
    raw_payload: {
      type: eventType,
      user_id: event?.userId ?? null,
      anonymous_id: event?.anonymousId ?? null,
      event_name: event?.event ?? null,
      properties: event?.properties ?? null,
      traits: event?.traits ?? null,
      timestamp: event?.timestamp ?? null,
      message_id: event?.messageId ?? null,
      connector_id: matched.connectorId,
      body: event,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });
  if (error && error.code !== '23505') { logger.warn('segment persist failed', { error: error.message }); return res.status(500).end(); }
  if (error?.code !== '23505') {
    try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'segment' }, { tenantId: matched.tenantId }); }
    catch (err) { logger.warn('segment enqueue failed', { error: String(err) }); }
  }
  return res.status(200).end();
});
