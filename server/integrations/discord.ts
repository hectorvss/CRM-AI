/**
 * server/integrations/discord.ts
 *
 * Discord REST API v10 adapter. Uses the application Bot Token (long-lived,
 * shared across guilds the bot is installed in) for outbound actions.
 * For per-user OAuth actions (rare in inbox-style integrations) use the
 * user access_token instead.
 */

import { DISCORD_API_BASE } from './discord-oauth.js';
import { logger } from '../utils/logger.js';

export class DiscordAuthError extends Error { constructor(m: string) { super(m); this.name = 'DiscordAuthError'; } }

export interface DiscordGuild { id: string; name: string; icon?: string; owner?: boolean; permissions?: string }
export interface DiscordChannel { id: string; type: number; guild_id?: string; name?: string; topic?: string; parent_id?: string }
export interface DiscordUser { id: string; username: string; global_name?: string; discriminator: string; avatar?: string; email?: string }
export interface DiscordMessage { id: string; channel_id: string; author: { id: string; username: string }; content: string; timestamp: string; embeds?: any[]; attachments?: any[] }

export class DiscordAdapter {
  /**
   * @param authToken — bot token (without `Bot ` prefix) OR user OAuth bearer.
   * @param authMode  — 'bot' (default) | 'bearer'
   */
  constructor(private authToken: string, private authMode: 'bot' | 'bearer' = 'bot') {}

  private auth(): string {
    return this.authMode === 'bot' ? `Bot ${this.authToken}` : `Bearer ${this.authToken}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${DISCORD_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: this.auth(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new DiscordAuthError(`discord ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`discord ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('GET', '/users/@me'); return { ok: true }; }
    catch (err) { logger.warn('discord ping failed', { error: String(err) }); return { ok: false }; }
  }

  async me(): Promise<DiscordUser> { return this.request<DiscordUser>('GET', '/users/@me'); }

  // ── Guilds (servers) ──────────────────────────────────────────────────────
  async listMyGuilds(): Promise<DiscordGuild[]> { return this.request<DiscordGuild[]>('GET', '/users/@me/guilds'); }
  async getGuild(guildId: string): Promise<DiscordGuild> { return this.request('GET', `/guilds/${encodeURIComponent(guildId)}`); }
  async listGuildChannels(guildId: string): Promise<DiscordChannel[]> { return this.request('GET', `/guilds/${encodeURIComponent(guildId)}/channels`); }

  // ── Channels / messages ───────────────────────────────────────────────────
  async getChannel(channelId: string): Promise<DiscordChannel> { return this.request('GET', `/channels/${encodeURIComponent(channelId)}`); }
  async listMessages(channelId: string, limit = 25): Promise<DiscordMessage[]> {
    return this.request('GET', `/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`);
  }
  async sendMessage(channelId: string, payload: { content?: string; embeds?: any[]; tts?: boolean; allowed_mentions?: any; message_reference?: { message_id: string; channel_id?: string; fail_if_not_exists?: boolean } }): Promise<DiscordMessage> {
    return this.request('POST', `/channels/${encodeURIComponent(channelId)}/messages`, payload);
  }
  async createDM(recipientId: string): Promise<DiscordChannel> {
    return this.request('POST', '/users/@me/channels', { recipient_id: recipientId });
  }
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    await this.request('PUT', `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}/@me`);
  }
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.request('DELETE', `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`);
  }

  // ── Application commands (slash) ──────────────────────────────────────────
  async createGlobalCommand(applicationId: string, command: { name: string; description: string; options?: any[]; type?: number }): Promise<any> {
    return this.request('POST', `/applications/${encodeURIComponent(applicationId)}/commands`, command);
  }
  async listGlobalCommands(applicationId: string): Promise<any[]> {
    return this.request('GET', `/applications/${encodeURIComponent(applicationId)}/commands`);
  }
  async deleteGlobalCommand(applicationId: string, commandId: string): Promise<void> {
    await this.request('DELETE', `/applications/${encodeURIComponent(applicationId)}/commands/${encodeURIComponent(commandId)}`);
  }
}
