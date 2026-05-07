/**
 * server/integrations/google-analytics.ts
 *
 * Google Analytics 4 — Measurement Protocol v2
 * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
 *
 * Endpoint: POST https://www.google-analytics.com/mp/collect
 *           ?measurement_id=G-XXXX&api_secret=SECRET
 * Debug:    POST https://www.google-analytics.com/debug/mp/collect  (same params)
 *
 * Each event payload: { client_id, user_id?, events: [{ name, params? }], user_properties? }
 */

const MP_BASE = 'https://www.google-analytics.com/mp/collect';
const MP_DEBUG_BASE = 'https://www.google-analytics.com/debug/mp/collect';

export interface GACreds {
  measurementId: string;
  apiSecret: string;
}

export interface GAEvent {
  name: string;
  params?: Record<string, string | number | boolean>;
}

interface SendOpts {
  clientId: string;
  userId?: string;
  userProperties?: Record<string, { value: string | number }>;
  debug?: boolean;
}

export class GoogleAnalyticsAdapter {
  constructor(private readonly creds: GACreds) {}

  private async send(events: GAEvent[], opts: SendOpts): Promise<Record<string, unknown>> {
    const base = opts.debug ? MP_DEBUG_BASE : MP_BASE;
    const url = new URL(base);
    url.searchParams.set('measurement_id', this.creds.measurementId);
    url.searchParams.set('api_secret', this.creds.apiSecret);

    const payload: Record<string, unknown> = {
      client_id: opts.clientId,
      events: events.map((e) => ({
        name: e.name,
        ...(e.params && Object.keys(e.params).length > 0 ? { params: e.params } : {}),
      })),
    };
    if (opts.userId) payload.user_id = opts.userId;
    if (opts.userProperties && Object.keys(opts.userProperties).length > 0) {
      payload.user_properties = opts.userProperties;
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // GA4 MP returns 204 for non-debug; debug returns 200 with JSON
    if (res.status === 204) return {};
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error(`GA4 MP ${res.status}: ${text}`);
      err.statusCode = res.status;
      err.gaRaw = text;
      throw err;
    }
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** Send a single event. */
  async track(event: GAEvent, opts: SendOpts): Promise<Record<string, unknown>> {
    return this.send([event], opts);
  }

  /**
   * Send multiple events in one request.
   * GA4 Measurement Protocol allows up to 25 events per request.
   */
  async batch(events: GAEvent[], opts: SendOpts): Promise<Record<string, unknown>> {
    if (events.length === 0) return {};
    // Chunk into batches of 25 as required by GA4 MP limits
    const chunks: GAEvent[][] = [];
    for (let i = 0; i < events.length; i += 25) {
      chunks.push(events.slice(i, i + 25));
    }
    const results: Record<string, unknown>[] = [];
    for (const chunk of chunks) {
      results.push(await this.send(chunk, opts));
    }
    return results.length === 1 ? results[0] : { batches: results };
  }

  /**
   * Validate an event using the GA4 debug endpoint.
   * Returns the validation messages array (empty = no issues).
   */
  async validate(event: GAEvent): Promise<{ validationMessages: any[] }> {
    // Use a synthetic client_id for validation
    const result = await this.send([event], { clientId: 'validation_client', debug: true });
    const messages = (result as any)?.validationMessages ?? [];
    return { validationMessages: messages };
  }

  /**
   * Health-check: sends a clain_health_check event to the debug endpoint.
   * Returns { ok: true } if the ping reaches GA without a transport error.
   * Note: GA debug endpoint may return validation warnings for synthetic events —
   * those are non-fatal; only a network/auth error is considered a failure.
   */
  async ping(): Promise<{ ok: boolean; validationMessages?: any[]; error?: string }> {
    try {
      const result = await this.send(
        [{ name: 'clain_health_check', params: { debug_mode: true } }],
        { clientId: 'clain_ping_client', debug: true },
      );
      const validationMessages = (result as any)?.validationMessages ?? [];
      return { ok: true, validationMessages };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }

  // ── Standard event helpers ────────────────────────────────────────────────

  async conversationStarted(opts: {
    clientId: string;
    userId?: string;
    conversationId: string;
    channel: string;
  }): Promise<Record<string, unknown>> {
    return this.track(
      {
        name: 'conversation_started',
        params: { conversation_id: opts.conversationId, channel: opts.channel },
      },
      { clientId: opts.clientId, userId: opts.userId },
    );
  }

  async conversationResolved(opts: {
    clientId: string;
    userId?: string;
    conversationId: string;
    resolutionTimeMs: number;
    agentId?: string;
  }): Promise<Record<string, unknown>> {
    const params: GAEvent['params'] = {
      conversation_id: opts.conversationId,
      resolution_time_ms: opts.resolutionTimeMs,
    };
    if (opts.agentId) params.agent_id = opts.agentId;
    return this.track(
      { name: 'conversation_resolved', params },
      { clientId: opts.clientId, userId: opts.userId },
    );
  }

  async widgetOpened(opts: {
    clientId: string;
    userId?: string;
    page_location?: string;
  }): Promise<Record<string, unknown>> {
    const params: GAEvent['params'] = {};
    if (opts.page_location) params.page_location = opts.page_location;
    return this.track(
      { name: 'clain_widget_open', params },
      { clientId: opts.clientId, userId: opts.userId },
    );
  }

  async csatSubmitted(opts: {
    clientId: string;
    userId?: string;
    conversationId: string;
    score: number;
  }): Promise<Record<string, unknown>> {
    return this.track(
      {
        name: 'csat_submitted',
        params: { conversation_id: opts.conversationId, score: opts.score },
      },
      { clientId: opts.clientId, userId: opts.userId },
    );
  }
}
