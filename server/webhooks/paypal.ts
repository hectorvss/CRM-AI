/**
 * server/webhooks/paypal.ts
 *
 * Inbound PayPal webhook handler. Multi-tenant from day one — each
 * merchant has their own webhook id, so we resolve tenant by matching
 * the request's `paypal-auth-version` + `webhook_id` claim, then ask
 * PayPal's verify-signature API whether the request is authentic.
 *
 * Headers PayPal sends (lowercased by Express):
 *   paypal-transmission-id     unique id of this delivery
 *   paypal-transmission-time   ISO timestamp
 *   paypal-transmission-sig    base64 signature
 *   paypal-cert-url            URL to PayPal's signing cert
 *   paypal-auth-algo           e.g. SHA256withRSA
 *   paypal-auth-version        always 2.0 currently
 *
 * The body is JSON (PayPal does not URL-encode webhooks, unlike Twilio).
 *
 * Strategy:
 *  1. Parse the raw body to find `id` of the event + the resource type.
 *  2. Look up which connector's `webhook_id` matches via `event.id` is
 *     NOT enough — we need to match on the request URL ownership. The
 *     simplest correct approach: try every connected PayPal connector
 *     until one's webhook_id verifies. Fast in practice (most tenants
 *     have at most one PayPal connector).
 *  3. Once verified, persist the raw event in `webhook_events` and
 *     enqueue the canonicalizer.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { PayPalAdapter } from '../integrations/paypal.js';
import { paypalForTenant } from '../integrations/paypal-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { fetchAccessToken, type PayPalMode } from '../integrations/paypal-oauth.js';

export const paypalWebhookRouter = Router();

paypalWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer).toString('utf8');
    const headers = req.headers as Record<string, string>;

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      logger.warn('paypal webhook: malformed JSON');
      return res.status(202).end();
    }

    const transmissionId = headers['paypal-transmission-id'];
    const transmissionTime = headers['paypal-transmission-time'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const certUrl = headers['paypal-cert-url'];
    const authAlgo = headers['paypal-auth-algo'];

    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      logger.warn('paypal webhook: missing signature headers');
      return res.status(401).end();
    }

    // Find the right connector by trying each connected one's webhook_id
    // against PayPal's verify endpoint. Most tenants have ≤1 PayPal app,
    // so this is near-O(1) in practice.
    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'paypal')
      .eq('status', 'connected');

    let matched: { tenantId: string; connectorId: string; mode: PayPalMode } | null = null;

    for (const row of (rows ?? []) as Array<{ id: string; tenant_id: string; auth_config: any }>) {
      const cfg = row.auth_config ?? {};
      const webhookId = cfg.webhook_id as string | undefined;
      const clientId = cfg.client_id as string | undefined;
      const clientSecret = cfg.client_secret as string | undefined;
      const mode: PayPalMode = cfg.mode === 'live' ? 'live' : 'sandbox';
      if (!webhookId || !clientId || !clientSecret) continue;

      // Cheap pre-filter: if PayPal mode mismatches the cert URL host,
      // skip without round-tripping. Sandbox cert URLs are on api.sandbox.paypal.com.
      if (mode === 'sandbox' && !certUrl.includes('sandbox')) continue;
      if (mode === 'live' && certUrl.includes('sandbox')) continue;

      try {
        // Use a freshly-minted token for verification — the per-tenant
        // resolver caches but for webhook hot path we pay one OAuth call.
        // PayPal returns 200 + verification_status either way, so a wrong
        // webhook_id just yields FAILURE without an error.
        const token = (cfg.access_token && cfg.expires_at && new Date(cfg.expires_at).getTime() - Date.now() > 60_000)
          ? cfg.access_token as string
          : (await fetchAccessToken({ clientId, clientSecret, mode })).accessToken;

        const adapter = new PayPalAdapter(token, mode);
        const ok = await adapter.verifyWebhookSignature({
          webhookId,
          transmissionId,
          transmissionTime,
          certUrl,
          authAlgo,
          transmissionSig,
          rawBody,
        });
        if (ok) {
          matched = { tenantId: row.tenant_id, connectorId: row.id, mode };
          break;
        }
      } catch (err) {
        logger.debug('paypal verify attempt failed', { connector: row.id, error: String(err) });
      }
    }

    if (!matched) {
      logger.warn('paypal webhook: no connector verified the signature', {
        transmissionId,
        eventType: body?.event_type,
      });
      // 401 so PayPal retries — could be a race with a freshly-rotated
      // webhook_id. PayPal retries up to 25 times over 3 days.
      return res.status(401).end();
    }

    // Idempotency: PayPal retries on non-2xx, so use transmission_id as
    // dedupe key. Same delivery hits us again → 23505 unique violation
    // → 200 quietly.
    const eventId = randomUUID();
    const { error: insertError } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: matched.tenantId,
      source_system: 'paypal',
      event_type: String(body?.event_type ?? 'unknown'),
      raw_payload: {
        transmission_id: transmissionId,
        paypal_event_id: body?.id,
        event_type: body?.event_type,
        resource_type: body?.resource_type,
        resource: body?.resource,
        summary: body?.summary,
        create_time: body?.create_time,
        connector_id: matched.connectorId,
        mode: matched.mode,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: `paypal::${transmissionId}`,
    });

    if (insertError && insertError.code !== '23505') {
      logger.warn('paypal ingest: webhook_events insert failed', { error: insertError.message });
      // 500 so PayPal retries.
      return res.status(500).end();
    }

    // Enqueue for canonicalization. Duplicate key → already enqueued.
    if (insertError?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'paypal',
        }, { tenantId: matched.tenantId });
      } catch (err) {
        logger.warn('paypal ingest: enqueue failed', { error: String(err) });
      }
    }

    // 200 OK is what PayPal expects on success.
    return res.status(200).end();
  },
);
