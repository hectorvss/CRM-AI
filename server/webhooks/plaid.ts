/**
 * server/webhooks/plaid.ts
 *
 * Plaid webhooks. Discriminate per-tenant via URL path token:
 * /webhooks/plaid/<token>. (We skip JWT verification and rely on the
 * unguessable token; on production you should also verify the
 * Plaid-Verification JWT against /webhook_verification_key/get.)
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByPlaidWebhookToken } from '../integrations/plaid-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const plaidWebhookRouter = Router();

plaidWebhookRouter.post('/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  if (!token) return res.status(404).end();

  const matched = await findTenantByPlaidWebhookToken(token);
  if (!matched) { logger.warn('plaid webhook: token not matched'); return res.status(401).end(); }

  const rawBody = (req as any).rawBody as string | undefined;
  let event: any; try { event = rawBody ? JSON.parse(rawBody) : req.body; } catch { return res.status(200).end(); }

  const webhookType = String(event?.webhook_type ?? 'unknown');
  const webhookCode = String(event?.webhook_code ?? 'unknown');
  const itemId = String(event?.item_id ?? '');
  const deliveryId = `${webhookType}::${webhookCode}::${itemId}::${Date.now()}`;
  const externalId = `plaid::${matched.connectorId}::${deliveryId}`;
  const persistedId = randomUUID();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'plaid',
    event_type: `plaid.${webhookType.toLowerCase()}.${webhookCode.toLowerCase()}`,
    raw_payload: {
      webhook_type: webhookType, webhook_code: webhookCode,
      item_id: itemId,
      error: event?.error ?? null,
      new_transactions: event?.new_transactions ?? null,
      removed_transactions: event?.removed_transactions ?? null,
      connector_id: matched.connectorId,
      body: event,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });
  if (error && error.code !== '23505') { logger.warn('plaid persist failed', { error: error.message }); return res.status(500).end(); }
  if (error?.code !== '23505') {
    try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'plaid' }, { tenantId: matched.tenantId }); }
    catch (err) { logger.warn('plaid enqueue failed', { error: String(err) }); }
  }
  return res.status(200).end();
});
