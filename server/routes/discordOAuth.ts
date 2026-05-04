/**
 * server/routes/discordOAuth.ts
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, type DiscordOAuthEnv } from '../integrations/discord-oauth.js';
import { discordForTenant, invalidateDiscordForTenant } from '../integrations/discord-tenant.js';
import { DiscordAdapter } from '../integrations/discord.js';

export const discordOAuthRouter = Router();

function readEnv(): DiscordOAuthEnv | { error: string } {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const stateSecret = process.env.DISCORD_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  const botToken = process.env.DISCORD_BOT_TOKEN || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'Discord OAuth not configured' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'DISCORD_STATE_SECRET must be set' };
  if (!botToken) return { error: 'DISCORD_BOT_TOKEN must be set' };
  return { clientId, clientSecret, stateSecret, publicKey, botToken, redirectUri: `https://${publicBase}/api/integrations/discord/callback` };
}

discordOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

discordOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=discord&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');

  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('Discord token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=discord&reason=token_exchange`); }

  const guild = grant.guild;
  if (!guild) return res.redirect(`/app/integrations?error=discord&reason=no_guild`);

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `discord::${state.t}::${guild.id}`;

  const authConfig: Record<string, unknown> = {
    user_access_token: grant.accessToken,
    user_refresh_token: grant.refreshToken,
    user_access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    scope: grant.scope,
    guild_id: guild.id, guild_name: guild.name,
    application_id: env.clientId,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'discord', name: guild.name || `discord-${guild.id}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['guilds', 'channels', 'messages', 'users'], writes: ['send_message', 'send_dm', 'add_reaction', 'create_command', 'delete_message'], events: ['INTERACTION_CREATE', 'MESSAGE_CREATE', 'MESSAGE_REACTION_ADD'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('Discord upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=discord&reason=persist`); }

  invalidateDiscordForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'discord', guild_id: guild.id, guild_name: guild.name }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=discord');
});

discordOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'discord');
  if (error) return res.status(500).json({ error: error.message });
  invalidateDiscordForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

discordOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'discord').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    guild_id: cfg.guild_id ?? null, guild_name: cfg.guild_name ?? null,
    application_id: cfg.application_id ?? null, scope: cfg.scope ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

discordOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await discordForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Discord not connected' });
  try {
    const channels = await resolved.adapter.listGuildChannels(resolved.connector.guildId);
    return res.json({ ok: true, guild_id: resolved.connector.guildId, channels: channels.length, sample: channels.slice(0, 5).map(c => ({ id: c.id, type: c.type, name: c.name })) });
  } catch (err: any) { return res.status(502).json({ error: 'Discord API call failed', details: String(err?.message ?? err) }); }
});

discordOAuthRouter.post('/message', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await discordForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Discord not connected' });
  const channelId = String(req.body?.channel_id || '');
  const content = String(req.body?.content || '');
  if (!channelId || !content) return res.status(400).json({ error: 'channel_id and content required' });
  try {
    const m = await resolved.adapter.sendMessage(channelId, { content, embeds: req.body?.embeds, allowed_mentions: req.body?.allowed_mentions, message_reference: req.body?.reply_to ? { message_id: req.body.reply_to, channel_id: channelId, fail_if_not_exists: false } : undefined });
    return res.json({ ok: true, message: { id: m.id, channel_id: m.channel_id } });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

discordOAuthRouter.post('/dm', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await discordForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Discord not connected' });
  const userId = String(req.body?.user_id || '');
  const content = String(req.body?.content || '');
  if (!userId || !content) return res.status(400).json({ error: 'user_id and content required' });
  try {
    const channel = await resolved.adapter.createDM(userId);
    const m = await resolved.adapter.sendMessage(channel.id, { content });
    return res.json({ ok: true, channel_id: channel.id, message_id: m.id });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

discordOAuthRouter.post('/command', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await discordForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Discord not connected' });
  const name = String(req.body?.name || '');
  const description = String(req.body?.description || '');
  if (!name || !description) return res.status(400).json({ error: 'name and description required' });
  try {
    const cmd = await resolved.adapter.createGlobalCommand(resolved.connector.applicationId, { name, description, options: req.body?.options, type: req.body?.type ?? 1 });
    return res.json({ ok: true, command: cmd });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
