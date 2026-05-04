/**
 * server/webhooks/linear.ts
 *
 * Linear webhook handler. Each delivery has:
 *   - Linear-Signature: hex HMAC-SHA256 of raw body, keyed with the
 *     per-webhook signing secret (returned at webhook-create time).
 *   - Linear-Delivery: stable delivery id (used for dedupe).
 *   - Linear-Event: e.g. 'Issue', 'Comment'
 *
 * Body envelope: { action: 'create'|'update'|'remove', type, data, ...,
 *                  webhookId, webhookTimestamp, organizationId }
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature } from '../integrations/linear-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const linearWebhookRouter = Router();

linearWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const signature = String(req.header('Linear-Signature') || '');
    if (!signature) {
      logger.warn('linear webhook: missing signature');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');

    // Iterate Linear connectors and check signature against each one's
    // signing secret. Cheaper than parsing body to extract organizationId
    // before signature verification (don't trust unverified payload).
    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
      .from('connectors')
      .select('id, tenant_id, auth_config')
      .eq('system', 'linear')
      .eq('status', 'connected');

    let matched: { tenantId: string; connectorId: string } | null = null;
    for (const row of rows ?? []) {
      const cfg = (row.auth_config ?? {}) as Record<string, unknown>;
      const secret = typeof cfg.webhook_signing_secret === 'string' ? cfg.webhook_signing_secret : '';
      if (!secret) continue;
      if (verifyWebhookSignature({ rawBody, signature, signingSecret: secret })) {
        matched = { tenantId: String(row.tenant_id), connectorId: String(row.id) };
        break;
      }
    }
    if (!matched) {
      logger.warn('linear webhook: no connector signature matched');
      return res.status(401).end();
    }

    let event: any;
    try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const action = String(event?.action ?? 'unknown');
    const type = String(event?.type ?? 'unknown');
    const deliveryId = String(req.header('Linear-Delivery') || event?.webhookId || randomUUID());
    const externalId = `linear::${matched.connectorId}::${deliveryId}`;

    const persistedId = randomUUID();
    const data = event?.data ?? {};
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: matched.tenantId,
      source_system: 'linear',
      event_type: `linear.${type.toLowerCase()}.${action.toLowerCase()}`,
      raw_payload: {
        action, type,
        organization_id: event?.organizationId ?? null,
        webhook_id: event?.webhookId ?? null,
        webhook_timestamp: event?.webhookTimestamp ?? null,
        // Quick-access fields
        issue_id: type === 'Issue' ? data?.id ?? null : data?.issueId ?? null,
        issue_identifier: type === 'Issue' ? data?.identifier ?? null : null,
        comment_id: type === 'Comment' ? data?.id ?? null : null,
        title: data?.title ?? null,
        state: data?.state?.name ?? null,
        priority: data?.priority ?? null,
        assignee_id: data?.assigneeId ?? null,
        team_id: data?.teamId ?? null,
        connector_id: matched.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('linear persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: persistedId,
          source: 'linear',
        }, { tenantId: matched.tenantId });
      } catch (err) {
        logger.warn('linear enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
