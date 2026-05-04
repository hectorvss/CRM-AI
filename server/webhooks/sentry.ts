/**
 * server/webhooks/sentry.ts
 *
 * Sentry Integration Platform webhooks. Header `Sentry-Hook-Signature` =
 * hex HMAC SHA256 of raw body keyed with the integration's client_secret.
 * Body includes `installation.uuid` to identify the source.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/sentry-oauth.js';
import { findSentryTenantsByInstallation } from '../integrations/sentry-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const sentryWebhookRouter = Router();

sentryWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('Sentry-Hook-Signature') || '');
  const rawBody = (req as any).rawBody as string | undefined;
  const clientSecret = process.env.SENTRY_CLIENT_SECRET || '';
  if (!clientSecret) { logger.error('sentry webhook: SENTRY_CLIENT_SECRET not configured'); return res.status(503).end(); }
  if (!signature || !rawBody) return res.status(401).end();
  if (!verifyWebhookSignature({ rawBody, signature, clientSecret })) {
    logger.warn('sentry webhook: signature mismatch');
    return res.status(401).end();
  }

  let event: any; try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  const resourceType = String(req.header('Sentry-Hook-Resource') || (event?.action ?? 'unknown'));
  const installationId = String(event?.installation?.uuid ?? '');
  const tenants = await findSentryTenantsByInstallation(installationId);
  if (tenants.length === 0) return res.status(200).end();

  const data = event?.data ?? {};
  const issue = data?.issue ?? {};
  const errorEvent = data?.event ?? {};
  const deliveryId = String(req.header('Sentry-Hook-Resource') || '') + ':' + String(issue?.id ?? errorEvent?.event_id ?? randomUUID());

  const supabase = getSupabaseAdmin();
  for (const t of tenants) {
    const externalId = `sentry::${t.connectorId}::${deliveryId}`;
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: t.tenantId,
      source_system: 'sentry',
      event_type: `sentry.${resourceType}.${event?.action ?? 'unknown'}`,
      raw_payload: {
        action: event?.action ?? null, resource: resourceType,
        installation_id: installationId,
        actor: event?.actor ?? null,
        issue_id: issue?.id ?? null, issue_short_id: issue?.shortId ?? null,
        issue_title: issue?.title ?? null, issue_level: issue?.level ?? null,
        issue_status: issue?.status ?? null, issue_permalink: issue?.permalink ?? null,
        project_slug: issue?.project?.slug ?? null,
        event_id: errorEvent?.event_id ?? null,
        connector_id: t.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });
    if (error && error.code !== '23505') { logger.warn('sentry persist failed', { error: error.message }); continue; }
    if (error?.code !== '23505') {
      try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'sentry' }, { tenantId: t.tenantId }); }
      catch (err) { logger.warn('sentry enqueue failed', { error: String(err) }); }
    }
  }
  return res.status(200).end();
});
