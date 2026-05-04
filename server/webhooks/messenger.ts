/**
 * server/webhooks/messenger.ts
 *
 * Inbound Facebook Messenger events. Multi-tenant: resolves the tenant
 * by `entry[].id = page_id` and verifies HMAC with that tenant's app_secret.
 *
 * Meta delivers `messages`, `messaging_postbacks`, `message_deliveries`,
 * `message_reads`, `messaging_referrals`, `messaging_handovers`. We
 * persist `messages` + postbacks; the rest we ack and skip (until the
 * downstream pipeline cares).
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { MessengerAdapter } from '../integrations/messenger.js';
import { findTenantByMessengerPageId } from '../integrations/messenger-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const messengerWebhookRouter = Router();

// ── GET /webhooks/messenger — Meta verification handshake ───────────────────

messengerWebhookRouter.get('/', async (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] ?? '');
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');
  if (mode !== 'subscribe' || !token) return res.status(403).send('Forbidden');

  // Multi-tenant: match the verify_token against any connected merchant.
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('connectors')
      .select('auth_config')
      .eq('system', 'messenger')
      .eq('status', 'connected');
    if (data && (data as Array<{ auth_config: any }>).some((row) => (row.auth_config?.verify_token ?? '') === token)) {
      return res.status(200).send(challenge);
    }
  } catch (err) {
    logger.warn('messenger verify lookup failed', { error: String(err) });
  }
  return res.status(403).send('Forbidden');
});

messengerWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer).toString('utf8');
    const headers = req.headers as Record<string, string>;

    let body: any;
    try { body = JSON.parse(rawBody); } catch { return res.status(202).end(); }

    const entries: any[] = body?.entry ?? [];
    const pageId = String(entries[0]?.id ?? '');
    if (!pageId) return res.status(202).end();

    const tenantInfo = await findTenantByMessengerPageId(pageId);
    if (!tenantInfo) {
      logger.warn('messenger webhook: no connector for page', { pageId });
      return res.status(202).end();
    }

    // Verify HMAC with the tenant's app_secret.
    const sigHeader = headers['x-hub-signature-256'];
    if (!sigHeader || !MessengerAdapter.verifyWebhookSignature({
      appSecret: tenantInfo.appSecret,
      rawBody,
      providedSignature: sigHeader,
    })) {
      logger.warn('messenger webhook: invalid signature', { pageId });
      return res.status(401).end();
    }

    const persisted: string[] = [];
    for (const entry of entries) {
      const messaging: any[] = entry?.messaging ?? [];
      for (const event of messaging) {
        // We process: incoming message, postback. Echoes (own messages we
        // sent) we skip — they're confirmation, not new content.
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
            payload: { title: event.postback.title, payload: event.postback.payload, referral: event.postback.referral ?? null },
          });
          persisted.push(externalId);
        }
      }
    }

    return res.status(200).json({ ok: true, persisted: persisted.length });
  },
);

async function persist(
  tenantInfo: { tenantId: string; connectorId: string },
  evt: { kind: 'message' | 'postback'; externalId: string; senderId: string; recipientId: string; ts: string; payload: any },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const eventId = randomUUID();
  const { error } = await supabase.from('webhook_events').insert({
    id: eventId,
    tenant_id: tenantInfo.tenantId,
    source_system: 'messenger',
    event_type: `messenger.${evt.kind}`,
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
    dedupe_key: `messenger::${evt.externalId}`,
  });
  if (error && error.code !== '23505') {
    logger.warn('messenger persist failed', { error: error.message });
    return;
  }
  if (error?.code !== '23505') {
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: eventId,
        source: 'messenger',
      }, { tenantId: tenantInfo.tenantId });
    } catch (err) {
      logger.warn('messenger enqueue failed', { error: String(err) });
    }
  }
}
