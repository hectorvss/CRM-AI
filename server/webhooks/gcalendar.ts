/**
 * server/webhooks/gcalendar.ts
 *
 * Google Calendar push notification handler.
 *
 * Google sends a small payload (mostly empty) with these headers:
 *   X-Goog-Channel-ID:        the channel id we set at watch
 *   X-Goog-Channel-Token:     the per-channel token we set at watch
 *   X-Goog-Resource-ID:       opaque resource id
 *   X-Goog-Resource-State:    sync | exists | not_exists
 *   X-Goog-Resource-URI:      pointer back to the resource
 *   X-Goog-Message-Number:    sequence number
 *
 * The "what changed" is NOT included in the body. The handler stores the
 * notification with the channel/token, and a downstream worker is
 * expected to call `events.list` with `syncToken` to fetch deltas.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByGCalChannelToken } from '../integrations/gcalendar-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const gcalendarWebhookRouter = Router();

gcalendarWebhookRouter.post('/', async (req: Request, res: Response) => {
  const channelId = String(req.header('X-Goog-Channel-ID') || '');
  const token = String(req.header('X-Goog-Channel-Token') || '');
  const resourceId = String(req.header('X-Goog-Resource-ID') || '');
  const resourceState = String(req.header('X-Goog-Resource-State') || '');
  const messageNumber = String(req.header('X-Goog-Message-Number') || '');

  if (!channelId || !token) {
    logger.warn('gcalendar webhook: missing channel headers');
    return res.status(401).end();
  }

  const matched = await findTenantByGCalChannelToken(token);
  if (!matched) {
    logger.warn('gcalendar webhook: channel token not matched');
    return res.status(401).end();
  }

  // Sync messages: ack and move on (no delta to process yet)
  if (resourceState === 'sync') return res.status(200).end();

  const externalId = `gcalendar::${matched.connectorId}::${channelId}::${messageNumber || randomUUID()}`;
  const persistedId = randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'gcalendar',
    event_type: `gcalendar.${resourceState}`,
    raw_payload: {
      channel_id: channelId,
      resource_id: resourceId,
      resource_state: resourceState,
      message_number: messageNumber,
      calendar_id: matched.channel.calendar_id,
      connector_id: matched.connectorId,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });

  if (error && error.code !== '23505') {
    logger.warn('gcalendar persist failed', { error: error.message });
    return res.status(500).end();
  }

  if (error?.code !== '23505') {
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'gcalendar', rawBody: '', headers: {} }, { tenantId: matched.tenantId });
    } catch (err) { logger.warn('gcalendar enqueue failed', { error: String(err) }); }
  }

  return res.status(200).end();
});
