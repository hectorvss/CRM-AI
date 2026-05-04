/**
 * server/webhooks/instagram.ts
 *
 * Inbound Instagram messaging events. Same Meta envelope as Messenger
 * but `entry[].id` is either the IG user id or the linked page id, and
 * the field types include `mentions` and `comments` which we forward as
 * inbound events too (private replies start from those).
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { InstagramAdapter } from '../integrations/instagram.js';
import { findTenantByInstagramId } from '../integrations/instagram-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const instagramWebhookRouter = Router();

instagramWebhookRouter.get('/', async (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] ?? '');
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');
  if (mode !== 'subscribe' || !token) return res.status(403).send('Forbidden');
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('auth_config')
      .eq('system', 'instagram')
      .eq('status', 'connected');
    if (data && (data as Array<{ auth_config: any }>).some((row) => (row.auth_config?.verify_token ?? '') === token)) {
      return res.status(200).send(challenge);
    }
  } catch (err) {
    logger.warn('instagram verify lookup failed', { error: String(err) });
  }
  return res.status(403).send('Forbidden');
});

instagramWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer).toString('utf8');
    const headers = req.headers as Record<string, string>;

    let body: any;
    try { body = JSON.parse(rawBody); } catch { return res.status(202).end(); }

    const entries: any[] = body?.entry ?? [];
    const accountId = String(entries[0]?.id ?? '');
    if (!accountId) return res.status(202).end();

    const tenantInfo = await findTenantByInstagramId(accountId);
    if (!tenantInfo) {
      logger.warn('instagram webhook: no connector for id', { accountId });
      return res.status(202).end();
    }

    const sigHeader = headers['x-hub-signature-256'];
    if (!sigHeader || !InstagramAdapter.verifyWebhookSignature({
      appSecret: tenantInfo.appSecret,
      rawBody,
      providedSignature: sigHeader,
    })) {
      logger.warn('instagram webhook: invalid signature', { accountId });
      return res.status(401).end();
    }

    const persisted: string[] = [];
    for (const entry of entries) {
      // DMs come under entry.messaging[]; comments / mentions under entry.changes[]
      const messaging: any[] = entry?.messaging ?? [];
      for (const event of messaging) {
        if (event.message?.is_echo) continue;
        const senderId = String(event.sender?.id ?? '');
        const recipientId = String(event.recipient?.id ?? '');
        const ts = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
        if (event.message) {
          const externalId = String(event.message.mid ?? randomUUID());
          await persist(tenantInfo, {
            kind: 'message',
            externalId,
            senderId,
            recipientId,
            ts,
            payload: {
              text: event.message.text ?? null,
              attachments: event.message.attachments ?? [],
              quick_reply: event.message.quick_reply ?? null,
              reply_to: event.message.reply_to ?? null,
              raw: event.message,
            },
          });
          persisted.push(externalId);
        } else if (event.postback) {
          const externalId = `postback::${event.postback.mid ?? randomUUID()}`;
          await persist(tenantInfo, {
            kind: 'postback',
            externalId,
            senderId,
            recipientId,
            ts,
            payload: { title: event.postback.title, payload: event.postback.payload },
          });
          persisted.push(externalId);
        }
      }

      const changes: any[] = entry?.changes ?? [];
      for (const change of changes) {
        if (change.field === 'comments' || change.field === 'mentions') {
          const externalId = `${change.field}::${change.value?.id ?? randomUUID()}`;
          await persist(tenantInfo, {
            kind: 'comment',
            externalId,
            senderId: change.value?.from?.id ?? '',
            recipientId: tenantInfo.igUserId,
            ts: new Date().toISOString(),
            payload: { field: change.field, value: change.value },
          });
          persisted.push(externalId);
        }
      }
    }

    return res.status(200).json({ ok: true, persisted: persisted.length });
  },
);

async function persist(
  tenantInfo: { tenantId: string; connectorId: string; igUserId: string },
  evt: { kind: 'message' | 'postback' | 'comment'; externalId: string; senderId: string; recipientId: string; ts: string; payload: any },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const eventId = randomUUID();
  const { error } = await supabase.from('webhook_events').insert({
    id: eventId,
    tenant_id: tenantInfo.tenantId,
    source_system: 'instagram',
    event_type: `instagram.${evt.kind}`,
    raw_payload: {
      external_id: evt.externalId,
      sender_id: evt.senderId,
      recipient_id: evt.recipientId,
      ts: evt.ts,
      ...evt.payload,
      connector_id: tenantInfo.connectorId,
    },
    received_at: new Date().toISOString(),
    status: 'received',
    dedupe_key: `instagram::${evt.externalId}`,
  });
  if (error && error.code !== '23505') {
    logger.warn('instagram persist failed', { error: error.message });
    return;
  }
  if (error?.code !== '23505') {
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: eventId,
        source: 'instagram',
      }, { tenantId: tenantInfo.tenantId });
    } catch (err) {
      logger.warn('instagram enqueue failed', { error: String(err) });
    }
  }
}
