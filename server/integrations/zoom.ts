/**
 * server/integrations/zoom.ts
 *
 * Zoom REST v2 adapter. Used for:
 *  - Identity (`/users/me`)
 *  - Meetings CRUD
 *  - Cloud recordings + transcripts
 *  - User scheduling (used together with the AI agent)
 */

import { ZOOM_API_BASE } from './zoom-oauth.js';
import { logger } from '../utils/logger.js';

export class ZoomAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'ZoomAuthError'; }
}

export interface ZoomUser { id: string; email: string; first_name: string; last_name: string; account_id: string; type: number; timezone?: string }
export interface ZoomMeeting {
  id: number; uuid: string; topic: string; type: number; status?: string;
  start_time?: string; duration?: number; timezone?: string;
  agenda?: string; created_at: string; join_url: string; password?: string;
}
export interface ZoomRecording {
  uuid: string; id: number; topic: string; start_time: string; duration: number;
  recording_files: { id: string; recording_start: string; recording_end: string; file_type: string; file_size: number; play_url: string; download_url: string; recording_type: string }[];
}

export class ZoomAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${ZOOM_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new ZoomAuthError(`zoom ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`zoom ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async me(): Promise<ZoomUser> { return this.request('GET', '/users/me'); }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('zoom ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Meetings ───────────────────────────────────────────────────────────────
  async listMeetings(opts: { type?: 'scheduled' | 'live' | 'upcoming'; pageSize?: number; pageNumber?: number } = {}): Promise<ZoomMeeting[]> {
    const params = new URLSearchParams();
    params.set('type', opts.type ?? 'upcoming');
    params.set('page_size', String(opts.pageSize ?? 30));
    if (opts.pageNumber) params.set('page_number', String(opts.pageNumber));
    const r = await this.request<any>('GET', `/users/me/meetings?${params.toString()}`);
    return r?.meetings ?? [];
  }
  async getMeeting(id: number | string): Promise<ZoomMeeting> { return this.request('GET', `/meetings/${id}`); }
  async createMeeting(payload: {
    topic: string; type?: number; start_time?: string; duration?: number; timezone?: string;
    agenda?: string; password?: string;
    settings?: { auto_recording?: 'local' | 'cloud' | 'none'; join_before_host?: boolean; mute_upon_entry?: boolean };
  }): Promise<ZoomMeeting> {
    return this.request('POST', '/users/me/meetings', { type: 2, ...payload });
  }
  async updateMeeting(id: number | string, patch: Partial<ZoomMeeting & { settings: any }>): Promise<void> {
    await this.request('PATCH', `/meetings/${id}`, patch);
  }
  async deleteMeeting(id: number | string): Promise<void> { await this.request('DELETE', `/meetings/${id}`); }

  // ── Recordings ─────────────────────────────────────────────────────────────
  async listMyRecordings(opts: { from?: string; to?: string; pageSize?: number; nextPageToken?: string } = {}): Promise<{ recordings: ZoomRecording[]; next_page_token?: string }> {
    const params = new URLSearchParams();
    params.set('page_size', String(opts.pageSize ?? 30));
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.nextPageToken) params.set('next_page_token', opts.nextPageToken);
    const r = await this.request<any>('GET', `/users/me/recordings?${params.toString()}`);
    return { recordings: r?.meetings ?? [], next_page_token: r?.next_page_token };
  }
  async getMeetingRecordings(meetingId: number | string): Promise<ZoomRecording> {
    return this.request('GET', `/meetings/${meetingId}/recordings`);
  }

  // ── Webhooks: registered in the Zoom App config UI, NOT via API.
  // We only verify incoming events server-side.
}
