/**
 * server/webhooks/quickbooks.ts
 *
 * Header `intuit-signature` = base64 HMAC SHA256 of raw body keyed with the
 * Verifier Token (from Intuit Developer Dashboard). Body is a notification
 * envelope with eventNotifications[].dataChangeEvent.entities[].
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/quickbooks-oauth.js';
import { findQuickBooksTenantsByRealm } from '../integrations/quickbooks-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const quickbooksWebhookRouter = Router();

quickbooksWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('intuit-signature') || '');
  const rawBody = (req as any).rawBody as string | undefined;
  const verifierToken = process.env.QUICKBOOKS_VERIFIER_TOKEN || '';
  if (!verifierToken) { logger.error('quickbooks webhook: QUICKBOOKS_VERIFIER_TOKEN not configured'); return res.status(503).end(); }
  if (!signature || !rawBody) return res.status(401).end();

  if (!verifyWebhookSignature({ rawBody, signature, verifierToken })) {
    logger.warn('quickbooks webhook: signature mismatch');
    return res.status(401).end();
  }

  let event: any; try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }
  const notifications: any[] = Array.isArray(event?.eventNotifications) ? event.eventNotifications : [];

  const supabase = getSupabaseAdmin();
  for (const n of notifications) {
    const realmId = String(n?.realmId ?? '');
    const entities: any[] = n?.dataChangeEvent?.entities ?? [];
    const tenants = await findQuickBooksTenantsByRealm(realmId);
    if (tenants.length === 0) continue;

    for (const ent of entities) {
      const operation = String(ent?.operation ?? 'unknown'); // Create | Update | Delete | Merge | Void | Emailed
      const entityType = String(ent?.name ?? 'unknown');
      const entityId = String(ent?.id ?? '');
      const lastUpdated = String(ent?.lastUpdated ?? '');
      const deliveryId = `${realmId}::${entityType}::${entityId}::${lastUpdated}`;

      for (const t of tenants) {
        const externalId = `quickbooks::${t.connectorId}::${deliveryId}`;
        const persistedId = randomUUID();
        const { error } = await supabase.from('webhook_events').insert({
          id: persistedId,
          tenant_id: t.tenantId,
          source_system: 'quickbooks',
          event_type: `quickbooks.${entityType.toLowerCase()}.${operation.toLowerCase()}`,
          raw_payload: {
            realm_id: realmId, entity_type: entityType, entity_id: entityId, operation,
            last_updated: lastUpdated, connector_id: t.connectorId, body: ent,
          },
          received_at: new Date().toISOString(),
          status: 'received',
          dedupe_key: externalId,
        });
        if (error && error.code !== '23505') { logger.warn('quickbooks persist failed', { error: error.message }); continue; }
        if (error?.code !== '23505') {
          try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'quickbooks' }, { tenantId: t.tenantId }); }
          catch (err) { logger.warn('quickbooks enqueue failed', { error: String(err) }); }
        }
      }
    }
  }
  return res.status(200).end();
});
