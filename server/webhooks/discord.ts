/**
 * server/webhooks/discord.ts
 *
 * Discord Interactions endpoint. Discord sends POSTs signed with Ed25519
 * over `<timestamp><rawBody>` using the application public key.
 *
 * The first thing Discord does is a PING (type=1) which we must answer
 * with PONG (type=1) immediately. After that, real interactions arrive
 * (slash commands, components, modal submits) and we ack within 3s,
 * then enqueue for async processing.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { verifyInteractionSignature } from '../integrations/discord-oauth.js';
import { findDiscordTenantsByGuild } from '../integrations/discord-tenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const discordWebhookRouter = Router();

discordWebhookRouter.post('/', async (req: Request, res: Response) => {
  const signature = String(req.header('X-Signature-Ed25519') || '');
  const timestamp = String(req.header('X-Signature-Timestamp') || '');
  const rawBody = (req as any).rawBody as string | undefined;
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  if (!publicKey) { logger.error('discord webhook: DISCORD_PUBLIC_KEY not configured'); return res.status(503).end(); }
  if (!signature || !timestamp || !rawBody) return res.status(401).end();

  if (!verifyInteractionSignature({ rawBody, signature, timestamp, publicKeyHex: publicKey })) {
    logger.warn('discord webhook: signature mismatch');
    return res.status(401).end();
  }

  let event: any; try { event = JSON.parse(rawBody); } catch { return res.status(200).end(); }

  // Type 1 = PING — respond PONG to satisfy Discord endpoint validation
  if (event?.type === 1) return res.status(200).json({ type: 1 });

  // Ack the interaction immediately (type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE).
  // We then enqueue the actual work for the worker to follow up via webhook token.
  res.status(200).json({ type: 5 });

  const guildId = String(event?.guild_id ?? '');
  const tenants = guildId ? await findDiscordTenantsByGuild(guildId) : [];
  if (tenants.length === 0) {
    // DM interactions don't have guild_id; we don't process them by default.
    logger.debug('discord webhook: no guild_id or no tenant matched', { guildId });
    return;
  }

  const interactionType = String(event?.type ?? 'unknown');
  const commandName = String(event?.data?.name ?? event?.data?.custom_id ?? '');
  const userId = String(event?.member?.user?.id ?? event?.user?.id ?? '');
  const deliveryId = String(event?.id ?? randomUUID());

  const supabase = getSupabaseAdmin();
  for (const t of tenants) {
    const externalId = `discord::${t.connectorId}::${deliveryId}`;
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: t.tenantId,
      source_system: 'discord',
      event_type: `discord.interaction.${interactionType}${commandName ? `.${commandName}` : ''}`,
      raw_payload: {
        interaction_id: event?.id ?? null,
        interaction_type: interactionType,
        command_name: commandName || null,
        guild_id: guildId, channel_id: event?.channel_id ?? null,
        user_id: userId, user_username: event?.member?.user?.username ?? event?.user?.username ?? null,
        application_id: event?.application_id ?? null,
        token: event?.token ?? null, // used for follow-up via webhooks/{app}/{token}/messages
        connector_id: t.connectorId,
        body: event,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });
    if (error && error.code !== '23505') { logger.warn('discord persist failed', { error: error.message }); continue; }
    if (error?.code !== '23505') {
      try { await enqueue(JobType.WEBHOOK_PROCESS, { webhookEventId: persistedId, source: 'discord' }, { tenantId: t.tenantId }); }
      catch (err) { logger.warn('discord enqueue failed', { error: String(err) }); }
    }
  }
});
