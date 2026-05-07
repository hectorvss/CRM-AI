/**
 * server/integrations/freshdesk.ts
 *
 * Freshdesk REST API v2 adapter.
 *
 * Auth: HTTP Basic — Base64(`${apiKey}:X`) sent as the Authorization header.
 * Base URL: https://${subdomain}.freshdesk.com/api/v2
 *
 * Ticket status codes:  2=Open  3=Pending  4=Resolved  5=Closed
 * Priority codes:       1=Low   2=Medium   3=High      4=Urgent
 *
 * Docs: https://developers.freshdesk.com/api/
 */

export interface FreshdeskAgentMe {
  id: number;
  name: string | null;
  email: string | null;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
    mobile?: string;
  };
}

export interface FreshdeskTicket {
  id: number;
  subject: string;
  description?: string;
  description_text?: string;
  status: number;
  priority: number;
  type?: string | null;
  tags?: string[];
  source?: number;
  requester_id?: number;
  responder_id?: number;
  group_id?: number | null;
  created_at?: string;
  updated_at?: string;
  due_by?: string | null;
  conversations?: FreshdeskConversation[];
  requester?: FreshdeskContact;
  stats?: Record<string, unknown>;
}

export interface FreshdeskConversation {
  id: number;
  body: string;
  body_text?: string;
  incoming: boolean;
  private: boolean;
  created_at: string;
  updated_at: string;
  from_email?: string;
  to_emails?: string[];
  cc_emails?: string[];
  attachments?: unknown[];
}

export interface FreshdeskContact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  company_id?: number | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface FreshdeskSearchResult {
  results: FreshdeskContact[];
  total: number;
}

export interface FreshdeskAgent {
  id: number;
  available: boolean;
  contact: {
    name: string;
    email: string;
    phone?: string | null;
    mobile?: string | null;
  };
  role_ids?: number[];
  group_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface FreshdeskNote {
  id: number;
  body: string;
  body_text?: string;
  private: boolean;
  ticket_id: number;
  created_at: string;
  updated_at: string;
}

export interface FreshdeskReply {
  id: number;
  body: string;
  body_text?: string;
  ticket_id: number;
  created_at: string;
  updated_at: string;
}

export class FreshdeskAdapter {
  private readonly baseUrl: string;
  private readonly auth: string;

  constructor(private readonly subdomain: string, apiKey: string) {
    this.baseUrl = `https://${subdomain}.freshdesk.com/api/v2`;
    // HTTP Basic: apiKey as username, 'X' as password (Freshdesk convention)
    this.auth = Buffer.from(`${apiKey}:X`).toString('base64');
  }

  // ── Private HTTP helper ──────────────────────────────────────────────────

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Basic ${this.auth}`,
      'Content-Type': 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Freshdesk ${method} ${path} ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Agent ────────────────────────────────────────────────────────────────

  /** GET /agents/me — current authenticated agent */
  async getAgent(): Promise<FreshdeskAgentMe> {
    return this.req<FreshdeskAgentMe>('GET', '/agents/me');
  }

  /** GET /agents — list all agents */
  async listAgents(): Promise<FreshdeskAgent[]> {
    return this.req<FreshdeskAgent[]>('GET', '/agents');
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  /** GET /tickets — list tickets with optional filters */
  async listTickets(params?: {
    page?: number;
    per_page?: number;
    filter?: string;
    order_by?: string;
    order_type?: 'asc' | 'desc';
  }): Promise<FreshdeskTicket[]> {
    const qs = new URLSearchParams();
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.per_page !== undefined) qs.set('per_page', String(params.per_page));
    if (params?.filter) qs.set('filter', params.filter);
    if (params?.order_by) qs.set('order_by', params.order_by);
    if (params?.order_type) qs.set('order_type', params.order_type);
    const query = qs.toString();
    return this.req<FreshdeskTicket[]>('GET', `/tickets${query ? `?${query}` : ''}`);
  }

  /** GET /tickets/:id?include=conversations,requester,stats */
  async getTicket(id: number): Promise<FreshdeskTicket> {
    return this.req<FreshdeskTicket>('GET', `/tickets/${id}?include=conversations,requester,stats`);
  }

  /** POST /tickets — create a new ticket */
  async createTicket(params: {
    subject: string;
    description: string;
    email?: string;
    requester_id?: number;
    status?: number;
    priority?: number;
    type?: string;
    tags?: string[];
    source?: number;
  }): Promise<FreshdeskTicket> {
    return this.req<FreshdeskTicket>('POST', '/tickets', params);
  }

  /** PUT /tickets/:id — update ticket fields */
  async updateTicket(
    id: number,
    params: Partial<{
      status: number;
      priority: number;
      assignee_id: number;
      tags: string[];
      type: string;
      group_id: number;
    }>,
  ): Promise<FreshdeskTicket> {
    return this.req<FreshdeskTicket>('PUT', `/tickets/${id}`, params);
  }

  // ── Conversations ────────────────────────────────────────────────────────

  /** POST /tickets/:id/notes — add a private or public note */
  async addNote(ticketId: number, body: string, isPrivate = false): Promise<FreshdeskNote> {
    return this.req<FreshdeskNote>('POST', `/tickets/${ticketId}/notes`, {
      body,
      private: isPrivate,
    });
  }

  /** POST /tickets/:id/reply — add a reply (sent to requester) */
  async addReply(ticketId: number, body: string, ccEmails?: string[]): Promise<FreshdeskReply> {
    return this.req<FreshdeskReply>('POST', `/tickets/${ticketId}/reply`, {
      body,
      ...(ccEmails && ccEmails.length ? { cc_emails: ccEmails } : {}),
    });
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  /** GET /contacts/:id */
  async getContact(id: number): Promise<FreshdeskContact> {
    return this.req<FreshdeskContact>('GET', `/contacts/${id}`);
  }

  /**
   * GET /search/contacts?query="..."
   * Freshdesk requires the query value to be wrapped in double quotes.
   */
  async searchContacts(query: string): Promise<FreshdeskSearchResult> {
    const encoded = encodeURIComponent(`"${query}"`);
    return this.req<FreshdeskSearchResult>('GET', `/search/contacts?query=${encoded}`);
  }

  /** POST /contacts — create a new contact */
  async createContact(params: {
    name: string;
    email?: string;
    phone?: string;
    mobile?: string;
    company_id?: number;
    tags?: string[];
  }): Promise<FreshdeskContact> {
    return this.req<FreshdeskContact>('POST', '/contacts', params);
  }

  /** PUT /contacts/:id — update contact fields */
  async updateContact(
    id: number,
    params: Partial<{
      name: string;
      email: string;
      phone: string;
      tags: string[];
    }>,
  ): Promise<FreshdeskContact> {
    return this.req<FreshdeskContact>('PUT', `/contacts/${id}`, params);
  }
}
