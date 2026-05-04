/**
 * server/integrations/segment.ts
 *
 * Segment HTTP Tracking API (Twilio Segment).
 * No OAuth — auth is HTTP Basic with the Source Write Key (no password).
 *
 *  - API base: https://api.segment.io/v1/
 *  - Endpoints: /identify, /track, /page, /screen, /group, /alias, /batch
 *
 * Webhooks: Segment doesn't push webhooks per source; instead it acts as
 * a Destination receiving from your sources. We expose `/webhooks/segment/<token>`
 * for incoming "Source Functions" or "Destination Functions" callbacks.
 */

import { logger } from '../utils/logger.js';

export const SEGMENT_API_BASE = 'https://api.segment.io/v1';

export class SegmentAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'SegmentAuthError'; }
}

interface BaseEnvelope {
  userId?: string;
  anonymousId?: string;
  context?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
  timestamp?: string;
  messageId?: string;
}

export class SegmentAdapter {
  constructor(private writeKey: string) {}

  private auth(): string {
    return 'Basic ' + Buffer.from(`${this.writeKey}:`).toString('base64');
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${SEGMENT_API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: this.auth(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) throw new SegmentAuthError(`segment ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`segment ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json().catch(() => ({}))) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.identify({ userId: 'clain-healthcheck', traits: { health: true } }); return { ok: true }; }
    catch (err) { logger.warn('segment ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── identify ───────────────────────────────────────────────────────────────
  async identify(payload: BaseEnvelope & { traits?: Record<string, unknown> }): Promise<void> {
    if (!payload.userId && !payload.anonymousId) throw new Error('identify requires userId or anonymousId');
    await this.request('/identify', payload);
  }

  // ── track ──────────────────────────────────────────────────────────────────
  async track(payload: BaseEnvelope & { event: string; properties?: Record<string, unknown> }): Promise<void> {
    if (!payload.userId && !payload.anonymousId) throw new Error('track requires userId or anonymousId');
    if (!payload.event) throw new Error('track requires event');
    await this.request('/track', payload);
  }

  // ── page ───────────────────────────────────────────────────────────────────
  async page(payload: BaseEnvelope & { name?: string; category?: string; properties?: Record<string, unknown> }): Promise<void> {
    if (!payload.userId && !payload.anonymousId) throw new Error('page requires userId or anonymousId');
    await this.request('/page', payload);
  }

  // ── group ──────────────────────────────────────────────────────────────────
  async group(payload: BaseEnvelope & { groupId: string; traits?: Record<string, unknown> }): Promise<void> {
    if (!payload.userId && !payload.anonymousId) throw new Error('group requires userId or anonymousId');
    if (!payload.groupId) throw new Error('group requires groupId');
    await this.request('/group', payload);
  }

  // ── alias ──────────────────────────────────────────────────────────────────
  async alias(payload: { previousId: string; userId: string }): Promise<void> {
    if (!payload.previousId || !payload.userId) throw new Error('alias requires previousId and userId');
    await this.request('/alias', payload);
  }

  // ── batch (high-volume) ────────────────────────────────────────────────────
  async batch(events: Array<{ type: 'identify' | 'track' | 'page' | 'screen' | 'group' | 'alias' } & Record<string, unknown>>): Promise<void> {
    if (events.length === 0) return;
    if (events.length > 100) throw new Error('Segment batch limit: 100 events per call');
    await this.request('/batch', { batch: events });
  }
}
