/**
 * server/integrations/teams.ts
 *
 * Microsoft Teams adapter — built on top of Microsoft Graph v1.0.
 * Coverage focused on what the AI agent + inbox pipeline needs:
 *   - Joined teams + channels (discovery)
 *   - Channel messages (post, reply in thread, list)
 *   - 1:1 / group chats (list, create 1:1, send message)
 *   - User identity (lookup by email or upn)
 *   - Graph subscriptions (channel-message + chat-message)
 *
 * Auth: Bearer access_token (Microsoft Identity Platform v2 delegated).
 *
 * Rate limits: Graph throttles per-app, per-tenant. We don't retry here;
 * leave that to the queue / pipeline layer.
 *
 * Docs: https://learn.microsoft.com/en-us/graph/api/overview
 */

import { logger } from '../utils/logger.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export interface TeamsTeam {
  id: string;
  displayName: string;
  description: string | null;
  visibility: 'private' | 'public' | string;
  createdDateTime?: string;
}

export interface TeamsChannel {
  id: string;
  displayName: string;
  description: string | null;
  webUrl: string;
  membershipType: 'standard' | 'private' | 'shared';
}

export interface TeamsMessage {
  id: string;
  replyToId: string | null;
  etag: string;
  messageType: 'message' | 'systemEventMessage' | string;
  createdDateTime: string;
  lastModifiedDateTime: string | null;
  deletedDateTime: string | null;
  subject: string | null;
  summary: string | null;
  importance: 'normal' | 'high' | 'urgent';
  body: { contentType: 'text' | 'html'; content: string };
  from: { user?: { id: string; displayName: string; userIdentityType: 'aadUser' } } | null;
  attachments?: any[];
  mentions?: any[];
  reactions?: any[];
}

export class TeamsAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | undefined>; headers?: Record<string, string> }): Promise<T> {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${GRAPH}${path.startsWith('/') ? '' : '/'}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    };
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let gError: any = null;
      let message = text;
      try {
        const j = JSON.parse(text);
        gError = j?.error ?? null;
        message = j?.error?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`teams ${method} ${path} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      err.statusCode = res.status;
      err.graphError = gError;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async ping(): Promise<{ ok: boolean; statusCode?: number; me?: any }> {
    try {
      const me = await this.req<any>('GET', '/me');
      return { ok: true, me };
    } catch (err: any) {
      logger.warn('teams ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }

  // ── Teams + Channels ─────────────────────────────────────────────────────

  async listJoinedTeams(): Promise<{ value: TeamsTeam[] }> {
    return this.req('GET', '/me/joinedTeams');
  }

  async listChannels(teamId: string): Promise<{ value: TeamsChannel[] }> {
    return this.req('GET', `/teams/${encodeURIComponent(teamId)}/channels`);
  }

  async getChannel(teamId: string, channelId: string): Promise<TeamsChannel> {
    return this.req('GET', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`);
  }

  // ── Channel messages ─────────────────────────────────────────────────────

  async listChannelMessages(teamId: string, channelId: string, opts?: { top?: number }): Promise<{ value: TeamsMessage[]; '@odata.nextLink'?: string }> {
    return this.req('GET', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
      query: { '$top': opts?.top ?? 50 },
    });
  }

  async listChannelMessageReplies(teamId: string, channelId: string, messageId: string): Promise<{ value: TeamsMessage[] }> {
    return this.req('GET', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`);
  }

  async sendChannelMessage(teamId: string, channelId: string, payload: { contentType?: 'text' | 'html'; content: string; subject?: string; mentions?: any[] }): Promise<TeamsMessage> {
    return this.req('POST', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
      body: {
        body: { contentType: payload.contentType ?? 'html', content: payload.content },
        subject: payload.subject,
        mentions: payload.mentions,
      },
    });
  }

  async replyToChannelMessage(teamId: string, channelId: string, messageId: string, payload: { contentType?: 'text' | 'html'; content: string; mentions?: any[] }): Promise<TeamsMessage> {
    return this.req('POST', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`, {
      body: {
        body: { contentType: payload.contentType ?? 'html', content: payload.content },
        mentions: payload.mentions,
      },
    });
  }

  // ── 1:1 / group chats ────────────────────────────────────────────────────

  async listChats(opts?: { top?: number; filter?: string }): Promise<{ value: any[]; '@odata.nextLink'?: string }> {
    return this.req('GET', '/me/chats', { query: { '$top': opts?.top ?? 50, '$filter': opts?.filter } });
  }

  async getChat(chatId: string): Promise<any> {
    return this.req('GET', `/chats/${encodeURIComponent(chatId)}`);
  }

  async listChatMessages(chatId: string, opts?: { top?: number }): Promise<{ value: TeamsMessage[]; '@odata.nextLink'?: string }> {
    return this.req('GET', `/chats/${encodeURIComponent(chatId)}/messages`, { query: { '$top': opts?.top ?? 50 } });
  }

  async sendChatMessage(chatId: string, payload: { contentType?: 'text' | 'html'; content: string }): Promise<TeamsMessage> {
    return this.req('POST', `/chats/${encodeURIComponent(chatId)}/messages`, {
      body: {
        body: { contentType: payload.contentType ?? 'html', content: payload.content },
      },
    });
  }

  /**
   * Open a 1:1 chat between two users (creates if it doesn't exist).
   * Both members must be in the same Microsoft Entra tenant.
   */
  async openOneOnOneChat(otherUserId: string, selfUserId: string): Promise<{ id: string }> {
    return this.req('POST', '/chats', {
      body: {
        chatType: 'oneOnOne',
        members: [
          { '@odata.type': '#microsoft.graph.aadUserConversationMember', roles: ['owner'], 'user@odata.bind': `${GRAPH}/users('${selfUserId}')` },
          { '@odata.type': '#microsoft.graph.aadUserConversationMember', roles: ['owner'], 'user@odata.bind': `${GRAPH}/users('${otherUserId}')` },
        ],
      },
    });
  }

  // ── Users (lookup) ───────────────────────────────────────────────────────

  async getUser(idOrUpn: string): Promise<any> {
    return this.req('GET', `/users/${encodeURIComponent(idOrUpn)}`);
  }

  async findUserByEmail(email: string): Promise<any | null> {
    const r = await this.req<{ value: any[] }>('GET', '/users', {
      query: { '$filter': `mail eq '${email.replace(/'/g, "''")}'`, '$top': 1 },
    });
    return r.value?.[0] ?? null;
  }

  // ── Subscriptions (Graph webhooks) ───────────────────────────────────────

  async listSubscriptions(): Promise<{ value: any[] }> {
    return this.req('GET', '/subscriptions');
  }

  /**
   * Create a Graph subscription. `resource` examples:
   *   /chats/getAllMessages           (1h max — needs renewal)
   *   /teams/{id}/channels/{id}/messages
   *   /me/chats/getAllMessages
   * `expirationDateTime` is an ISO string; Graph caps it at ~60 minutes
   * for chat/channel-message resources, so consumers must renew.
   */
  async createSubscription(payload: {
    changeType: 'created' | 'updated' | 'deleted' | string;
    notificationUrl: string;
    resource: string;
    expirationDateTime: string;
    clientState: string;
    includeResourceData?: boolean;
    encryptionCertificate?: string;
    encryptionCertificateId?: string;
  }): Promise<{ id: string; expirationDateTime: string; clientState: string }> {
    return this.req('POST', '/subscriptions', { body: payload });
  }

  async renewSubscription(id: string, expirationDateTime: string): Promise<any> {
    return this.req('PATCH', `/subscriptions/${encodeURIComponent(id)}`, {
      body: { expirationDateTime },
    });
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.req('DELETE', `/subscriptions/${encodeURIComponent(id)}`);
  }
}
