/**
 * server/webhooks/aircall.ts
 *
 * Aircall webhook handler.
 * Headers:
 *   X-Aircall-Signature: <hex HMAC SHA256 of `<timestamp>.<rawBody>`>
 *   X-Aircall-Timestamp: <unix seconds>
 *
 * Each webhook has its own per-installation token (returned at create
 * time). We iterate connected tenants and try each token until one
 * verifies.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/aircall-oauth.js';
import { findAircallTenantBySignature } from '../integrations/aircall-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const aircallWebhookRouter = Router();

aircallWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('X-Aircall-Signature') || '');
  const timestamp = String(req.header('X-Aircall-Timestamp') || '');
  if (!signature || !timestamp) {
    logger.warn('aircall webhook: missing signature or timestamp');
    return res.status(401).end();
  }

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    logger.warn('aircall webhook: no raw body captured');
    return res.status(400).end();
  }

  const matched = await findAircallTenantBySignature(
    (token) => verifyWebhookSignature({ rawBody, signature, timestamp, webhookToken: token }),
  );
  if (!matched) {
    logger.warn('aircall webhook: no connector signature matched');
    return res.status(401).end();
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  const eventType = String(event?.event ?? 'unknown');
  const data = event?.data ?? {};
  const callId = data?.id ?? null;
  const deliveryId = `${eventType}:${callId ?? randomUUID()}:${event?.timestamp ?? timestamp}`;
  const externalId = `aircall::${matched.connectorId}::${deliveryId}`;

  const persistedId = randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'aircall',
    event_type: `aircall.${eventType}`,
    raw_payload: {
      event: eventType,
      timestamp: event?.timestamp ?? null,
      // Quick-access fields
      call_id: callId,
      direction: data?.direction ?? null,
      status: data?.status ?? null,
      duration: data?.duration ?? null,
      number_digits: data?.number?.digits ?? null,
      user_email: data?.user?.email ?? null,
      contact_first_name: data?.contact?.first_name ?? null,
      contact_phone: data?.contact?.phone_numbers?.[0]?.value ?? null,
      recording_url: data?.recording ?? null,
      voicemail_url: data?.voicemail ?? null,
      transcription_available: eventType === 'call.transcription_available',
      missed_call_reason: data?.missed_call_reason ?? null,
      connector_id: matched.connectorId,
      body: event,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });

  if (error && error.code !== '23505') {
    logger.warn('aircall persist failed', { error: error.message });
    return res.status(500).end();
  }

  if (error?.code !== '23505') {
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'aircall', rawBody: '', headers: {} }, { tenantId: matched.tenantId });
    } catch (err) {
      logger.warn('aircall enqueue failed', { error: String(err) });
    }
  }

  return res.status(200).end();
});
