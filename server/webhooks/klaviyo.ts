/**
 * server/webhooks/klaviyo.ts
 *
 * Klaviyo webhook handler. Header `klaviyo-signature` = base64 HMAC SHA256
 * of raw body keyed with the per-webhook secret.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/klaviyo-oauth.js';
import { findKlaviyoTenantBySignature } from '../integrations/klaviyo-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const klaviyoWebhookRouter = Router();

klaviyoWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('klaviyo-signature') || '');
  if (!signature) return res.status(401).end();
  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) return res.status(400).end();

  const matched = await findKlaviyoTenantBySignature((secret) => verifyWebhookSignature({ rawBody, signature, secret }));
  if (!matched) { logger.warn('klaviyo webhook: signature mismatch'); return res.status(401).end(); }

  let event: any; try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  const events: any[] = Array.isArray(event?.data) ? event.data : [event];
  const supabase = getSupabaseAdmin();
  for (const e of events) {
    const eventType = String(e?.attributes?.event_type ?? e?.type ?? 'unknown');
    const deliveryId = String(e?.id ?? randomUUID());
    const externalId = `klaviyo::${matched.connectorId}::${deliveryId}`;
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: matched.tenantId,
      source_system: 'klaviyo',
      event_type: `klaviyo.${eventType}`,
      raw_payload: {
        type: eventType,
        profile_id: e?.attributes?.profile?.id ?? null,
        email: e?.attributes?.profile?.email ?? null,
        list_id: e?.attributes?.list?.id ?? null,
        connector_id: matched.connectorId,
        body: e,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });
    if (error && error.code !== '23505') { logger.warn('klaviyo persist failed', { error: error.message }); continue; }
    if (error?.code !== '23505') {
      try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'klaviyo' }, { tenantId: matched.tenantId }); }
      catch (err) { logger.warn('klaviyo enqueue failed', { error: String(err) }); }
    }
  }
  return res.status(200).end();
});
