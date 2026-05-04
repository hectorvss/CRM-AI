/**
 * server/webhooks/asana.ts
 *
 * Asana webhook handler.
 *
 * Two flows:
 *   1) Handshake: first POST contains `X-Hook-Secret`. We MUST echo it
 *      in the response header AND remember it (paired with the resource).
 *   2) Subsequent: signed with `X-Hook-Signature` = hex HMAC SHA256 of
 *      raw body keyed with the secret from step 1.
 *
 * Because we don't get the webhook gid in headers, we identify the
 * connector by trying every secret of every connected Asana connector.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/asana-oauth.js';
import { findAsanaTenantBySignature } from '../integrations/asana-tenant.js';
import { getPendingHandshake, deletePendingHandshake } from '../routes/asanaOAuth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const asanaWebhookRouter = Router();

asanaWebhookRouter.post('/', async (req: Request, res: Response) => {
  const hookSecret = req.header('X-Hook-Secret');
  const signature = String(req.header('X-Hook-Signature') || '');

  // ── Handshake ───────────────────────────────────────────────────────────────
  if (hookSecret) {
    // Reconstruct our own URL so we can find the pending handshake
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.headers.host;
    const targetUrl = `${proto}://${host}${req.originalUrl}`;
    const pending = getPendingHandshake(targetUrl);

    if (pending) {
      const entry = {
        webhook_gid: '', // filled by caller from createWebhook response
        resource_gid: pending.resourceGid,
        resource_type: pending.resourceType,
        secret: hookSecret,
        target: targetUrl,
      };
      pending.resolve(entry);
      deletePendingHandshake(targetUrl);
    } else {
      logger.warn('asana webhook: handshake without pending registration', { targetUrl });
    }

    res.setHeader('X-Hook-Secret', hookSecret);
    return res.status(204).end();
  }

  // ── Regular delivery ───────────────────────────────────────────────────────
  if (!signature) { logger.warn('asana webhook: missing signature'); return res.status(401).end(); }
  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) { logger.warn('asana webhook: no raw body'); return res.status(400).end(); }

  const matched = await findAsanaTenantBySignature((secret) => Boolean(secret) && verifyWebhookSignature({ rawBody, signature, secret }));
  if (!matched) { logger.warn('asana webhook: signature mismatch'); return res.status(401).end(); }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  const events: any[] = Array.isArray(event?.events) ? event.events : [];
  const supabase = getSupabaseAdmin();

  for (const e of events) {
    const action = String(e?.action ?? 'unknown');
    const resource = e?.resource ?? {};
    const deliveryId = String(e?.created_at ?? '') + ':' + (resource?.gid ?? randomUUID());
    const externalId = `asana::${matched.connectorId}::${deliveryId}`;
    const persistedId = randomUUID();

    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: matched.tenantId,
      source_system: 'asana',
      event_type: `asana.${resource?.resource_type ?? 'unknown'}.${action}`,
      raw_payload: {
        action, resource_type: resource?.resource_type,
        resource_gid: resource?.gid ?? null,
        resource_subtype: resource?.resource_subtype ?? null,
        parent_gid: e?.parent?.gid ?? null,
        user_gid: e?.user?.gid ?? null,
        change_field: e?.change?.field ?? null,
        created_at: e?.created_at ?? null,
        webhook_resource_gid: matched.webhook.resource_gid,
        connector_id: matched.connectorId,
        body: e,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') { logger.warn('asana persist failed', { error: error.message }); continue; }
    if (error?.code !== '23505') {
      try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'asana' }, { tenantId: matched.tenantId }); }
      catch (err) { logger.warn('asana enqueue failed', { error: String(err) }); }
    }
  }

  return res.status(200).end();
});
