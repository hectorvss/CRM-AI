/**
 * server/integrations/pipedrive.ts
 *
 * Pipedrive REST v1/v2 adapter, scoped to a per-company `api_domain`.
 * Most endpoints are still on v1; some new ones (search, persons, deals)
 * have v2 equivalents — we use v1 throughout for stability.
 */

import { logger } from '../utils/logger.js';

export class PipedriveAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'PipedriveAuthError'; }
}

export interface PipedrivePerson { id: number; name: string; email?: { value: string; primary: boolean }[]; phone?: { value: string }[]; org_id?: number; owner_id?: number; add_time: string; update_time: string }
export interface PipedriveOrg { id: number; name: string; owner_id?: number; address?: string; add_time: string }
export interface PipedriveDeal {
  id: number; title: string; value: number; currency: string;
  status: 'open' | 'won' | 'lost' | 'deleted'; stage_id: number;
  person_id?: { value: number; name: string }; org_id?: { value: number; name: string };
  pipeline_id: number; user_id: { id: number; name: string };
  add_time: string; update_time: string;
}
export interface PipedriveStage { id: number; name: string; pipeline_id: number; order_nr: number }
export interface PipedrivePipeline { id: number; name: string; active: boolean; deal_probability: boolean }
export interface PipedriveActivity { id: number; subject: string; type: string; due_date?: string; due_time?: string; done: boolean; user_id: number; deal_id?: number }
export interface PipedriveWebhook { id: number; event_action: string; event_object: string; subscription_url: string; user_id: number; http_auth_user?: string; add_time: string }

export class PipedriveAdapter {
  constructor(private accessToken: string, public apiDomain: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.apiDomain}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new PipedriveAuthError(`pipedrive ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`pipedrive ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async me(): Promise<{ id: number; name: string; email: string; company_id: number; company_name: string; company_domain: string }> {
    const r = await this.request<{ data: any }>('GET', '/users/me');
    return r.data;
  }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('pipedrive ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Persons ────────────────────────────────────────────────────────────────
  async listPersons(opts: { limit?: number; start?: number } = {}): Promise<PipedrivePerson[]> {
    const r = await this.request<{ data: PipedrivePerson[] | null }>('GET', `/persons?limit=${opts.limit ?? 25}&start=${opts.start ?? 0}`);
    return r.data ?? [];
  }
  async findPersonByEmail(email: string): Promise<PipedrivePerson | null> {
    const r = await this.request<{ data: { items: { item: PipedrivePerson }[] } }>('GET', `/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true&limit=1`);
    return r.data?.items?.[0]?.item ?? null;
  }
  async createPerson(payload: { name: string; email?: string; phone?: string; org_id?: number; owner_id?: number }): Promise<PipedrivePerson> {
    const body: any = { name: payload.name };
    if (payload.email) body.email = [{ value: payload.email, primary: true }];
    if (payload.phone) body.phone = [{ value: payload.phone, primary: true }];
    if (payload.org_id) body.org_id = payload.org_id;
    if (payload.owner_id) body.owner_id = payload.owner_id;
    const r = await this.request<{ data: PipedrivePerson }>('POST', '/persons', body);
    return r.data;
  }
  async updatePerson(id: number, patch: Partial<{ name: string; email: { value: string; primary: boolean }[]; phone: { value: string; primary: boolean }[]; org_id: number; owner_id: number }>): Promise<PipedrivePerson> {
    const r = await this.request<{ data: PipedrivePerson }>('PUT', `/persons/${id}`, patch);
    return r.data;
  }

  // ── Orgs ───────────────────────────────────────────────────────────────────
  async listOrgs(opts: { limit?: number; start?: number } = {}): Promise<PipedriveOrg[]> {
    const r = await this.request<{ data: PipedriveOrg[] | null }>('GET', `/organizations?limit=${opts.limit ?? 25}&start=${opts.start ?? 0}`);
    return r.data ?? [];
  }
  async createOrg(payload: { name: string; owner_id?: number; address?: string }): Promise<PipedriveOrg> {
    const r = await this.request<{ data: PipedriveOrg }>('POST', '/organizations', payload);
    return r.data;
  }

  // ── Deals ──────────────────────────────────────────────────────────────────
  async listDeals(opts: { status?: 'open' | 'won' | 'lost' | 'all_not_deleted'; limit?: number } = {}): Promise<PipedriveDeal[]> {
    const params = new URLSearchParams({ limit: String(opts.limit ?? 25), status: opts.status ?? 'open' });
    const r = await this.request<{ data: PipedriveDeal[] | null }>('GET', `/deals?${params.toString()}`);
    return r.data ?? [];
  }
  async getDeal(id: number): Promise<PipedriveDeal> {
    const r = await this.request<{ data: PipedriveDeal }>('GET', `/deals/${id}`);
    return r.data;
  }
  async createDeal(payload: { title: string; value?: number; currency?: string; person_id?: number; org_id?: number; stage_id?: number; status?: string; owner_id?: number }): Promise<PipedriveDeal> {
    const r = await this.request<{ data: PipedriveDeal }>('POST', '/deals', payload);
    return r.data;
  }
  async updateDeal(id: number, patch: Partial<{ title: string; value: number; status: string; stage_id: number; owner_id: number }>): Promise<PipedriveDeal> {
    const r = await this.request<{ data: PipedriveDeal }>('PUT', `/deals/${id}`, patch);
    return r.data;
  }

  // ── Pipelines + stages ─────────────────────────────────────────────────────
  async listPipelines(): Promise<PipedrivePipeline[]> {
    const r = await this.request<{ data: PipedrivePipeline[] }>('GET', '/pipelines');
    return r.data;
  }
  async listStages(pipelineId?: number): Promise<PipedriveStage[]> {
    const path = pipelineId ? `/stages?pipeline_id=${pipelineId}` : '/stages';
    const r = await this.request<{ data: PipedriveStage[] }>('GET', path);
    return r.data;
  }

  // ── Activities ─────────────────────────────────────────────────────────────
  async createActivity(payload: { subject: string; type?: string; due_date?: string; due_time?: string; deal_id?: number; person_id?: number; org_id?: number; user_id?: number; note?: string }): Promise<PipedriveActivity> {
    const r = await this.request<{ data: PipedriveActivity }>('POST', '/activities', payload);
    return r.data;
  }
  async addNoteToDeal(dealId: number, content: string): Promise<{ id: number }> {
    const r = await this.request<{ data: { id: number } }>('POST', '/notes', { deal_id: dealId, content });
    return r.data;
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  async createWebhook(opts: { url: string; eventAction: string; eventObject: string; httpAuthUser?: string; httpAuthPass?: string }): Promise<PipedriveWebhook> {
    const r = await this.request<{ data: PipedriveWebhook }>('POST', '/webhooks', {
      subscription_url: opts.url,
      event_action: opts.eventAction,
      event_object: opts.eventObject,
      http_auth_user: opts.httpAuthUser,
      http_auth_password: opts.httpAuthPass,
    });
    return r.data;
  }
  async listWebhooks(): Promise<PipedriveWebhook[]> {
    const r = await this.request<{ data: PipedriveWebhook[] }>('GET', '/webhooks');
    return r.data;
  }
  async deleteWebhook(id: number): Promise<void> {
    await this.request('DELETE', `/webhooks/${id}`);
  }
}
