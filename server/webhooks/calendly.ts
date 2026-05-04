/**
 * server/webhooks/calendly.ts
 *
 * Calendly v2 webhook handler. Each delivery has:
 *   - Calendly-Webhook-Signature: t=<unix>,v1=<hex>
 *   - body: { event: 'invitee.created'|..., created_at, payload: {...} }
 *
 * The signing key is per-subscription. We persist it on the connector
 * row and iterate active connectors to find the matching key.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/calendly-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const calendlyWebhookRouter = Router();

calendlyWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const header = String(req.header('Calendly-Webhook-Signature') || '');
    if (!header) {
      logger.warn('calendly webhook: missing signature header');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');

    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'calendly')
      .eq('status', 'connected');

    let matched: { tenantId: string; connectorId: string } | null = null;
    for (const row of rows ?? []) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const signingKey = typeof cfg.webhook_signing_key === 'string' ? cfg.webhook_signing_key : '';
      if (!signingKey) continue;
      if (verifyWebhookSignature({ rawBody, header, signingKey })) {
        matched = { tenantId: String(row.tenant_id), connectorId: String(row.id) };
        break;
      }
    }
    if (!matched) {
      logger.warn('calendly webhook: no connector signature matched');
      return res.status(401).end();
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const eventType = String(event?.event ?? 'unknown');
    const inviteeUri = event?.payload?.uri ?? null;
    const externalId = `calendly::${matched.connectorId}::${eventType}::${inviteeUri ?? randomUUID()}`;

    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: matched.tenantId,
      source_system: 'calendly',
      event_type: `calendly.${eventType.replace(/\W+/g, '.').toLowerCase()}`,
      raw_payload: {
        event_type: eventType,
        created_at: event?.created_at ?? null,
        invitee_uri: inviteeUri,
        invitee_email: event?.payload?.email ?? null,
        invitee_name: event?.payload?.name ?? null,
        scheduled_event_uri: event?.payload?.scheduled_event?.uri ?? null,
        scheduled_event_start: event?.payload?.scheduled_event?.start_time ?? null,
        scheduled_event_end: event?.payload?.scheduled_event?.end_time ?? null,
        status: event?.payload?.status ?? null,
        cancellation: event?.payload?.cancellation ?? null,
        connector_id: matched.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('calendly persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: persistedId,
          source: 'calendly',
        }, { tenantId: matched.tenantId });
      } catch (err) {
        logger.warn('calendly enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
