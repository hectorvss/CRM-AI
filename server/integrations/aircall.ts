/**
 * server/integrations/aircall.ts
 *
 * Aircall API v1 adapter. Used for:
 *  - Identity (`/integrations/me`)
 *  - Numbers / users listing
 *  - Calls (with recordings + transcripts when available)
 *  - Webhook registration
 */

import { AIRCALL_API_BASE } from './aircall-oauth.js';
import { logger } from '../utils/logger.js';

export class AircallAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'AircallAuthError'; }
}

export interface AircallNumber {
  id: number;
  direct_link: string;
  digits: string;
  name: string;
  country: string;
  created_at: string;
  is_ivr: boolean;
}

export interface AircallUser {
  id: number;
  direct_link: string;
  email: string;
  name: string;
  available: boolean;
  numbers?: AircallNumber[];
}

export interface AircallCall {
  id: number;
  direct_link: string;
  direction: 'inbound' | 'outbound';
  status: 'initial' | 'answered' | 'done';
  missed_call_reason?: string;
  started_at: number;
  answered_at?: number | null;
  ended_at?: number | null;
  duration?: number;
  voicemail?: string | null;
  recording?: string | null;
  asset?: string | null;
  raw_digits?: string;
  number?: AircallNumber;
  user?: AircallUser;
  contact?: { id: number; first_name?: string; last_name?: string; phone_numbers?: { value: string }[] };
  participants?: { type: string; phone_number?: string; name?: string }[];
}

export interface AircallWebhook {
  webhook_id: string;
  direct_link: string;
  url: string;
  events: string[];
  active: boolean;
  token: string;
  created_at: string;
}

export class AircallAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${AIRCALL_API_BASE}${path}`;
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
      throw new AircallAuthError(`aircall ${method} ${path} unauthorized (${res.status})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`aircall ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  async me(): Promise<{ integration: { id: number; name: string; company_id?: number; company_name?: string } }> {
    return this.request('GET', '/integrations/me');
  }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('aircall ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Numbers / users ────────────────────────────────────────────────────────
  async listNumbers(opts: { perPage?: number } = {}): Promise<AircallNumber[]> {
    const r = await this.request<any>('GET', `/numbers?per_page=${opts.perPage ?? 50}`);
    return r?.numbers ?? [];
  }
  async listUsers(opts: { perPage?: number } = {}): Promise<AircallUser[]> {
    const r = await this.request<any>('GET', `/users?per_page=${opts.perPage ?? 50}`);
    return r?.users ?? [];
  }

  // ── Calls ──────────────────────────────────────────────────────────────────
  async listCalls(opts: { perPage?: number; from?: number; to?: number; direction?: 'inbound' | 'outbound' } = {}): Promise<AircallCall[]> {
    const params = new URLSearchParams();
    params.set('per_page', String(opts.perPage ?? 25));
    params.set('order', 'desc');
    if (opts.from) params.set('from', String(opts.from));
    if (opts.to) params.set('to', String(opts.to));
    if (opts.direction) params.set('direction', opts.direction);
    const r = await this.request<any>('GET', `/calls?${params.toString()}`);
    return r?.calls ?? [];
  }
  async getCall(id: number): Promise<AircallCall> {
    const r = await this.request<any>('GET', `/calls/${id}`);
    return r?.call ?? r;
  }
  async getCallTranscript(id: number): Promise<any> {
    return this.request('GET', `/calls/${id}/transcription`);
  }
  async addCallTag(id: number, tags: string[]): Promise<void> {
    await this.request('POST', `/calls/${id}/tags`, { tags });
  }
  async addCallComment(id: number, content: string): Promise<void> {
    await this.request('POST', `/calls/${id}/comments`, { content });
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  async searchContact(phoneNumber: string): Promise<any[]> {
    const r = await this.request<any>('GET', `/contacts/search?phone_number=${encodeURIComponent(phoneNumber)}`);
    return r?.contacts ?? [];
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  async createWebhook(opts: { url: string; events: string[] }): Promise<AircallWebhook> {
    const r = await this.request<any>('POST', '/webhooks', { url: opts.url, events: opts.events });
    return r?.webhook ?? r;
  }
  async listWebhooks(): Promise<AircallWebhook[]> {
    const r = await this.request<any>('GET', '/webhooks?per_page=50');
    return r?.webhooks ?? [];
  }
  async deleteWebhook(id: string): Promise<void> {
    await this.request('DELETE', `/webhooks/${encodeURIComponent(id)}`);
  }
}
