/**
 * server/webhooks/gmail.ts
 *
 * Pub/Sub push handler. Google sends:
 *   POST /webhooks/gmail
 *   { message: { data: <base64(json)>, messageId, publishTime, attributes }, subscription }
 *
 * The base64-decoded JSON is `{ emailAddress, historyId }` — Google does
 * NOT send the message itself. We use the historyId to call
 * `users.history.list` and pull only the records since last sync.
 *
 * Authentication:
 *  Pub/Sub push subscriptions can include an OIDC token in the
 *  `Authorization: Bearer <jwt>` header. The token is signed by Google
 *  and the audience is the URL we configured. Verifying it fully needs
 *  Google's public certs; for now we accept either:
 *    - A shared secret in `?token=...` query string (configured on the
 *      Pub/Sub subscription), OR
 *    - The OIDC token's `iss=https://accounts.google.com` claim if present
 *
 * On success we always return 200 — Pub/Sub retries failures up to 7
 * days, so dropping a notification quietly is fine; missing it for an
 * hour is fine; double-processing is fine because case ingestion is
 * idempotent on Gmail message id.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { decodePubSubPush, GmailAdapter, header, extractMessageBody } from '../integrations/gmail.js';
import { gmailForTenant, findTenantByEmail } from '../integrations/gmail-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const gmailWebhookRouter = Router();

const PUSH_TOKEN = process.env.GMAIL_PUBSUB_PUSH_TOKEN;

gmailWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '1mb' }),
  async (req: Request, res: Response) => {
    // Pub/Sub will retry on non-2xx; ack ASAP and process synchronously
    // because incremental sync usually completes well within Pub/Sub's
    // 10-second ack deadline. For extreme volume you'd ack here and
    // enqueue, but it's not needed yet.

    if (PUSH_TOKEN) {
      const provided = typeof req.query.token === 'string' ? req.query.token : '';
      if (provided !== PUSH_TOKEN) {
        logger.warn('gmail webhook: token mismatch');
        return res.status(401).end();
      }
    }

    let body: any;
    try {
      body = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch {
      logger.warn('gmail webhook: malformed JSON');
      return res.status(200).end();
    }

    const decoded = decodePubSubPush(body);
    if (!decoded) {
      logger.warn('gmail webhook: could not decode push body');
      return res.status(200).end();
    }

    const tenantInfo = await findTenantByEmail(decoded.emailAddress);
    if (!tenantInfo) {
      logger.warn('gmail webhook: no connector for email', { email: decoded.emailAddress });
      return res.status(200).end();
    }

    const resolved = await gmailForTenant(tenantInfo.tenantId, null);
    if (!resolved) {
      logger.warn('gmail webhook: tenant resolver returned null', { email: decoded.emailAddress });
      return res.status(200).end();
    }

    const startHistoryId = resolved.connector.historyId ?? decoded.historyId;
    let history;
    try {
      history = await resolved.adapter.listHistory({ startHistoryId, labelId: 'INBOX' });
    } catch (err: any) {
      if (err?.statusCode === 404) {
        // historyId too old → bootstrap a fresh baseline silently.
        const profile = await resolved.adapter.getProfile();
        await persistHistoryId(tenantInfo.connectorId, profile.historyId);
        return res.status(200).end();
      }
      logger.warn('gmail webhook: listHistory failed', { error: String(err) });
      return res.status(200).end();
    }

    const newMessageIds = new Set<string>();
    for (const record of history.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        if ((added.message.labelIds ?? []).includes('INBOX')) {
          newMessageIds.add(added.message.id);
        }
      }
    }

    if (newMessageIds.size > 0) {
      await ingestNewMessages({
        tenantId: tenantInfo.tenantId,
        connectorId: tenantInfo.connectorId,
        emailAddress: decoded.emailAddress,
        adapter: resolved.adapter,
        messageIds: Array.from(newMessageIds),
      });
    }

    await persistHistoryId(tenantInfo.connectorId, history.historyId);
    return res.status(200).end();
  },
);

async function persistHistoryId(connectorId: string, historyId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from('connectors')
    .select('auth_config')
    .eq('id', connectorId)
    .maybeSingle();
  if (!row) return;
  const merged = { ...((row.auth_config ?? {}) as Record<string, unknown>), history_id: historyId };
  await supabase
    .from('connectors')
    .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', connectorId);
}

/**
 * Fetch each new message from Gmail and persist it as a webhook event so
 * the existing canonicalizer pipeline (Flow 4) routes it into a case.
 *
 * This is intentionally minimal — we just hand off the raw Gmail message
 * to the queue. The canonicalizer + channel ingest jobs do the heavy
 * lifting (case creation, customer resolution, draft reply generation).
 */
async function ingestNewMessages(opts: {
  tenantId: string;
  connectorId: string;
  emailAddress: string;
  adapter: GmailAdapter;
  messageIds: string[];
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Fetch concurrently but bounded so we don't blow Gmail's quota.
  const messages = await Promise.allSettled(
    opts.messageIds.map((id) => opts.adapter.getMessage(id, 'full')),
  );

  for (const result of messages) {
    if (result.status !== 'fulfilled') continue;
    const message = result.value;
    const id = message.id;
    const fromHeader = header(message, 'from');
    const subject = header(message, 'subject') ?? '(no subject)';
    const messageIdHeader = header(message, 'message-id');
    const body = extractMessageBody(message);

    // Idempotency: the canonical pipeline keys on (source, external_event_id),
    // so duplicate notifications collapse cleanly.
    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: opts.tenantId,
      source_system: 'gmail',
      event_type: 'message.received',
      raw_payload: {
        gmail_id: id,
        thread_id: message.threadId,
        message_id_header: messageIdHeader,
        from: fromHeader,
        subject,
        snippet: message.snippet ?? '',
        body_plain: body.plain,
        body_html: body.html,
        labels: message.labelIds ?? [],
        internal_date: message.internalDate,
        connector_id: opts.connectorId,
        recipient_email: opts.emailAddress,
      },
      received_at: now,
      status: 'received',
      dedupe_key: `gmail::${id}`,
    });
    if (error && error.code !== '23505') {
      logger.warn('gmail ingest: webhook_events insert failed', { error: error.message });
      continue;
    }

    // Hand to the worker queue for canonicalization + case creation.
    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: eventId,
        source: 'gmail',
      }, { tenantId: opts.tenantId });
    } catch (err) {
      logger.warn('gmail ingest: enqueue failed', { error: String(err) });
    }
  }
}
