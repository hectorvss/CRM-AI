/**
 * server/webhooks/gitlab.ts
 *
 * GitLab webhook handler. Header `X-Gitlab-Token` = the per-hook secret
 * we set at registration; constant-time compared.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByGitLabToken } from '../integrations/gitlab-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const gitlabWebhookRouter = Router();

gitlabWebhookRouter.post('/', async (req: Request, res: Response) => {
  const token = String(req.header('X-Gitlab-Token') || '');
  const eventName = String(req.header('X-Gitlab-Event') || 'unknown');
  if (!token) return res.status(401).end();

  const matched = await findTenantByGitLabToken(token);
  if (!matched) { logger.warn('gitlab webhook: token not matched'); return res.status(401).end(); }

  const rawBody = (req as any).rawBody as string | undefined;
  let event: any; try { event = rawBody ? JSON.parse(rawBody) : req.body; } catch { return res.status(200).end(); }

  const objectKind = String(event?.object_kind ?? eventName.toLowerCase().replace(/\s+/g, '_'));
  const action = String(event?.object_attributes?.action ?? event?.object_attributes?.state ?? '');
  const entityId = event?.object_attributes?.id ?? event?.object_attributes?.iid ?? event?.checkout_sha ?? randomUUID();
  const deliveryId = `${objectKind}::${action}::${entityId}`;
  const externalId = `gitlab::${matched.connectorId}::${deliveryId}`;
  const persistedId = randomUUID();

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').insert({
    id: persistedId,
    tenant_id: matched.tenantId,
    source_system: 'gitlab',
    event_type: action ? `gitlab.${objectKind}.${action}` : `gitlab.${objectKind}`,
    raw_payload: {
      event_name: eventName, object_kind: objectKind, action,
      project_id: event?.project?.id ?? matched.hook.project_id,
      project_name: event?.project?.name ?? null,
      project_url: event?.project?.web_url ?? null,
      issue_iid: event?.object_kind === 'issue' ? event?.object_attributes?.iid ?? null : null,
      issue_title: event?.object_kind === 'issue' ? event?.object_attributes?.title ?? null : null,
      mr_iid: event?.object_kind === 'merge_request' ? event?.object_attributes?.iid ?? null : null,
      mr_state: event?.object_kind === 'merge_request' ? event?.object_attributes?.state ?? null : null,
      user_id: event?.user?.id ?? null,
      user_username: event?.user?.username ?? null,
      connector_id: matched.connectorId,
      body: event,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: externalId,
  });
  if (error && error.code !== '23505') { logger.warn('gitlab persist failed', { error: error.message }); return res.status(500).end(); }
  if (error?.code !== '23505') {
    try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'gitlab' }, { tenantId: matched.tenantId }); }
    catch (err) { logger.warn('gitlab enqueue failed', { error: String(err) }); }
  }
  return res.status(200).end();
});
