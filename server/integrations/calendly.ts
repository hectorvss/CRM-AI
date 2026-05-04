/**
 * server/integrations/calendly.ts
 *
 * Calendly v2 REST adapter. Coverage focused on what the AI agent needs
 * to offer "book a slot" / "reschedule" mid-conversation:
 *   - Users / organizations (current_user, get user)
 *   - Event types (list active types for an org or user)
 *   - Scheduled events (list, retrieve, cancel)
 *   - Invitees (list per event, retrieve, cancel)
 *   - Scheduling links (single-use links the agent can hand to a customer)
 *   - Webhook subscriptions (CRUD + signing key rotation)
 *   - Routing forms (read submissions for outbound)
 *
 * Auth: Bearer access_token over JSON.
 * Pagination: cursor-based with `pagination.next_page_token`.
 *
 * Docs: https://developer.calendly.com/api-docs
 */

import { logger } from '../utils/logger.js';
import { CALENDLY_API_BASE } from './calendly-oauth.js';

export interface CalendlyUser {
  uri: string;
  name: string;
  slug: string;
  email: string;
  scheduling_url: string;
  timezone: string;
  avatar_url: string | null;
  current_organization: string;
  resource_type?: 'User';
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  active: boolean;
  slug: string;
  scheduling_url: string;
  duration: number;
  duration_options: number[] | null;
  kind: 'solo' | 'group';
  pooling_type: 'round_robin' | 'collective' | null;
  type: 'StandardEventType' | 'AdhocEventType';
  color: string;
  description_plain: string | null;
}

export interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled';
  start_time: string;
  end_time: string;
  event_type: string;
  location: { type: string; location?: string; join_url?: string; data?: any } | null;
  invitees_counter: { active: number; limit: number; total: number };
  created_at: string;
  updated_at: string;
  meeting_notes_plain: string | null;
}

export class CalendlyAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }): Promise<T> {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${CALENDLY_API_BASE}${path.startsWith('/') ? '' : '/'}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    let body: BodyInit | undefined;
    if (init?.body !== undefined) body = JSON.stringify(init.body);
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let cError: any = null;
      let message = text;
      try {
        const j = JSON.parse(text);
        cError = j;
        message = j?.message ?? j?.title ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`calendly ${method} ${path} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      err.statusCode = res.status;
      err.calendlyError = cError;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  async currentUser(): Promise<{ resource: CalendlyUser }> {
    return this.req('GET', '/users/me');
  }

  async ping(): Promise<{ ok: boolean; statusCode?: number; me?: CalendlyUser }> {
    try {
      const r = await this.currentUser();
      return { ok: true, me: r.resource };
    } catch (err: any) {
      logger.warn('calendly ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }

  async getUser(uri: string): Promise<{ resource: CalendlyUser }> {
    return this.req('GET', uri);
  }

  // ── Event types ───────────────────────────────────────────────────────────

  async listEventTypes(opts: { user?: string; organization?: string; active?: boolean; count?: number; pageToken?: string }): Promise<{ collection: CalendlyEventType[]; pagination: { count: number; next_page_token?: string; previous_page_token?: string; next_page?: string; previous_page?: string } }> {
    return this.req('GET', '/event_types', {
      query: {
        user: opts.user,
        organization: opts.organization,
        active: opts.active,
        count: opts.count ?? 50,
        page_token: opts.pageToken,
      },
    });
  }

  async getEventType(uri: string): Promise<{ resource: CalendlyEventType }> {
    return this.req('GET', uri);
  }

  // ── Scheduled events ──────────────────────────────────────────────────────

  async listScheduledEvents(opts: {
    user?: string;
    organization?: string;
    inviteeEmail?: string;
    status?: 'active' | 'canceled';
    minStartTime?: string;
    maxStartTime?: string;
    sort?: 'start_time:asc' | 'start_time:desc';
    count?: number;
    pageToken?: string;
  }): Promise<{ collection: CalendlyScheduledEvent[]; pagination: any }> {
    return this.req('GET', '/scheduled_events', {
      query: {
        user: opts.user,
        organization: opts.organization,
        invitee_email: opts.inviteeEmail,
        status: opts.status,
        min_start_time: opts.minStartTime,
        max_start_time: opts.maxStartTime,
        sort: opts.sort,
        count: opts.count ?? 50,
        page_token: opts.pageToken,
      },
    });
  }

  async getScheduledEvent(uri: string): Promise<{ resource: CalendlyScheduledEvent }> {
    return this.req('GET', uri);
  }

  async cancelScheduledEvent(eventUuid: string, reason?: string): Promise<{ resource: CalendlyScheduledEvent }> {
    return this.req('POST', `/scheduled_events/${encodeURIComponent(eventUuid)}/cancellation`, {
      body: { reason: reason ?? 'Canceled by Clain on behalf of host' },
    });
  }

  // ── Invitees ──────────────────────────────────────────────────────────────

  async listInvitees(eventUuid: string, opts?: { email?: string; status?: 'active' | 'canceled'; count?: number; pageToken?: string }): Promise<{ collection: any[]; pagination: any }> {
    return this.req('GET', `/scheduled_events/${encodeURIComponent(eventUuid)}/invitees`, {
      query: {
        email: opts?.email,
        status: opts?.status,
        count: opts?.count ?? 50,
        page_token: opts?.pageToken,
      },
    });
  }

  async getInvitee(eventUuid: string, inviteeUuid: string): Promise<any> {
    return this.req('GET', `/scheduled_events/${encodeURIComponent(eventUuid)}/invitees/${encodeURIComponent(inviteeUuid)}`);
  }

  // ── Scheduling links (single-use) ─────────────────────────────────────────

  /**
   * Create a one-shot link that takes the customer straight into a
   * specific event type. Useful when the AI agent says "Pick a time:".
   */
  async createSchedulingLink(payload: { max_event_count: number; owner: string; owner_type: 'EventType' }): Promise<{ resource: { booking_url: string; owner: string; owner_type: string } }> {
    return this.req('POST', '/scheduling_links', { body: payload });
  }

  // ── Webhook subscriptions ─────────────────────────────────────────────────

  async listWebhooks(opts: { organization: string; user?: string; scope: 'organization' | 'user'; count?: number; pageToken?: string }): Promise<{ collection: any[]; pagination: any }> {
    return this.req('GET', '/webhook_subscriptions', {
      query: {
        organization: opts.organization,
        user: opts.user,
        scope: opts.scope,
        count: opts.count ?? 50,
        page_token: opts.pageToken,
      },
    });
  }

  async createWebhook(payload: {
    url: string;
    events: Array<'invitee.created' | 'invitee.canceled' | 'routing_form_submission.created' | 'invitee_no_show.created' | 'invitee_no_show.deleted'>;
    organization: string;
    user?: string;
    scope: 'organization' | 'user';
    signing_key?: string;
  }): Promise<{ resource: { uri: string; callback_url: string; created_at: string; events: string[]; scope: string; state: 'active' | 'disabled'; signing_key?: string } }> {
    return this.req('POST', '/webhook_subscriptions', { body: payload });
  }

  async deleteWebhook(uuid: string): Promise<void> {
    await this.req('DELETE', `/webhook_subscriptions/${encodeURIComponent(uuid)}`);
  }
}
