/**
 * server/integrations/front.ts
 *
 * Front API v2 adapter. Used for:
 *  - Identity (`/me`)
 *  - Inboxes / channels listing
 *  - Conversations CRUD
 *  - Messages send/reply
 *  - Webhook (rule) registration
 */

import { FRONT_API_BASE } from './front-oauth.js';
import { logger } from '../utils/logger.js';

export class FrontAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'FrontAuthError'; }
}

export interface FrontIdentity {
  _links: any;
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
}

export interface FrontInbox {
  _links: any;
  id: string;
  name: string;
  is_private: boolean;
  type: string;
}

export interface FrontConversation {
  _links: any;
  id: string;
  subject: string | null;
  status: string;
  assignee?: { id: string; email: string } | null;
  recipient?: { handle: string; role: string };
  tags?: { id: string; name: string }[];
  last_message?: { id: string; body: string; created_at: number };
  created_at: number;
  is_private: boolean;
}

export class FrontAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${FRONT_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      throw new FrontAuthError(`front ${method} ${path} unauthorized (${res.status})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`front ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  async me(): Promise<FrontIdentity> { return this.request('GET', '/me'); }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('front ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Inboxes ────────────────────────────────────────────────────────────────
  async listInboxes(limit = 50): Promise<FrontInbox[]> {
    const r = await this.request<any>('GET', `/inboxes?limit=${limit}`);
    return r?._results ?? [];
  }
  async listChannels(inboxId: string): Promise<any[]> {
    const r = await this.request<any>('GET', `/inboxes/${encodeURIComponent(inboxId)}/channels`);
    return r?._results ?? [];
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  async listConversations(opts: { limit?: number; q?: string } = {}): Promise<FrontConversation[]> {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 25));
    if (opts.q) params.set('q', opts.q);
    const r = await this.request<any>('GET', `/conversations?${params.toString()}`);
    return r?._results ?? [];
  }
  async getConversation(id: string): Promise<FrontConversation> {
    return this.request('GET', `/conversations/${encodeURIComponent(id)}`);
  }
  async listMessages(conversationId: string): Promise<any[]> {
    const r = await this.request<any>('GET', `/conversations/${encodeURIComponent(conversationId)}/messages`);
    return r?._results ?? [];
  }
  async updateConversationStatus(id: string, status: 'archived' | 'open' | 'deleted' | 'spam'): Promise<void> {
    await this.request('PATCH', `/conversations/${encodeURIComponent(id)}`, { status });
  }
  async assignConversation(id: string, teammateId: string | null): Promise<void> {
    await this.request('PATCH', `/conversations/${encodeURIComponent(id)}`, { assignee_id: teammateId });
  }
  async addConversationTag(id: string, tagIds: string[]): Promise<void> {
    await this.request('POST', `/conversations/${encodeURIComponent(id)}/tags`, { tag_ids: tagIds });
  }

  // ── Send / reply ───────────────────────────────────────────────────────────
  async sendReply(conversationId: string, payload: {
    body: string; channelId?: string; subject?: string; quote_body?: string; text_body?: string;
    sender_name?: string; to?: string[]; cc?: string[]; bcc?: string[]; type?: 'reply' | 'reply_all' | 'forward';
  }): Promise<{ message_uid: string }> {
    return this.request('POST', `/conversations/${encodeURIComponent(conversationId)}/messages`, {
      body: payload.body,
      type: payload.type ?? 'reply',
      ...(payload.channelId ? { channel_id: payload.channelId } : {}),
      ...(payload.subject ? { subject: payload.subject } : {}),
      ...(payload.quote_body ? { quote_body: payload.quote_body } : {}),
      ...(payload.text_body ? { text_body: payload.text_body } : {}),
      ...(payload.sender_name ? { sender_name: payload.sender_name } : {}),
      ...(payload.to ? { to: payload.to } : {}),
      ...(payload.cc ? { cc: payload.cc } : {}),
      ...(payload.bcc ? { bcc: payload.bcc } : {}),
    });
  }
  async sendMessage(channelId: string, payload: {
    body: string; subject?: string; to: string[]; cc?: string[]; bcc?: string[];
    sender_name?: string; options?: { tags?: string[]; archive?: boolean };
  }): Promise<{ message_uid: string }> {
    return this.request('POST', `/channels/${encodeURIComponent(channelId)}/messages`, payload);
  }

  // ── Comments (internal notes) ──────────────────────────────────────────────
  async addComment(conversationId: string, body: string): Promise<{ id: string }> {
    return this.request('POST', `/conversations/${encodeURIComponent(conversationId)}/comments`, { body });
  }

  // ── Webhooks (application-level rules) ─────────────────────────────────────
  /**
   * Create an application webhook subscribed to all events.
   * Front webhooks are tied to your **OAuth app**, signed with your app
   * secret. Once registered, all events for installations of this app
   * arrive at the URL.
   */
  async createWebhook(opts: { url: string; events?: string[]; type?: 'app' | 'company' }): Promise<{ id: string; url: string; events: string[] }> {
    const r = await this.request<any>('POST', '/webhooks', {
      url: opts.url,
      events: opts.events,
      type: opts.type ?? 'app',
    });
    return { id: r.id ?? r._links?.self ?? '', url: r.url, events: r.events ?? [] };
  }
  async listWebhooks(): Promise<any[]> {
    const r = await this.request<any>('GET', '/webhooks');
    return r?._results ?? [];
  }
  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', `/webhooks/${encodeURIComponent(id)}`);
  }
}
