/**
 * server/webhooks/mailchimp.ts
 *
 * Mailchimp webhook handler.
 *
 * Mailchimp webhooks are not signed; we discriminate per-tenant by URL
 * path token: `/webhooks/mailchimp/<token>`. Mailchimp also performs a
 * GET handshake on the URL when registering the webhook — we respond
 * 200 OK to that.
 *
 * Bodies are application/x-www-form-urlencoded with keys like
 * `type`, `fired_at`, `data[email]`, etc. Express's raw body capture
 * gives us the URL-encoded string; we parse it here.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByMailchimpToken } from '../integrations/mailchimp-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const mailchimpWebhookRouter = Router();

mailchimpWebhookRouter.get('/:token', async (_req: Request, res: Response) => {
  // Mailchimp handshake — just respond OK
  return res.status(200).end();
});

mailchimpWebhookRouter.post('/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  if (!token) return res.status(404).end();

  const matched = await findTenantByMailchimpToken(token);
  if (!matched) { logger.warn('mailchimp webhook: token not matched'); return res.status(401).end(); }

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) return res.status(200).end();

  // Parse URL-encoded body
  const params = new URLSearchParams(rawBody);
  const flat: Record<string, string> = {};
  params.forEach((v, k) => { flat[k] = v; });

  const eventType = String(flat['type'] ?? 'unknown');
  const firedAt = flat['fired_at'] ?? null;
  const email = flat['data[email]'] ?? flat['data[new_email]'] ?? null;
  const listId = flat['data[list_id]'] ?? null;
  const deliveryId = `${eventType}:${firedAt ?? ''}:${email ?? randomUUID()}`;
  const externalId = `mailchimp::${matched.connectorId}::${deliveryId}`;

  const persistedId = randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'mailchimp',
    event_type: `mailchimp.${eventType}`,
    raw_payload: {
      type: eventType, fired_at: firedAt,
      email, list_id: listId,
      reason: flat['data[reason]'] ?? null,
      old_email: flat['data[old_email]'] ?? null,
      new_email: flat['data[new_email]'] ?? null,
      campaign_id: flat['data[id]'] ?? null,
      subject: flat['data[subject]'] ?? null,
      connector_id: matched.connectorId,
      flat,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });
  if (error && error.code !== '23505') { logger.warn('mailchimp persist failed', { error: error.message }); return res.status(500).end(); }
  if (error?.code !== '23505') {
    try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'mailchimp' }, { tenantId: matched.tenantId }); }
    catch (err) { logger.warn('mailchimp enqueue failed', { error: String(err) }); }
  }
  return res.status(200).end();
});
