/**
 * server/integrations/mailchimp.ts
 *
 * Mailchimp Marketing API v3 adapter, scoped to the per-account api_endpoint.
 */

import { logger } from '../utils/logger.js';

export class MailchimpAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'MailchimpAuthError'; }
}

export interface MailchimpList { id: string; name: string; web_id: number; stats: { member_count: number; total_contacts: number }; date_created: string }
export interface MailchimpMember { id: string; email_address: string; status: string; merge_fields?: Record<string, any>; tags?: { id: number; name: string }[]; last_changed?: string; ip_signup?: string }
export interface MailchimpCampaign { id: string; web_id: number; type: string; status: string; emails_sent?: number; send_time?: string; settings: { subject_line?: string; title?: string; from_name?: string; reply_to?: string; folder_id?: string } }
export interface MailchimpWebhook { id: string; url: string; events: Record<string, boolean>; sources: Record<string, boolean>; list_id: string }

export class MailchimpAdapter {
  constructor(private accessToken: string, public apiEndpoint: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiEndpoint}/3.0${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new MailchimpAuthError(`mailchimp ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`mailchimp ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('GET', '/ping'); return { ok: true }; }
    catch (err) { logger.warn('mailchimp ping failed', { error: String(err) }); return { ok: false }; }
  }

  async account(): Promise<{ account_id: string; account_name: string; email: string; total_subscribers: number }> {
    return this.request('GET', '/');
  }

  // ── Lists (audiences) ──────────────────────────────────────────────────────
  async listLists(opts: { count?: number; offset?: number } = {}): Promise<MailchimpList[]> {
    const r = await this.request<{ lists: MailchimpList[] }>('GET', `/lists?count=${opts.count ?? 25}&offset=${opts.offset ?? 0}`);
    return r.lists;
  }
  async getList(listId: string): Promise<MailchimpList> {
    return this.request<MailchimpList>('GET', `/lists/${encodeURIComponent(listId)}`);
  }

  // ── Members ────────────────────────────────────────────────────────────────
  /** Find-or-create member. Mailchimp uses MD5(lowercased email) as the member id, but we can PUT directly to upsert. */
  async upsertMember(listId: string, payload: { email: string; status?: 'subscribed' | 'unsubscribed' | 'pending' | 'transactional'; merge_fields?: Record<string, any>; tags?: string[] }): Promise<MailchimpMember> {
    const subscriberHash = await md5Hex(payload.email.toLowerCase());
    return this.request<MailchimpMember>('PUT', `/lists/${encodeURIComponent(listId)}/members/${subscriberHash}`, {
      email_address: payload.email,
      status_if_new: payload.status ?? 'subscribed',
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.merge_fields ? { merge_fields: payload.merge_fields } : {}),
      ...(payload.tags ? { tags: payload.tags } : {}),
    });
  }
  async addTagToMember(listId: string, email: string, tag: string): Promise<void> {
    const subscriberHash = await md5Hex(email.toLowerCase());
    await this.request('POST', `/lists/${encodeURIComponent(listId)}/members/${subscriberHash}/tags`, {
      tags: [{ name: tag, status: 'active' }],
    });
  }
  async unsubscribeMember(listId: string, email: string): Promise<void> {
    const subscriberHash = await md5Hex(email.toLowerCase());
    await this.request('PATCH', `/lists/${encodeURIComponent(listId)}/members/${subscriberHash}`, { status: 'unsubscribed' });
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────
  async listCampaigns(opts: { count?: number; status?: string } = {}): Promise<MailchimpCampaign[]> {
    const params = new URLSearchParams({ count: String(opts.count ?? 10) });
    if (opts.status) params.set('status', opts.status);
    const r = await this.request<{ campaigns: MailchimpCampaign[] }>('GET', `/campaigns?${params.toString()}`);
    return r.campaigns;
  }

  // ── Webhooks (per-list) ────────────────────────────────────────────────────
  async createWebhook(listId: string, opts: { url: string; events?: Partial<Record<'subscribe' | 'unsubscribe' | 'profile' | 'cleaned' | 'upemail' | 'campaign', boolean>>; sources?: Partial<Record<'user' | 'admin' | 'api', boolean>> }): Promise<MailchimpWebhook> {
    return this.request('POST', `/lists/${encodeURIComponent(listId)}/webhooks`, {
      url: opts.url,
      events: opts.events ?? { subscribe: true, unsubscribe: true, profile: true, cleaned: true, upemail: true, campaign: true },
      sources: opts.sources ?? { user: true, admin: true, api: false },
    });
  }
  async listWebhooks(listId: string): Promise<MailchimpWebhook[]> {
    const r = await this.request<{ webhooks: MailchimpWebhook[] }>('GET', `/lists/${encodeURIComponent(listId)}/webhooks`);
    return r.webhooks;
  }
  async deleteWebhook(listId: string, webhookId: string): Promise<void> {
    await this.request('DELETE', `/lists/${encodeURIComponent(listId)}/webhooks/${encodeURIComponent(webhookId)}`);
  }
}

async function md5Hex(input: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('md5').update(input).digest('hex');
}
