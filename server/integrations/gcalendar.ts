/**
 * server/integrations/gcalendar.ts
 *
 * Google Calendar v3 adapter.
 * Base: https://www.googleapis.com/calendar/v3/
 *
 * Push notifications: registered via `events.watch` with a callback URL.
 * Channels expire (configurable up to 1 week, default ~1h); we re-watch
 * before expiry. Each channel has a `token` we set, returned in
 * `X-Goog-Channel-Token` for authentication.
 */

import { logger } from '../utils/logger.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

export class GoogleAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GoogleAuthError'; }
}

export interface GCalCalendar {
  id: string;
  summary: string;
  description?: string;
  timeZone: string;
  accessRole: string;
  primary?: boolean;
}

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end:   { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; responseStatus?: string }[];
  organizer?: { email: string; displayName?: string };
  status: string;
  htmlLink: string;
  hangoutLink?: string;
  conferenceData?: any;
  created: string;
  updated: string;
}

export interface GCalChannel {
  id: string;
  resourceId: string;
  resourceUri?: string;
  token?: string;
  expiration: string;
}

export class GCalendarAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
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
      throw new GoogleAuthError(`gcalendar ${method} ${path} unauthorized (${res.status})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`gcalendar ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.listCalendars(1); return { ok: true }; }
    catch (err) { logger.warn('gcalendar ping failed', { error: String(err) }); return { ok: false }; }
  }

  async listCalendars(maxResults = 50): Promise<GCalCalendar[]> {
    const r = await this.request<any>('GET', `/users/me/calendarList?maxResults=${maxResults}`);
    return r?.items ?? [];
  }

  async listEvents(calendarId: string, opts: { timeMin?: string; timeMax?: string; q?: string; maxResults?: number; singleEvents?: boolean; orderBy?: 'startTime' | 'updated' } = {}): Promise<GCalEvent[]> {
    const params = new URLSearchParams();
    params.set('maxResults', String(opts.maxResults ?? 25));
    if (opts.singleEvents !== false) params.set('singleEvents', 'true');
    if (opts.orderBy) params.set('orderBy', opts.orderBy);
    else if (opts.singleEvents !== false) params.set('orderBy', 'startTime');
    if (opts.timeMin) params.set('timeMin', opts.timeMin);
    if (opts.timeMax) params.set('timeMax', opts.timeMax);
    if (opts.q) params.set('q', opts.q);
    const r = await this.request<any>('GET', `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
    return r?.items ?? [];
  }

  async createEvent(calendarId: string, event: {
    summary: string; description?: string;
    start: { dateTime: string; timeZone?: string };
    end:   { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
    conferenceData?: any;
  }): Promise<GCalEvent> {
    const params = event.conferenceData ? '?conferenceDataVersion=1' : '';
    return this.request<GCalEvent>('POST', `/calendars/${encodeURIComponent(calendarId)}/events${params}`, event);
  }

  async updateEvent(calendarId: string, eventId: string, patch: Partial<GCalEvent>): Promise<GCalEvent> {
    return this.request<GCalEvent>('PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, patch);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  }

  /**
   * FreeBusy for one or more calendars in a time range.
   * Used by the AI to find availability when scheduling.
   */
  async freeBusy(opts: { timeMin: string; timeMax: string; calendarIds: string[]; timeZone?: string }): Promise<Record<string, { busy: { start: string; end: string }[] }>> {
    const r = await this.request<any>('POST', '/freeBusy', {
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      timeZone: opts.timeZone,
      items: opts.calendarIds.map(id => ({ id })),
    });
    return r?.calendars ?? {};
  }

  // ── Push notifications (events.watch) ──────────────────────────────────────
  async watchEvents(calendarId: string, opts: { id: string; address: string; token?: string; ttlSeconds?: number }): Promise<GCalChannel> {
    return this.request<GCalChannel>('POST', `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
      id: opts.id,
      type: 'web_hook',
      address: opts.address,
      token: opts.token,
      params: opts.ttlSeconds ? { ttl: String(opts.ttlSeconds) } : undefined,
    });
  }
  async stopChannel(channelId: string, resourceId: string): Promise<void> {
    await this.request('POST', '/channels/stop', { id: channelId, resourceId });
  }
}
