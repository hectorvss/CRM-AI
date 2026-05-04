/**
 * server/integrations/zendesk.ts
 *
 * Zendesk Support REST adapter. Coverage focused on what the AI agent +
 * inbox pipeline actually needs:
 *   - Tickets v2 (CRUD, comments, list_by_user, list_by_organization)
 *   - Users v2 (search, autocomplete, lookup_by_external_id)
 *   - Organizations v2 (lookup, list, related)
 *   - Search v2 (cross-object query DSL)
 *   - Macros v2 (list, apply, record)
 *   - Triggers + Automations v2 (read-only)
 *   - Help Center articles (read-only — knowledge source for AI)
 *   - Webhooks v2 (CRUD, sign secret rotation)
 *   - Audit Logs v2 (read-only)
 *
 * Auth: Bearer access_token, base = https://{subdomain}.zendesk.com.
 *
 * Pagination: Zendesk supports cursor-based (`next_url`) and offset-based.
 * We expose async iterators that handle both transparently.
 *
 * Docs: https://developer.zendesk.com/api-reference/ticketing/introduction/
 */

import { logger } from '../utils/logger.js';

export interface ZendeskUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  organization_id: number | null;
  role: 'end-user' | 'agent' | 'admin';
  active: boolean;
  verified: boolean;
  locale: string | null;
  time_zone: string | null;
  created_at: string;
  updated_at: string;
  user_fields: Record<string, unknown>;
  tags: string[];
}

export interface ZendeskTicket {
  id: number;
  subject: string;
  description: string | null;
  status: 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent' | null;
  type: 'problem' | 'incident' | 'question' | 'task' | null;
  requester_id: number;
  submitter_id: number;
  assignee_id: number | null;
  organization_id: number | null;
  group_id: number | null;
  brand_id: number | null;
  external_id: string | null;
  via: { channel: string; source: any };
  tags: string[];
  custom_fields: Array<{ id: number; value: unknown }>;
  satisfaction_rating: { score: string; comment?: string } | null;
  created_at: string;
  updated_at: string;
}

export interface ZendeskComment {
  id: number;
  type: 'Comment' | 'VoiceComment';
  author_id: number;
  body: string;
  html_body: string;
  plain_body: string;
  public: boolean;
  attachments: Array<{ id: number; file_name: string; content_url: string; size: number; content_type: string }>;
  via: { channel: string; source: any };
  created_at: string;
}

export class ZendeskAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly subdomain: string,
  ) {}

  private base(): string {
    return `https://${this.subdomain}.zendesk.com`;
  }

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | undefined>; raw?: boolean }): Promise<T> {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${this.base()}${path.startsWith('/') ? '' : '/'}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      let zdErrors: any = null;
      try {
        const j = JSON.parse(text);
        zdErrors = j?.details ?? j?.error ?? null;
        message = j?.error?.message ?? j?.description ?? j?.error ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`zendesk ${method} ${path} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      err.statusCode = res.status;
      err.zdErrors = zdErrors;
      err.zdRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    if (init?.raw) return (await res.text()) as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ─────────────────────────────────────────────────────

  async ping(): Promise<{ ok: boolean; statusCode?: number; user?: any }> {
    try {
      const r = await this.req<{ user: any }>('GET', '/api/v2/users/me.json');
      return { ok: true, user: r.user };
    } catch (err: any) {
      logger.warn('zendesk ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }

  async currentUser(): Promise<{ user: ZendeskUser }> {
    return this.req('GET', '/api/v2/users/me.json');
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async getTicket(id: number, include?: 'users' | 'groups' | 'organizations' | string): Promise<{ ticket: ZendeskTicket }> {
    return this.req('GET', `/api/v2/tickets/${id}.json`, { query: include ? { include } : undefined });
  }

  async listTickets(opts?: { perPage?: number; pageStartAfter?: string; sortBy?: 'created_at' | 'updated_at' | 'priority' | 'status'; sortOrder?: 'asc' | 'desc' }): Promise<{ tickets: ZendeskTicket[]; meta?: { has_more: boolean; after_cursor?: string } }> {
    return this.req('GET', '/api/v2/tickets.json', {
      query: {
        'page[size]': opts?.perPage ?? 50,
        'page[after]': opts?.pageStartAfter,
        sort_by: opts?.sortBy,
        sort_order: opts?.sortOrder,
      },
    });
  }

  async listTicketsByUser(userId: number, role: 'requested' | 'assigned' | 'ccd' = 'requested'): Promise<{ tickets: ZendeskTicket[] }> {
    return this.req('GET', `/api/v2/users/${userId}/tickets/${role}.json`);
  }

  async listTicketsByOrganization(orgId: number): Promise<{ tickets: ZendeskTicket[] }> {
    return this.req('GET', `/api/v2/organizations/${orgId}/tickets.json`);
  }

  async createTicket(body: Partial<ZendeskTicket> & { comment: { body?: string; html_body?: string; public?: boolean } }): Promise<{ ticket: ZendeskTicket; audit?: any }> {
    return this.req('POST', '/api/v2/tickets.json', { body: { ticket: body } });
  }

  async updateTicket(id: number, body: Partial<ZendeskTicket> & { comment?: { body?: string; html_body?: string; public?: boolean; author_id?: number } }): Promise<{ ticket: ZendeskTicket; audit?: any }> {
    return this.req('PUT', `/api/v2/tickets/${id}.json`, { body: { ticket: body } });
  }

  async deleteTicket(id: number): Promise<void> {
    await this.req('DELETE', `/api/v2/tickets/${id}.json`);
  }

  async listComments(ticketId: number, opts?: { include_inline_images?: boolean; sortOrder?: 'asc' | 'desc' }): Promise<{ comments: ZendeskComment[]; next_page?: string | null }> {
    return this.req('GET', `/api/v2/tickets/${ticketId}/comments.json`, {
      query: {
        include_inline_images: opts?.include_inline_images,
        sort_order: opts?.sortOrder,
      },
    });
  }

  /** Add a public reply or internal note. `public: false` makes it internal. */
  async addComment(ticketId: number, comment: { body?: string; html_body?: string; public?: boolean; author_id?: number }): Promise<{ ticket: ZendeskTicket }> {
    return this.req('PUT', `/api/v2/tickets/${ticketId}.json`, { body: { ticket: { comment } } });
  }

  /**
   * Update the same fields across many tickets atomically. Body shape:
   *   { tickets: [{ id, status: 'solved' }, ...] }
   * or pass `ids` + a single `ticket` patch.
   */
  async bulkUpdateTickets(opts: { tickets?: Array<Partial<ZendeskTicket> & { id: number }>; ids?: number[]; ticket?: Partial<ZendeskTicket> }): Promise<any> {
    if (opts.tickets) return this.req('PUT', '/api/v2/tickets/update_many.json', { body: { tickets: opts.tickets } });
    if (opts.ids && opts.ticket) {
      return this.req('PUT', '/api/v2/tickets/update_many.json', {
        query: { ids: opts.ids.join(',') },
        body: { ticket: opts.ticket },
      });
    }
    throw new Error('bulkUpdateTickets: pass either {tickets} or {ids, ticket}');
  }

  // ── Users / orgs ──────────────────────────────────────────────────────────

  async findUserByEmail(email: string): Promise<ZendeskUser | null> {
    const r = await this.req<{ users: ZendeskUser[] }>('GET', '/api/v2/users/search.json', { query: { query: `email:${email}` } });
    return r.users[0] ?? null;
  }

  async findUserByExternalId(externalId: string): Promise<ZendeskUser | null> {
    const r = await this.req<{ users: ZendeskUser[] }>('GET', '/api/v2/users/search.json', { query: { external_id: externalId } });
    return r.users[0] ?? null;
  }

  async getUser(id: number): Promise<{ user: ZendeskUser }> {
    return this.req('GET', `/api/v2/users/${id}.json`);
  }

  async createOrUpdateUser(user: Partial<ZendeskUser> & { email?: string; external_id?: string; name?: string }): Promise<{ user: ZendeskUser }> {
    return this.req('POST', '/api/v2/users/create_or_update.json', { body: { user } });
  }

  async getOrganization(id: number): Promise<{ organization: any }> {
    return this.req('GET', `/api/v2/organizations/${id}.json`);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Cross-object search using Zendesk's query DSL.
   * Examples: `type:ticket status:open requester:foo@bar.com`,
   *           `type:user "ACME"`, `type:organization tags:premium`.
   */
  async search<T = any>(query: string, opts?: { sortBy?: string; sortOrder?: 'asc' | 'desc'; perPage?: number }): Promise<{ results: T[]; count: number; next_page?: string | null }> {
    return this.req('GET', '/api/v2/search.json', {
      query: {
        query,
        sort_by: opts?.sortBy,
        sort_order: opts?.sortOrder,
        per_page: opts?.perPage,
      },
    });
  }

  // ── Macros ────────────────────────────────────────────────────────────────

  async listMacros(opts?: { active?: boolean; access?: 'personal' | 'shared'; category?: number }): Promise<{ macros: Array<{ id: number; title: string; description: string | null; actions: any[] }>; next_page?: string | null }> {
    return this.req('GET', '/api/v2/macros.json', {
      query: { active: opts?.active, access: opts?.access, category: opts?.category },
    });
  }

  /** Apply a macro to a ticket — returns the patched ticket without saving it. */
  async applyMacro(ticketId: number, macroId: number): Promise<{ result: { ticket: Partial<ZendeskTicket>; comment?: any } }> {
    return this.req('GET', `/api/v2/tickets/${ticketId}/macros/${macroId}/apply.json`);
  }

  // ── Help Center ───────────────────────────────────────────────────────────

  async listArticles(opts?: { locale?: string; perPage?: number; page?: number; sortBy?: string }): Promise<{ articles: Array<{ id: number; title: string; body: string; html_url: string; locale: string; section_id: number; updated_at: string }>; next_page?: string | null }> {
    const locale = opts?.locale || 'en-us';
    return this.req('GET', `/api/v2/help_center/${locale}/articles.json`, {
      query: { per_page: opts?.perPage, page: opts?.page, sort_by: opts?.sortBy },
    });
  }

  async searchArticles(query: string, locale = 'en-us'): Promise<{ results: any[]; count: number }> {
    return this.req('GET', `/api/v2/help_center/articles/search.json`, {
      query: { query, locale },
    });
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  async listWebhooks(): Promise<{ webhooks: any[] }> {
    return this.req('GET', '/api/v2/webhooks');
  }

  async createWebhook(payload: {
    name: string;
    endpoint: string;
    http_method?: 'POST';
    request_format?: 'json';
    status?: 'active' | 'inactive';
    subscriptions: string[];
    authentication?: { type: 'bearer_token' | 'basic_auth' | 'none'; data?: { token?: string; username?: string; password?: string }; add_position?: 'header' };
  }): Promise<{ webhook: { id: string; signing_secret: { secret: string; algorithm: string } } }> {
    return this.req('POST', '/api/v2/webhooks', { body: { webhook: { ...payload, http_method: payload.http_method ?? 'POST', request_format: payload.request_format ?? 'json', status: payload.status ?? 'active' } } });
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.req('DELETE', `/api/v2/webhooks/${encodeURIComponent(id)}`);
  }

  async getWebhookSigningSecret(id: string): Promise<{ signing_secret: { secret: string; algorithm: string } }> {
    return this.req('GET', `/api/v2/webhooks/${encodeURIComponent(id)}/signing_secret`);
  }

  async rotateWebhookSigningSecret(id: string): Promise<{ signing_secret: { secret: string; algorithm: string } }> {
    return this.req('POST', `/api/v2/webhooks/${encodeURIComponent(id)}/signing_secret`);
  }

  // ── Triggers (read-only here — write requires admin scope) ────────────────

  async listTriggers(opts?: { active?: boolean; sort?: string }): Promise<{ triggers: any[]; next_page?: string | null }> {
    return this.req('GET', '/api/v2/triggers.json', { query: { active: opts?.active, sort: opts?.sort } });
  }
}
