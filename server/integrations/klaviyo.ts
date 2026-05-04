/**
 * server/integrations/klaviyo.ts
 *
 * Klaviyo API adapter (revision 2024-10-15). All endpoints require the
 * `revision` header. Uses JSON:API style payloads.
 */

import { KLAVIYO_API_BASE, KLAVIYO_API_REVISION } from './klaviyo-oauth.js';
import { logger } from '../utils/logger.js';

export class KlaviyoAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'KlaviyoAuthError'; }
}

export interface KlaviyoProfile { type: 'profile'; id: string; attributes: { email?: string; phone_number?: string; first_name?: string; last_name?: string; properties?: Record<string, unknown>; created?: string; updated?: string } }
export interface KlaviyoList { type: 'list'; id: string; attributes: { name: string; created?: string; updated?: string } }
export interface KlaviyoEvent { type: 'event'; id: string; attributes: { metric_id?: string; properties?: Record<string, unknown>; datetime: string } }
export interface KlaviyoWebhook { type: 'webhook'; id: string; attributes: { endpoint_url: string; name: string; description?: string; secret_key?: string; enabled: boolean } }

export class KlaviyoAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${KLAVIYO_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.api+json',
        revision: KLAVIYO_API_REVISION,
        ...(body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new KlaviyoAuthError(`klaviyo ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`klaviyo ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('GET', '/lists/?page[size]=1'); return { ok: true }; }
    catch (err) { logger.warn('klaviyo ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Profiles (subscribers) ─────────────────────────────────────────────────
  async upsertProfile(email: string, attrs: { phone?: string; firstName?: string; lastName?: string; properties?: Record<string, unknown> } = {}): Promise<KlaviyoProfile> {
    const payload = {
      data: {
        type: 'profile',
        attributes: {
          email,
          ...(attrs.phone ? { phone_number: attrs.phone } : {}),
          ...(attrs.firstName ? { first_name: attrs.firstName } : {}),
          ...(attrs.lastName ? { last_name: attrs.lastName } : {}),
          ...(attrs.properties ? { properties: attrs.properties } : {}),
        },
      },
    };
    const r = await this.request<{ data: KlaviyoProfile }>('POST', '/profile-import/', payload);
    return r.data;
  }

  async findProfileByEmail(email: string): Promise<KlaviyoProfile | null> {
    const filter = `equals(email,"${email.replace(/"/g, '\\"')}")`;
    const r = await this.request<{ data: KlaviyoProfile[] }>('GET', `/profiles/?filter=${encodeURIComponent(filter)}`);
    return r.data?.[0] ?? null;
  }

  // ── Lists ──────────────────────────────────────────────────────────────────
  async listLists(pageSize = 50): Promise<KlaviyoList[]> {
    const r = await this.request<{ data: KlaviyoList[] }>('GET', `/lists/?page[size]=${pageSize}`);
    return r.data;
  }

  async addProfileToList(listId: string, profileId: string): Promise<void> {
    await this.request('POST', `/lists/${encodeURIComponent(listId)}/relationships/profiles/`, { data: [{ type: 'profile', id: profileId }] });
  }

  async removeProfileFromList(listId: string, profileId: string): Promise<void> {
    await this.request('DELETE', `/lists/${encodeURIComponent(listId)}/relationships/profiles/`, { data: [{ type: 'profile', id: profileId }] });
  }

  // ── Subscriptions (consent) ────────────────────────────────────────────────
  async subscribeProfileToList(listId: string, email: string, opts: { phone?: string; sms?: boolean; email?: boolean } = {}): Promise<void> {
    const subscriptions: any = {};
    if (opts.email !== false) subscriptions.email = { marketing: { consent: 'SUBSCRIBED' } };
    if (opts.sms && opts.phone) subscriptions.sms = { marketing: { consent: 'SUBSCRIBED' } };
    await this.request('POST', '/profile-subscription-bulk-create-jobs/', {
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: { profiles: { data: [{ type: 'profile', attributes: { email, ...(opts.phone ? { phone_number: opts.phone } : {}), subscriptions } }] } },
        relationships: { list: { data: { type: 'list', id: listId } } },
      },
    });
  }

  // ── Events (track activity) ────────────────────────────────────────────────
  async trackEvent(payload: { metric: string; profileEmail: string; properties?: Record<string, unknown>; time?: string; uniqueId?: string; value?: number }): Promise<void> {
    await this.request('POST', '/events/', {
      data: {
        type: 'event',
        attributes: {
          properties: payload.properties ?? {},
          ...(payload.time ? { time: payload.time } : {}),
          ...(payload.uniqueId ? { unique_id: payload.uniqueId } : {}),
          ...(payload.value !== undefined ? { value: payload.value } : {}),
          metric: { data: { type: 'metric', attributes: { name: payload.metric } } },
          profile: { data: { type: 'profile', attributes: { email: payload.profileEmail } } },
        },
      },
    });
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  async createWebhook(opts: { url: string; name: string; topics: string[]; secret?: string }): Promise<KlaviyoWebhook> {
    const r = await this.request<{ data: KlaviyoWebhook }>('POST', '/webhooks/', {
      data: {
        type: 'webhook',
        attributes: {
          endpoint_url: opts.url,
          name: opts.name,
          enabled: true,
          ...(opts.secret ? { secret_key: opts.secret } : {}),
        },
        relationships: {
          'webhook-topics': { data: opts.topics.map(t => ({ type: 'webhook-topic', id: t })) },
        },
      },
    });
    return r.data;
  }
  async listWebhooks(): Promise<KlaviyoWebhook[]> {
    const r = await this.request<{ data: KlaviyoWebhook[] }>('GET', '/webhooks/');
    return r.data;
  }
  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', `/webhooks/${encodeURIComponent(id)}`);
  }
}
