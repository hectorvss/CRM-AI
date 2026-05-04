/**
 * server/routes/telegramIntegration.ts — Telegram Bot connect.
 * Just paste the bot token from @BotFather; we call /getMe to validate
 * and /setWebhook with a server-generated secret_token to wire up
 * inbound updates.
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { TelegramAdapter } from '../integrations/telegram.js';
import {
  invalidateTelegramForTenant,
  telegramForTenant,
} from '../integrations/telegram-tenant.js';

export const telegramIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}
function webhookCallbackUrl(): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/telegram` : '';
}

telegramIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const botToken = String(req.body?.bot_token || '').trim();
  if (!botToken || !/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
    return res.status(400).json({ error: 'Invalid bot token. Format: 123456:ABC-...' });
  }

  // 1. Validate by hitting /getMe.
  let me;
  try {
    const adapter = new TelegramAdapter({ botToken });
    me = await adapter.getMe();
  } catch (err: any) {
    return res.status(400).json({
      error: 'Telegram rejected the bot token. Re-issue it via @BotFather and try again.',
      telegramMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // 2. Set the webhook with a randomly-generated secret token.
  const secretToken = randomBytes(20).toString('base64url');
  let webhookSet = false;
  let webhookError: string | null = null;
  const url = webhookCallbackUrl();
  if (url) {
    try {
      const adapter = new TelegramAdapter({ botToken });
      await adapter.setWebhook({
        url,
        secretToken,
        allowedUpdates: ['message', 'edited_message', 'callback_query'],
        dropPendingUpdates: false,
      });
      webhookSet = true;
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `telegram::${req.tenantId}::${me.id}`;

  const authConfig = {
    bot_id: me.id,
    bot_username: me.username,
    bot_name: me.first_name,
    bot_token: botToken,
    webhook_secret_token: secretToken,
    webhook_callback_url: url,
    webhook_set: webhookSet,
    webhook_error: webhookError,
    can_join_groups: me.can_join_groups,
    can_read_all_group_messages: me.can_read_all_group_messages,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'telegram',
    name: `@${me.username}`,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['text', 'photo', 'video', 'audio', 'document', 'inline_keyboard', 'edit_message', 'delete_message', 'chat_action'],
      reads: ['updates', 'file_download', 'commands'],
      realtime: webhookSet ? 'webhook' : 'unconfigured',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidateTelegramForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'telegram', bot_id: me.id, bot_username: me.username, webhook_set: webhookSet },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    bot: { id: me.id, username: me.username, name: me.first_name },
    webhook_set: webhookSet,
    webhook_callback_url: url,
    webhook_error: webhookError,
  });
});

telegramIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await telegramForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved) {
    try { await resolved.adapter.deleteWebhook(false); } catch (err) { logger.warn('telegram deleteWebhook failed', { error: String(err) }); }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'telegram');
  if (error) return res.status(500).json({ error: error.message });
  invalidateTelegramForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

telegramIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'telegram')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;

  // Probe live webhook status if connected.
  let liveWebhookInfo: any = null;
  if (data.status === 'connected' && cfg.bot_token) {
    try {
      const adapter = new TelegramAdapter({ botToken: cfg.bot_token as string });
      liveWebhookInfo = await adapter.getWebhookInfo();
    } catch (err) {
      logger.debug('telegram webhook probe failed', { error: String(err) });
    }
  }

  return res.json({
    connected: data.status === 'connected',
    bot_id: cfg.bot_id ?? null,
    bot_username: cfg.bot_username ?? null,
    bot_name: cfg.bot_name ?? null,
    webhook_set: cfg.webhook_set === true,
    webhook_callback_url: cfg.webhook_callback_url ?? webhookCallbackUrl(),
    webhook_pending_updates: liveWebhookInfo?.pending_update_count ?? null,
    webhook_last_error: liveWebhookInfo?.last_error_message ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

telegramIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await telegramForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Telegram not connected' });
  const chatId = req.body?.chat_id;
  if (!chatId) return res.status(400).json({ error: 'chat_id required (numeric user id, group id, or @channel)' });
  try {
    const result = await resolved.adapter.sendMessage({
      chatId,
      text: String(req.body?.text || 'Test desde Clain ✅'),
    });
    return res.json({ ok: true, message_id: result.message_id });
  } catch (err: any) {
    return res.status(502).json({ error: 'Telegram rejected the test message', details: String(err?.message ?? err) });
  }
});
