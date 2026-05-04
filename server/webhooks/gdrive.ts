/**
 * server/webhooks/gdrive.ts
 *
 * Google Drive push notification handler. Same channel/token mechanism as
 * Calendar; the body is empty and the actual changes are fetched via
 * `changes.list` using the stored page token.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByGDriveChannelToken } from '../integrations/gdrive-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const gdriveWebhookRouter = Router();

gdriveWebhookRouter.post('/', async (req: Request, res: Response) => {
  const channelId = String(req.header('X-Goog-Channel-ID') || '');
  const token = String(req.header('X-Goog-Channel-Token') || '');
  const resourceId = String(req.header('X-Goog-Resource-ID') || '');
  const resourceState = String(req.header('X-Goog-Resource-State') || '');
  const messageNumber = String(req.header('X-Goog-Message-Number') || '');

  if (!channelId || !token) { logger.warn('gdrive webhook: missing channel headers'); return res.status(401).end(); }

  const matched = await findTenantByGDriveChannelToken(token);
  if (!matched) { logger.warn('gdrive webhook: channel token not matched'); return res.status(401).end(); }

  if (resourceState === 'sync') return res.status(200).end();

  const externalId = `gdrive::${matched.connectorId}::${channelId}::${messageNumber || randomUUID()}`;
  const persistedId = randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'gdrive',
    event_type: `gdrive.${resourceState}`,
    raw_payload: {
      channel_id: channelId, resource_id: resourceId, resource_state: resourceState, message_number: messageNumber,
      page_token: matched.channel.page_token, connector_id: matched.connectorId,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });

  if (error && error.code !== '23505') { logger.warn('gdrive persist failed', { error: error.message }); return res.status(500).end(); }

  if (error?.code !== '23505') {
    try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'gdrive', rawBody: '', headers: {} }, { tenantId: matched.tenantId }); }
    catch (err) { logger.warn('gdrive enqueue failed', { error: String(err) }); }
  }
  return res.status(200).end();
});
