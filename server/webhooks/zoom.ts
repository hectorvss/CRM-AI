/**
 * server/webhooks/zoom.ts
 *
 * Zoom webhook handler.
 * Headers: x-zm-signature (= "v0=<hex>"), x-zm-request-timestamp.
 * Signed with the Zoom App's Webhook Secret Token (NOT the OAuth client_secret).
 *
 * Zoom URL validation: when the endpoint is added in the App config,
 * Zoom POSTs `event: 'endpoint.url_validation'` with `payload.plainToken`.
 * We must reply with `{ plainToken, encryptedToken }` where
 * encryptedToken = HMAC-SHA256-hex(plainToken, secretToken).
 *
 * Zoom signs with the **app-level** Webhook Secret Token, so the
 * signature is the same for all installs of this app. We fan-out to
 * all tenants matching `payload.account_id`.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature, buildUrlValidationResponse } from '../integrations/zoom-oauth.js';
import { findZoomTenantsByAccount } from '../integrations/zoom-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const zoomWebhookRouter = Router();

zoomWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('x-zm-signature') || '');
  const timestamp = String(req.header('x-zm-request-timestamp') || '');
  const rawBody = (req as any).rawBody as string | undefined;

  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';
  if (!secretToken) { logger.error('zoom webhook: ZOOM_WEBHOOK_SECRET_TOKEN not configured'); return res.status(503).end(); }

  if (!signature || !timestamp || !rawBody) {
    logger.warn('zoom webhook: missing signature/timestamp/body');
    return res.status(401).end();
  }

  if (!verifyWebhookSignature({ rawBody, signature, timestamp, secretToken })) {
    logger.warn('zoom webhook: signature mismatch');
    return res.status(401).end();
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  // URL validation handshake
  if (event?.event === 'endpoint.url_validation' && event?.payload?.plainToken) {
    return res.status(200).json(buildUrlValidationResponse(String(event.payload.plainToken), secretToken));
  }

  const eventType = String(event?.event ?? 'unknown');
  const accountId = String(event?.payload?.account_id ?? '');

  const tenants = await findZoomTenantsByAccount(accountId);
  if (tenants.length === 0) { logger.warn('zoom webhook: no tenants matched account_id', { accountId }); return res.status(200).end(); }

  const meeting = event?.payload?.object ?? {};
  const deliveryId = String(event?.event_ts ?? '') + ':' + (meeting?.uuid ?? meeting?.id ?? randomUUID());

  const supabase = getSupabaseAdmin();
  for (const t of tenants) {
    const externalId = `zoom::${t.connectorId}::${deliveryId}`;
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: t.tenantId,
      source_system: 'zoom',
      event_type: `zoom.${eventType}`,
      raw_payload: {
        event: eventType,
        account_id: accountId,
        event_ts: event?.event_ts ?? null,
        meeting_id: meeting?.id ?? null,
        meeting_uuid: meeting?.uuid ?? null,
        meeting_topic: meeting?.topic ?? null,
        meeting_start_time: meeting?.start_time ?? null,
        meeting_duration: meeting?.duration ?? null,
        host_email: meeting?.host_email ?? null,
        host_id: meeting?.host_id ?? null,
        recording_files: meeting?.recording_files?.length ?? null,
        connector_id: t.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });
    if (error && error.code !== '23505') { logger.warn('zoom persist failed', { tenantId: t.tenantId, error: error.message }); continue; }
    if (error?.code !== '23505') {
      try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'zoom' }, { tenantId: t.tenantId }); }
      catch (err) { logger.warn('zoom enqueue failed', { error: String(err) }); }
    }
  }
  return res.status(200).end();
});
