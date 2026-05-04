/**
 * server/webhooks/teams.ts
 *
 * Microsoft Graph webhook handler for Teams. Two flows:
 *
 *  1. **URL validation handshake**: when we POST a subscription, Graph
 *     immediately calls the notificationUrl with `?validationToken=...`
 *     and expects a 200 plain-text response containing exactly that
 *     token. We service this synchronously.
 *
 *  2. **Real notifications**: POST body shape:
 *       { value: [
 *         { subscriptionId, clientState, changeType, resource,
 *           resourceData: { id, ... }, tenantId, ... }
 *       ] }
 *     `clientState` is our per-subscription secret — we use it to
 *     reverse-look up the connector + tenant.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByTeamsClientState } from '../integrations/teams-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const teamsWebhookRouter = Router();

teamsWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    // 1) URL validation handshake — Graph appends ?validationToken=...
    //    when creating or renewing a subscription. Echo it back as
    //    text/plain within 10s.
    const validationToken = typeof req.query.validationToken === 'string' ? req.query.validationToken : null;
    if (validationToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(validationToken);
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    let envelope: any;
    try { envelope = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const items: any[] = Array.isArray(envelope?.value) ? envelope.value : [];
    if (items.length === 0) return res.status(202).end();

    const supabase = getSupabaseAdmin();
    for (const item of items) {
      const clientState = String(item?.clientState ?? '');
      const tenantInfo = await findTenantByTeamsClientState(clientState);
      if (!tenantInfo) {
        logger.warn('teams webhook: clientState does not match any subscription', { clientState: clientState.slice(0, 8) });
        continue;
      }

      const subscriptionId = String(item?.subscriptionId ?? '');
      const changeType = String(item?.changeType ?? 'unknown');
      const resource = String(item?.resource ?? '');
      const resourceData = item?.resourceData ?? null;
      const externalId = `teams::${subscriptionId}::${changeType}::${resourceData?.id ?? randomUUID()}`;

      const persistedId = randomUUID();
      const { error } = await supabase.from('webhook_events').insert({
        id: persistedId,
        tenant_id: tenantInfo.tenantId,
        source_system: 'teams',
        event_type: `teams.${changeType.toLowerCase()}`,
        raw_payload: {
          subscription_id: subscriptionId,
          change_type: changeType,
          resource,
          resource_data_id: resourceData?.id ?? null,
          resource_data_type: resourceData?.['@odata.type'] ?? null,
          tenant_id_msft: item?.tenantId ?? null,
          subscription_expires: item?.subscriptionExpirationDateTime ?? null,
          connector_id: tenantInfo.connectorId,
          body: item,
        },
        received_at: new Date().toISOString(),
        status: 'received',
        dedupe_key: externalId,
      });

      if (error && error.code !== '23505') {
        logger.warn('teams persist failed', { error: error.message });
        continue;
      }
      if (error?.code !== '23505') {
        try {
          await enqueue(JobType.WEBHOOK_PROCESS, {
            webhookEventId: persistedId,
            source: 'teams',
          }, { tenantId: tenantInfo.tenantId });
        } catch (err) {
          logger.warn('teams enqueue failed', { error: String(err) });
        }
      }
    }

    // Microsoft Graph wants a 202 Accepted within 30s on every notification.
    return res.status(202).end();
  },
);
