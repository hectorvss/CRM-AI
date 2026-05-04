/**
 * server/webhooks/github.ts
 *
 * GitHub webhook handler.
 * Headers:
 *   X-GitHub-Event:    event name (issues, pull_request, push, ...)
 *   X-GitHub-Delivery: stable delivery UUID (used for dedupe)
 *   X-Hub-Signature-256: sha256=<hex HMAC SHA256 of raw body>
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/github-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const githubWebhookRouter = Router();

githubWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('X-Hub-Signature-256') || '');
  const event = String(req.header('X-GitHub-Event') || '');
  const delivery = String(req.header('X-GitHub-Delivery') || '');
  if (!signature || !event) {
    logger.warn('github webhook: missing signature or event');
    return res.status(401).end();
  }

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) {
    logger.warn('github webhook: no raw body captured');
    return res.status(400).end();
  }

  // Iterate connectors and verify signature against each one's secret.
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from('connectors')
    .select('id, tenant_id, auth_config')
    .eq('system', 'github')
    .eq('status', 'connected');

  let matched: { tenantId: string; connectorId: string } | null = null;
  for (const row of rows ?? []) {
    const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
    const secret = typeof cfg.webhook_secret === 'string' ? cfg.webhook_secret : '';
    if (!secret) continue;
    if (verifyWebhookSignature({ rawBody, signature, secret })) {
      matched = { tenantId: String(row.tenant_id), connectorId: String(row.id) };
      break;
    }
  }
  if (!matched) {
    logger.warn('github webhook: no connector signature matched');
    return res.status(401).end();
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  // GitHub pings: respond OK, don't enqueue
  if (event === 'ping') return res.status(200).json({ pong: true });

  const action = String(payload?.action ?? '');
  const externalId = `github::${matched.connectorId}::${delivery || randomUUID()}`;

  const persistedId = randomUUID();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'github',
    event_type: action ? `github.${event}.${action}` : `github.${event}`,
    raw_payload: {
      event, action,
      delivery_id: delivery || null,
      // Quick-access fields
      repo_full_name: payload?.repository?.full_name ?? null,
      repo_id: payload?.repository?.id ?? null,
      sender_login: payload?.sender?.login ?? null,
      issue_number: payload?.issue?.number ?? null,
      issue_title: payload?.issue?.title ?? null,
      issue_state: payload?.issue?.state ?? null,
      pr_number: payload?.pull_request?.number ?? null,
      pr_title: payload?.pull_request?.title ?? null,
      pr_state: payload?.pull_request?.state ?? null,
      pr_merged: payload?.pull_request?.merged ?? null,
      comment_id: payload?.comment?.id ?? null,
      ref: payload?.ref ?? null,
      connector_id: matched.connectorId,
      body: payload,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });

  if (error && error.code !== '23505') {
    logger.warn('github persist failed', { error: error.message });
    return res.status(500).end();
  }

  if (error?.code !== '23505') {
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: persistedId,
        source: 'github',
      }, { tenantId: matched.tenantId });
    } catch (err) {
      logger.warn('github enqueue failed', { error: String(err) });
    }
  }

  return res.status(200).end();
});
