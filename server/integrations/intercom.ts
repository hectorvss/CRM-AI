/**
 * server/integrations/intercom.ts
 *
 * Intercom REST adapter. Coverage focused on what the AI agent + inbox
 * pipeline needs to coexist with an Intercom-using merchant:
 *   - Contacts v2.11 (CRUD, search, attach companies, list segments)
 *   - Companies v2.11 (CRUD, list contacts)
 *   - Conversations v2.11 (list, retrieve, reply, assign, snooze, close,
 *     attach contact, run actions)
 *   - Tickets v2.11 (CRUD via Conversations endpoints — Intercom unifies
 *     them under conversations with `ticket_type`)
 *   - Articles (Help Center) — read-only knowledge source for the agent
 *   - Tags / Notes / Events
 *   - Data Attributes schema (read-only)
 *   - Subscription Types (for compliance)
 *   - Webhook subscriptions endpoint (cannot be created via API; managed
 *     in Developer Hub — we surface the URL the merchant must paste)
 *
 * Auth: Bearer <token> + Intercom-Version header.
 *
 * Pagination is cursor-based on most resources — `pages.next.starting_after`.
 *
 * Docs: https://developers.intercom.com/intercom-api-reference/
 */

import { logger } from '../utils/logger.js';
import { INTERCOM_API_BASE, INTERCOM_API_VERSION, type IntercomRegion } from './intercom-oauth.js';

export interface IntercomContact {
  id: string;
  external_id: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: 'user' | 'lead';
  workspace_id: string;
  created_at: number;
  updated_at: number;
  signed_up_at: number | null;
  last_seen_at: number | null;
  custom_attributes: Record<string, unknown>;
  tags: { type: 'list'; data: any[] };
  companies: { type: 'list'; data: any[] };
  notes: { type: 'list'; data: any[] };
  location: any;
}

export interface IntercomConversation {
  id: string;
  type: 'conversation';
  created_at: number;
  updated_at: number;
  state: 'open' | 'closed' | 'snoozed';
  read: boolean;
  priority: 'priority' | 'not_priority';
  admin_assignee_id: string | null;
  team_assignee_id: string | null;
  source: any;
  contacts: { type: 'contact.list'; contacts: Array<{ id: string; external_id?: string }> };
  tags: { type: 'tag.list'; tags: any[] };
  conversation_parts: { type: 'conversation_part.list'; total_count: number; conversation_parts: any[] };
  ticket?: { id: string; type: string; ticket_type: string };
}

export class IntercomAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly region: IntercomRegion = 'us',
  ) {}

  private base(): string { return INTERCOM_API_BASE[this.region]; }

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }): Promise<T> {
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
      'Intercom-Version': INTERCOM_API_VERSION,
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
      let icErrors: any = null;
      let message = text;
      try {
        const j = JSON.parse(text);
        icErrors = j?.errors ?? null;
        message = j?.errors?.[0]?.message ?? j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`intercom ${method} ${path} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      err.statusCode = res.status;
      err.icErrors = icErrors;
      err.icRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ─────────────────────────────────────────────────────

  async me(): Promise<{ type: 'admin'; id: string; email: string; name: string; app: { id_code: string; name: string; region: string } }> {
    return this.req('GET', '/me');
  }

  async ping(): Promise<{ ok: boolean; statusCode?: number; me?: any }> {
    try {
      const m = await this.me();
      return { ok: true, me: m };
    } catch (err: any) {
      logger.warn('intercom ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async getContact(id: string): Promise<IntercomContact> {
    return this.req('GET', `/contacts/${encodeURIComponent(id)}`);
  }

  async createContact(payload: { role?: 'user' | 'lead'; external_id?: string; email?: string; phone?: string; name?: string; avatar?: string; custom_attributes?: Record<string, unknown>; signed_up_at?: number; last_seen_at?: number; owner_id?: number }): Promise<IntercomContact> {
    return this.req('POST', '/contacts', { body: payload });
  }

  async updateContact(id: string, payload: Partial<IntercomContact> & { custom_attributes?: Record<string, unknown> }): Promise<IntercomContact> {
    return this.req('PUT', `/contacts/${encodeURIComponent(id)}`, { body: payload });
  }

  async deleteContact(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.req('DELETE', `/contacts/${encodeURIComponent(id)}`);
  }

  async findContactByEmail(email: string): Promise<IntercomContact | null> {
    const r = await this.req<{ data: IntercomContact[]; total_count: number }>(
      'POST', '/contacts/search',
      { body: { query: { field: 'email', operator: '=', value: email } } },
    );
    return r.data[0] ?? null;
  }

  async findContactByExternalId(externalId: string): Promise<IntercomContact | null> {
    const r = await this.req<{ data: IntercomContact[]; total_count: number }>(
      'POST', '/contacts/search',
      { body: { query: { field: 'external_id', operator: '=', value: externalId } } },
    );
    return r.data[0] ?? null;
  }

  async searchContacts(query: any, opts?: { perPage?: number; startingAfter?: string }): Promise<{ data: IntercomContact[]; total_count: number; pages?: { next?: { starting_after: string } | null } }> {
    return this.req('POST', '/contacts/search', {
      body: { query, pagination: { per_page: opts?.perPage ?? 50, starting_after: opts?.startingAfter } },
    });
  }

  async listContactSegments(contactId: string): Promise<{ data: Array<{ id: string; name: string }> }> {
    return this.req('GET', `/contacts/${encodeURIComponent(contactId)}/segments`);
  }

  async attachContactToCompany(contactId: string, companyId: string): Promise<any> {
    return this.req('POST', `/contacts/${encodeURIComponent(contactId)}/companies`, { body: { id: companyId } });
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async upsertCompany(payload: { company_id: string; name?: string; plan?: string; size?: number; website?: string; industry?: string; custom_attributes?: Record<string, unknown>; remote_created_at?: number }): Promise<any> {
    // Intercom's "create company" endpoint actually upserts by company_id.
    return this.req('POST', '/companies', { body: payload });
  }

  async getCompany(id: string): Promise<any> {
    return this.req('GET', `/companies/${encodeURIComponent(id)}`);
  }

  async listCompanyContacts(id: string, opts?: { perPage?: number; startingAfter?: string }): Promise<{ data: any[]; pages?: any }> {
    return this.req('GET', `/companies/${encodeURIComponent(id)}/contacts`, {
      query: { per_page: opts?.perPage, starting_after: opts?.startingAfter },
    });
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  async listConversations(opts?: { perPage?: number; startingAfter?: string; order?: 'asc' | 'desc' }): Promise<{ conversations: IntercomConversation[]; pages?: { next?: { starting_after: string } | null } }> {
    return this.req('GET', '/conversations', {
      query: { per_page: opts?.perPage ?? 50, starting_after: opts?.startingAfter, order: opts?.order },
    });
  }

  async getConversation(id: string, opts?: { display_as?: 'plaintext' | 'html' }): Promise<IntercomConversation> {
    return this.req('GET', `/conversations/${encodeURIComponent(id)}`, {
      query: { display_as: opts?.display_as },
    });
  }

  async searchConversations(query: any, opts?: { perPage?: number; startingAfter?: string }): Promise<{ conversations: IntercomConversation[]; total_count: number; pages?: any }> {
    return this.req('POST', '/conversations/search', {
      body: { query, pagination: { per_page: opts?.perPage ?? 50, starting_after: opts?.startingAfter } },
    });
  }

  /**
   * Reply to a conversation as an admin or contact. Intercom uses a
   * polymorphic shape — `message_type` + `type` + role-specific id.
   */
  async replyToConversation(conversationId: string, payload: {
    type: 'admin' | 'user';
    message_type: 'comment' | 'note' | 'quick_reply' | 'close' | 'snoozed' | 'open';
    body?: string;
    admin_id?: string;
    user_id?: string;
    intercom_user_id?: string;
    email?: string;
    attachment_urls?: string[];
    reply_options?: Array<{ text: string; uuid: string }>;
  }): Promise<IntercomConversation> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/reply`, { body: payload });
  }

  async assignConversation(conversationId: string, payload: { type: 'admin'; admin_id: string; assignee_id?: string; team_id?: string; body?: string; message_type: 'assignment' }): Promise<IntercomConversation> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/parts`, { body: payload });
  }

  async closeConversation(conversationId: string, adminId: string, body?: string): Promise<IntercomConversation> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/parts`, {
      body: { type: 'admin', admin_id: adminId, message_type: 'close', body },
    });
  }

  async snoozeConversation(conversationId: string, adminId: string, snoozedUntil: number): Promise<IntercomConversation> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/parts`, {
      body: { type: 'admin', admin_id: adminId, message_type: 'snoozed', snoozed_until: snoozedUntil },
    });
  }

  async openConversation(conversationId: string, adminId: string): Promise<IntercomConversation> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/parts`, {
      body: { type: 'admin', admin_id: adminId, message_type: 'open' },
    });
  }

  async attachContactToConversation(conversationId: string, contactId: string, adminId: string): Promise<IntercomConversation> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/customers`, {
      body: { admin_id: adminId, customer: { intercom_user_id: contactId } },
    });
  }

  async runWorkflow(conversationId: string, adminId: string, workflowId: string): Promise<any> {
    return this.req('POST', `/conversations/${encodeURIComponent(conversationId)}/run_assignment_rules`, {
      body: { type: 'admin', admin_id: adminId, workflow_id: workflowId },
    });
  }

  // ── Tickets (a Conversation with ticket_type) ─────────────────────────────

  async listTicketTypes(): Promise<{ data: Array<{ id: string; name: string; description: string; category: 'Customer' | 'Back-office' | 'Tracker' }> }> {
    return this.req('GET', '/ticket_types');
  }

  async createTicket(payload: { ticket_type_id: string; contacts: Array<{ id?: string; email?: string; external_id?: string }>; ticket_attributes?: Record<string, unknown>; assignee_admin_id?: string; created_at?: number }): Promise<any> {
    return this.req('POST', '/tickets', { body: payload });
  }

  async updateTicket(ticketId: string, payload: { state?: 'submitted' | 'in_progress' | 'waiting_on_customer' | 'resolved'; assignee_admin_id?: string; ticket_attributes?: Record<string, unknown>; ticket_state_id?: string }): Promise<any> {
    return this.req('PUT', `/tickets/${encodeURIComponent(ticketId)}`, { body: payload });
  }

  // ── Articles (Help Center) ────────────────────────────────────────────────

  async listArticles(opts?: { perPage?: number; page?: number }): Promise<{ data: any[]; total_count: number; pages?: any }> {
    return this.req('GET', '/articles', {
      query: { per_page: opts?.perPage, page: opts?.page },
    });
  }

  async getArticle(id: string): Promise<any> {
    return this.req('GET', `/articles/${encodeURIComponent(id)}`);
  }

  async searchArticles(query: string): Promise<any> {
    return this.req('GET', `/articles/search`, { query: { phrase: query } });
  }

  // ── Tags / Notes / Events ────────────────────────────────────────────────

  async listTags(): Promise<{ data: Array<{ id: string; name: string }> }> {
    return this.req('GET', '/tags');
  }

  async tagContact(contactId: string, tagId: string): Promise<any> {
    return this.req('POST', `/contacts/${encodeURIComponent(contactId)}/tags`, { body: { id: tagId } });
  }

  async addNoteToContact(contactId: string, body: string, adminId?: string): Promise<any> {
    return this.req('POST', `/contacts/${encodeURIComponent(contactId)}/notes`, { body: { contact_id: contactId, admin_id: adminId, body } });
  }

  async submitEvent(payload: { event_name: string; created_at: number; user_id?: string; email?: string; intercom_user_id?: string; metadata?: Record<string, unknown> }): Promise<any> {
    return this.req('POST', '/events', { body: payload });
  }

  // ── Data attributes (schema) ─────────────────────────────────────────────

  async listDataAttributes(model: 'contact' | 'company' | 'conversation' = 'contact', includeArchived = false): Promise<{ data: Array<{ name: string; type: string; data_type: string; full_name: string; label: string; archived: boolean; custom: boolean }> }> {
    return this.req('GET', '/data_attributes', { query: { model, include_archived: includeArchived } });
  }

  // ── Admins ───────────────────────────────────────────────────────────────

  async listAdmins(): Promise<{ type: 'admin.list'; admins: Array<{ id: string; type: string; email: string; name: string; job_title?: string; away_mode_enabled?: boolean }> }> {
    return this.req('GET', '/admins');
  }

  // ── Subscription types ───────────────────────────────────────────────────

  async listSubscriptionTypes(): Promise<{ type: 'list'; data: Array<{ id: string; type: string; name: string; description: string; consent_type: 'opt_in' | 'opt_out'; default_translation: { name: string; description: string; locale: string }; translations: any[] }> }> {
    return this.req('GET', '/subscription_types');
  }
}
