/**
 * server/webhooks/zendesk.ts
 *
 * Zendesk webhook handler. Headers used:
 *   - X-Zendesk-Webhook-Id: stable per-webhook id from the Zendesk admin
 *   - X-Zendesk-Webhook-Signature: base64(HMAC-SHA256(timestamp + body, secret))
 *   - X-Zendesk-Webhook-Signature-Timestamp: ISO 8601
 *
 * The signing secret is unique per webhook, generated when we created the
 * webhook from the OAuth callback. We persisted it on `connectors.auth_config.webhook_secret`
 * so we can reverse-look up the tenant and verify the signature in one step.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByZendeskWebhookSecret } from '../integrations/zendesk-tenant.js';
import { verifyWebhookSignature } from '../integrations/zendesk-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { getSupabaseAdmin as _admin } from '../db/supabase.js';

export const zendeskWebhookRouter = Router();

zendeskWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const signature = String(req.header('X-Zendesk-Webhook-Signature') || '');
    const timestamp = String(req.header('X-Zendesk-Webhook-Signature-Timestamp') || '');
    if (!signature || !timestamp) {
      logger.warn('zendesk webhook: missing signature/timestamp');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');

    // We can't know the tenant without trying every connector's secret.
    // Iterate active Zendesk connectors and check if any signature matches.
    // (Cheaper than parsing the body to extract subdomain because Zendesk
    // doesn't include it on every event type.)
    const supabase = _admin();
    const { data: rows } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'zendesk')
      .eq('status', 'connected');

    let matched: { tenantId: string; connectorId: string; subdomain: string } | null = null;
    for (const row of rows ?? []) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const secret = typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : '';
      if (!secret) continue;
      if (verifyWebhookSignature({ rawBody, signature, timestamp, secret })) {
        matched = {
          tenantId: String(row.tenant_id),
          connectorId: String(row.id),
          subdomain: typeof cfg.subdomain === 'string' ? cfg.subdomain : '',
        };
        break;
      }
    }
    if (!matched) {
      logger.warn('zendesk webhook: no connector signature matched');
      return res.status(401).end();
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const eventType = String(event?.type ?? event?.event?.type ?? 'unknown');
    const accountSubdomain = matched.subdomain;
    const externalId = `zendesk::${accountSubdomain}::${event?.id ?? `${eventType}::${event?.detail?.id ?? ''}::${timestamp}`}`;

    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: matched.tenantId,
      source_system: 'zendesk',
      event_type: `zendesk.${eventType.replace(/\W+/g, '.').toLowerCase()}`,
      raw_payload: {
        subdomain: accountSubdomain,
        zendesk_event_id: event?.id ?? null,
        type: eventType,
        time: event?.time ?? null,
        account_id: event?.account_id ?? null,
        zendesk_event_version: event?.zendesk_event_version ?? null,
        subject: event?.subject ?? null,
        detail: event?.detail ?? null,
        event: event?.event ?? null,
        connector_id: matched.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('zendesk persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'zendesk',
        }, { tenantId: matched.tenantId });
      } catch (err) {
        logger.warn('zendesk enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
