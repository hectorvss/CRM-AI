/**
 * server/webhooks/pipedrive.ts
 *
 * Pipedrive webhook handler. Authenticated via HTTP Basic auth using the
 * per-tenant credentials we set when creating the webhook.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyBasicAuth } from '../integrations/pipedrive-oauth.js';
import { findPipedriveTenantByBasicCreds } from '../integrations/pipedrive-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const pipedriveWebhookRouter = Router();

pipedriveWebhookRouter.post('/', async (req: Request, res: Response) => {
  const authHeader = String(req.header('authorization') || '');
  if (!authHeader.startsWith('Basic ')) { logger.warn('pipedrive webhook: missing Basic auth'); return res.status(401).end(); }

  const matched = await findPipedriveTenantByBasicCreds((u, p) => verifyBasicAuth(authHeader, { user: u, pass: p }));
  if (!matched) { logger.warn('pipedrive webhook: no tenant matched Basic creds'); return res.status(401).end(); }

  const rawBody = (req as any).rawBody as string | undefined;
  let event: any;
  try { event = rawBody ? JSON.parse(rawBody) : req.body; } catch { return res.status(200).end(); }

  const meta = event?.meta ?? {};
  const eventName = `${meta?.action ?? 'unknown'}.${meta?.object ?? 'unknown'}`;
  const objectId = meta?.id ?? event?.current?.id ?? null;
  const deliveryId = String(meta?.timestamp ?? '') + ':' + String(meta?.id ?? randomUUID());
  const externalId = `pipedrive::${matched.connectorId}::${deliveryId}`;

  const persistedId = randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'pipedrive',
    event_type: `pipedrive.${eventName}`,
    raw_payload: {
      action: meta?.action ?? null, object: meta?.object ?? null,
      object_id: objectId,
      company_id: meta?.company_id ?? null,
      user_id: meta?.user_id ?? null,
      // Quick-access fields
      deal_id: meta?.object === 'deal' ? objectId : (event?.current?.deal_id ?? null),
      person_id: meta?.object === 'person' ? objectId : (event?.current?.person_id?.value ?? null),
      org_id: meta?.object === 'organization' ? objectId : null,
      title: event?.current?.title ?? null,
      status: event?.current?.status ?? null,
      stage_id: event?.current?.stage_id ?? null,
      value: event?.current?.value ?? null,
      currency: event?.current?.currency ?? null,
      timestamp: meta?.timestamp ?? null,
      connector_id: matched.connectorId,
      body: event,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });
  if (error && error.code !== '23505') { logger.warn('pipedrive persist failed', { error: error.message }); return res.status(500).end(); }
  if (error?.code !== '23505') {
    try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'pipedrive', rawBody: '', headers: {} }, { tenantId: matched.tenantId }); }
    catch (err) { logger.warn('pipedrive enqueue failed', { error: String(err) }); }
  }
  return res.status(200).end();
});
