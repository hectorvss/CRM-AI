/**
 * server/webhooks/jira.ts
 *
 * Jira webhook handler.
 *
 * Jira's OAuth 3LO flow does NOT issue a per-app signing secret, so we use a
 * URL-path token as a per-connector discriminator. The webhook is registered
 * with a callback URL of /webhooks/jira/<token>; we look up the connector by
 * that token here. The token is 24 random bytes (base64url) — equivalent
 * confidentiality to an HMAC secret, just embedded in the URL.
 *
 * Body envelope: { webhookEvent, issue?, comment?, user?, timestamp, ... }
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByJiraWebhookToken } from '../integrations/jira-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const jiraWebhookRouter = Router();

jiraWebhookRouter.post('/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token || '');
  if (!token) return res.status(404).end();

  const matched = await findTenantByJiraWebhookToken(token);
  if (!matched) {
    logger.warn('jira webhook: token not matched');
    return res.status(401).end();
  }

  const rawBody = (req as any).rawBody as string | undefined;
  let event: any;
  try { event = rawBody ? JSON.parse(rawBody) : req.body; }
  catch { return res.status(200).end(); }

  const webhookEvent = String(event?.webhookEvent ?? 'unknown');
  const issue = event?.issue ?? null;
  const comment = event?.comment ?? null;
  const deliveryId = String(event?.timestamp ?? '') + ':' + (issue?.id ?? comment?.id ?? randomUUID());
  const externalId = `jira::${matched.connectorId}::${deliveryId}`;

  const persistedId = randomUUID();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'jira',
    event_type: webhookEvent,
    raw_payload: {
      webhook_event: webhookEvent,
      cloud_id: matched.cloudId,
      // Quick-access fields
      issue_id: issue?.id ?? null,
      issue_key: issue?.key ?? null,
      project_key: issue?.fields?.project?.key ?? null,
      summary: issue?.fields?.summary ?? null,
      status: issue?.fields?.status?.name ?? null,
      priority: issue?.fields?.priority?.name ?? null,
      assignee_account_id: issue?.fields?.assignee?.accountId ?? null,
      reporter_account_id: issue?.fields?.reporter?.accountId ?? null,
      comment_id: comment?.id ?? null,
      comment_author: comment?.author?.accountId ?? null,
      timestamp: event?.timestamp ?? null,
      changelog: event?.changelog ?? null,
      connector_id: matched.connectorId,
      body: event,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });

  if (error && error.code !== '23505') {
    logger.warn('jira persist failed', { error: error.message });
    return res.status(500).end();
  }

  if (error?.code !== '23505') {
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: persistedId,
        source: 'jira',
      }, { tenantId: matched.tenantId });
    } catch (err) {
      logger.warn('jira enqueue failed', { error: String(err) });
    }
  }

  return res.status(200).end();
});
