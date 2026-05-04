/**
 * server/webhooks/telegram.ts
 *
 * Inbound Telegram bot updates. Telegram sends a JSON body and echoes
 * the secret_token we set at /setWebhook in the
 * `X-Telegram-Bot-Api-Secret-Token` header — that's our auth check.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantByTelegramSecret } from '../integrations/telegram-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const telegramWebhookRouter = Router();

telegramWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const headers = req.headers as Record<string, string>;
    const providedSecret = headers['x-telegram-bot-api-secret-token'];
    if (!providedSecret) {
      logger.warn('telegram webhook: missing secret token header');
      return res.status(401).end();
    }

    const tenantInfo = await findTenantByTelegramSecret(providedSecret);
    if (!tenantInfo) {
      logger.warn('telegram webhook: secret token does not match any connector');
      return res.status(401).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    let update: any;
    try { update = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    const supabase = getSupabaseAdmin();
    const updateId = String(update?.update_id ?? randomUUID());

    // Pick the actual content carrier (message / edited_message / callback_query).
    let kind: 'message' | 'edited_message' | 'callback_query' | 'unknown' = 'unknown';
    let payload: any = update;
    let chatId: number | string | null = null;
    let senderId: number | string | null = null;
    let externalId: string = `update::${updateId}`;

    if (update.message) {
      kind = 'message';
      payload = update.message;
      chatId = update.message.chat?.id ?? null;
      senderId = update.message.from?.id ?? null;
      externalId = `message::${update.message.message_id}::${chatId}`;
    } else if (update.edited_message) {
      kind = 'edited_message';
      payload = update.edited_message;
      chatId = update.edited_message.chat?.id ?? null;
      senderId = update.edited_message.from?.id ?? null;
      externalId = `edited::${update.edited_message.message_id}::${chatId}`;
    } else if (update.callback_query) {
      kind = 'callback_query';
      payload = update.callback_query;
      chatId = update.callback_query.message?.chat?.id ?? null;
      senderId = update.callback_query.from?.id ?? null;
      externalId = `callback::${update.callback_query.id}`;
    }

    const eventId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: eventId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'telegram',
      event_type: `telegram.${kind}`,
      raw_payload: {
        update_id: updateId,
        external_id: externalId,
        kind,
        chat_id: chatId,
        sender_id: senderId,
        bot_id: tenantInfo.botId,
        payload,
        connector_id: tenantInfo.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: `telegram::${externalId}`,
    });
    if (error && error.code !== '23505') {
      logger.warn('telegram persist failed', { error: error.message });
      return res.status(200).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: eventId,
          source: 'telegram',
        }, { tenantId: tenantInfo.tenantId });
      } catch (err) {
        logger.warn('telegram enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);
