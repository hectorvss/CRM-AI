/**
 * server/webhooks/docusign.ts
 *
 * DocuSign Connect webhooks. Header `X-DocuSign-Signature-1` = base64
 * HMAC SHA256 of raw body keyed with the HMAC secret configured per
 * Connect config. We verify with `DOCUSIGN_HMAC_SECRET` (app-level).
 * Body is JSON; account ID lives at `data.accountId`.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/docusign-oauth.js';
import { findDocuSignTenantsByAccount } from '../integrations/docusign-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const docusignWebhookRouter = Router();

docusignWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('X-DocuSign-Signature-1') || '');
  const rawBody = (req as any).rawBody as string | undefined;
  const secret = process.env.DOCUSIGN_HMAC_SECRET || '';
  if (!secret) { logger.error('docusign webhook: DOCUSIGN_HMAC_SECRET not configured'); return res.status(503).end(); }
  if (!signature || !rawBody) return res.status(401).end();

  if (!verifyWebhookSignature({ rawBody, signature, secret })) {
    logger.warn('docusign webhook: signature mismatch');
    return res.status(401).end();
  }

  let event: any; try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  const eventType = String(event?.event ?? 'unknown');
  const data = event?.data ?? {};
  const accountId = String(data?.accountId ?? '');
  const envelopeId = String(data?.envelopeId ?? '');
  const tenants = await findDocuSignTenantsByAccount(accountId);
  if (tenants.length === 0) return res.status(200).end();

  const supabase = getSupabaseAdmin();
  for (const t of tenants) {
    const externalId = `docusign::${t.connectorId}::${envelopeId}::${eventType}`;
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: t.tenantId,
      source_system: 'docusign',
      event_type: `docusign.${eventType}`,
      raw_payload: {
        event: eventType,
        account_id: accountId, envelope_id: envelopeId,
        envelope_status: data?.envelopeSummary?.status ?? null,
        email_subject: data?.envelopeSummary?.emailSubject ?? null,
        sent_date: data?.envelopeSummary?.sentDateTime ?? null,
        completed_date: data?.envelopeSummary?.completedDateTime ?? null,
        connector_id: t.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });
    if (error && error.code !== '23505') { logger.warn('docusign persist failed', { error: error.message }); continue; }
    if (error?.code !== '23505') {
      try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'docusign' }, { tenantId: t.tenantId }); }
      catch (err) { logger.warn('docusign enqueue failed', { error: String(err) }); }
    }
  }
  return res.status(200).end();
});
