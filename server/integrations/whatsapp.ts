/**
 * server/integrations/whatsapp.ts
 *
 * WhatsApp (Meta Business Cloud API) integration adapter.
 *
 * Capabilities:
 *  - Sends outbound text messages via the Meta Graph API.
 *  - Verifies inbound webhook deliveries: Meta signs each POST with an
 *    HMAC-SHA256 over the raw body using the App Secret as key (delivered
 *    in the `x-hub-signature-256` header). The verification token used
 *    during the GET handshake is exposed as `verifyToken` for the channel
 *    webhook router.
 *  - Implements IntegrationAdapter so the adapter participates in the
 *    health check and capability-discovery APIs.
 *
 * Fail-safe: if credentials are absent the adapter still constructs (so it
 * can be registered for healthchecks), but every send/ping call throws
 * `WhatsAppNotConfiguredError` instead of silently simulating. Routes catch
 * this error and respond with HTTP 503 + WHATSAPP_NOT_CONFIGURED.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { WhatsAppNotConfiguredError } from './types.js';
import type { IntegrationAdapter } from './types.js';

export interface WhatsAppAdapterOptions {
  /** Meta permanent access token used for outbound calls */
  accessToken:   string;
  /** Phone-number ID configured in Meta Business Manager */
  phoneNumberId: string;
  /** Token echoed back during Meta's GET subscription handshake */
  verifyToken:   string;
  /**
   * Meta App Secret used to validate the `x-hub-signature-256` header on
   * inbound POSTs. Optional: when absent the adapter rejects all signatures.
   */
  webhookSecret: string;
}

export interface WhatsAppSendResult {
  messageId: string;
}

export class WhatsAppAdapter implements IntegrationAdapter {
  readonly system = 'whatsapp' as const;
  readonly configured: boolean;

  private readonly accessToken:   string;
  private readonly phoneNumberId: string;
  private readonly verifyToken:   string;
  private readonly webhookSecret: string;

  constructor(opts: WhatsAppAdapterOptions) {
    this.accessToken   = opts.accessToken;
    this.phoneNumberId = opts.phoneNumberId;
    this.verifyToken   = opts.verifyToken;
    this.webhookSecret = opts.webhookSecret;
    // We treat WhatsApp as "configured" when the minimum send credentials
    // exist. The webhook secret is independent — its presence enables
    // signature verification but isn't required for outbound sends.
    this.configured = Boolean(opts.accessToken && opts.phoneNumberId);
  }

  /** Public read-only handle to the GET-handshake verify token. */
  getVerifyToken(): string {
    return this.verifyToken;
  }

  /**
   * True when the App Secret used to sign inbound webhooks is configured.
   * Routes use this to surface a 503 when payloads arrive but cannot be
   * authenticated.
   */
  hasWebhookSecret(): boolean {
    return Boolean(this.webhookSecret);
  }

  /** List of env-var names that are missing for full send capability. */
  missingSendCredentials(): string[] {
    const missing: string[] = [];
    if (!this.accessToken)   missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!this.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    return missing;
  }

  // ── IntegrationAdapter ──────────────────────────────────────────────────────

  /**
   * Verifies Meta's `x-hub-signature-256` header on inbound POST webhooks.
   *
   * Meta computes `HMAC_SHA256(appSecret, rawBody)` and sends it as
   *   x-hub-signature-256: sha256=<hex>
   *
   * Returns false (rather than throwing) so the route handler can choose
   * between 401 (bad signature) and 503 (not configured) by also checking
   * `hasWebhookSecret()`.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    if (!this.webhookSecret) return false;

    const headerVal =
      headers['x-hub-signature-256'] ??
      headers['X-Hub-Signature-256'] ?? '';
    if (!headerVal) return false;

    const [scheme, providedHex] = headerVal.split('=');
    if (scheme !== 'sha256' || !providedHex) return false;

    const expectedHex = createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const provided = Buffer.from(providedHex, 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    if (provided.length !== expected.length) return false;

    try {
      return timingSafeEqual(provided, expected);
    } catch {
      return false;
    }
  }

  /**
   * Health check: verify the phone number ID is readable via the Graph API.
   * Throws `WhatsAppNotConfiguredError` if credentials missing.
   */
  async ping(): Promise<void> {
    if (!this.configured) {
      throw new WhatsAppNotConfiguredError(this.missingSendCredentials());
    }

    const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}?fields=id,display_phone_number`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`WhatsApp ping failed: HTTP ${res.status} — ${body}`);
    }
  }

  // ── Messaging ────────────────────────────────────────────────────────────────

  /**
   * Send a plain-text WhatsApp message to a recipient phone number.
   *
   * Throws `WhatsAppNotConfiguredError` when credentials are absent — callers
   * are expected to translate that into a 503 response or queue retry.
   *
   * @param to      E.164 phone number (e.g. "+34600123456")
   * @param content Message body text
   */
  async sendTextMessage(to: string, content: string): Promise<WhatsAppSendResult> {
    if (!this.configured) {
      throw new WhatsAppNotConfiguredError(this.missingSendCredentials());
    }

    const url = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: content },
    });

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '(unreadable)');
      throw new Error(`WhatsApp API error ${res.status}: ${errText}`);
    }

    const json = await res.json() as any;
    const messageId = json?.messages?.[0]?.id ?? randomUUID();
    logger.info('WhatsApp message sent', { to, messageId });
    return { messageId };
  }

  /**
   * Backwards-compat alias for the older `sendText` name. Channel senders and
   * legacy plan-engine tools may still import this. New callers should use
   * `sendTextMessage`.
   */
  async sendText(to: string, content: string): Promise<WhatsAppSendResult> {
    return this.sendTextMessage(to, content);
  }

  // ── Phase 2: extended coverage ──────────────────────────────────────────
  //
  // Methods below are NOT part of the canonical IntegrationAdapter
  // interface. They expose Meta-specific resources directly so the agent /
  // workflows can reach into templates, interactive messages, media, and
  // business-profile management. Returns are typed `unknown` because we
  // don't want raw Meta shapes leaking into canonical types.

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean> }): Promise<T> {
    if (!this.accessToken) throw new WhatsAppNotConfiguredError(this.missingSendCredentials());
    const url = new URL(`https://graph.facebook.com/v18.0${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
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
      try {
        const j = JSON.parse(text);
        message = j?.error?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`WhatsApp ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.metaCode = (() => { try { return JSON.parse(text)?.error?.code ?? null; } catch { return null; } })();
      err.metaSubcode = (() => { try { return JSON.parse(text)?.error?.error_subcode ?? null; } catch { return null; } })();
      err.metaRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Phone number / business profile ─────────────────────────────────────

  async getPhoneNumber(): Promise<{ id: string; display_phone_number: string; verified_name: string; quality_rating?: string; code_verification_status?: string }> {
    return this.req('GET', `/${this.phoneNumberId}`, {
      query: { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status' },
    });
  }

  async getBusinessProfile(): Promise<unknown> {
    const res = await this.req<{ data: unknown[] }>('GET', `/${this.phoneNumberId}/whatsapp_business_profile`, {
      query: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' },
    });
    return res.data?.[0] ?? null;
  }

  async updateBusinessProfile(input: { about?: string; address?: string; description?: string; email?: string; vertical?: string; websites?: string[]; profile_picture_handle?: string }): Promise<unknown> {
    return this.req('POST', `/${this.phoneNumberId}/whatsapp_business_profile`, {
      body: { messaging_product: 'whatsapp', ...input },
    });
  }

  // ── Message templates (the WhatsApp gold standard for outbound) ─────────

  /**
   * List the merchant's approved templates. Requires `wabaId` (WhatsApp
   * Business Account ID) — pass it from the connector row. Returns Meta's
   * native template shape (`name`, `status`, `category`, `language`,
   * `components: [{type, text, buttons, ...}]`).
   */
  async listTemplates(wabaId: string, opts: { limit?: number; status?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = {
      fields: 'name,status,category,language,components,quality_score',
      limit: Math.min(opts.limit ?? 100, 250),
    };
    if (opts.status) query.status = opts.status;
    const res = await this.req<{ data: unknown[] }>('GET', `/${wabaId}/message_templates`, { query });
    return res.data ?? [];
  }

  /**
   * Send a pre-approved template message. Templates are the only outbound
   * messages allowed outside the 24-hour customer service window.
   *
   *   sendTemplate('+34612345678', {
   *     name: 'order_confirmation',
   *     language: 'es_ES',
   *     bodyParameters: ['Lucía', '#10428', '€1.250'],
   *   })
   */
  async sendTemplate(to: string, input: {
    name: string;
    language: string;                  // e.g. 'es_ES', 'en_US'
    headerImageUrl?: string;
    headerImageId?: string;            // pre-uploaded media id (preferred)
    bodyParameters?: string[];
    buttonParameters?: Array<{ subType: 'quick_reply' | 'url'; index: number; parameters: Array<{ type: 'text' | 'payload'; value: string }> }>;
  }): Promise<WhatsAppSendResult> {
    const components: any[] = [];
    if (input.headerImageUrl || input.headerImageId) {
      components.push({
        type: 'header',
        parameters: [{
          type: 'image',
          image: input.headerImageId ? { id: input.headerImageId } : { link: input.headerImageUrl },
        }],
      });
    }
    if (input.bodyParameters && input.bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: input.bodyParameters.map((text) => ({ type: 'text', text })),
      });
    }
    if (input.buttonParameters) {
      for (const btn of input.buttonParameters) {
        components.push({
          type: 'button',
          sub_type: btn.subType,
          index: String(btn.index),
          parameters: btn.parameters,
        });
      }
    }

    const result = await this.req<{ messages?: Array<{ id: string }> }>('POST', `/${this.phoneNumberId}/messages`, {
      body: {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: input.name,
          language: { code: input.language },
          ...(components.length > 0 ? { components } : {}),
        },
      },
    });
    return { messageId: result.messages?.[0]?.id ?? randomUUID() };
  }

  /** Submit a new template for Meta approval. Approval typically takes 1-24h. */
  async createTemplate(wabaId: string, input: {
    name: string;
    category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
    language: string;
    components: Array<{ type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'; format?: string; text?: string; example?: unknown; buttons?: unknown[] }>;
  }): Promise<unknown> {
    return this.req('POST', `/${wabaId}/message_templates`, { body: input });
  }

  // ── Interactive messages (buttons + lists, sub-24h window) ──────────────

  async sendInteractiveButtons(to: string, input: {
    bodyText: string;
    buttons: Array<{ id: string; title: string }>;   // up to 3 buttons
    headerText?: string;
    footerText?: string;
  }): Promise<WhatsAppSendResult> {
    if (input.buttons.length > 3) throw new Error('WhatsApp interactive buttons: max 3');
    const result = await this.req<{ messages?: Array<{ id: string }> }>('POST', `/${this.phoneNumberId}/messages`, {
      body: {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(input.headerText ? { header: { type: 'text', text: input.headerText } } : {}),
          body: { text: input.bodyText },
          ...(input.footerText ? { footer: { text: input.footerText } } : {}),
          action: {
            buttons: input.buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      },
    });
    return { messageId: result.messages?.[0]?.id ?? randomUUID() };
  }

  async sendInteractiveList(to: string, input: {
    bodyText: string;
    buttonText: string;
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
    headerText?: string;
    footerText?: string;
  }): Promise<WhatsAppSendResult> {
    const result = await this.req<{ messages?: Array<{ id: string }> }>('POST', `/${this.phoneNumberId}/messages`, {
      body: {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(input.headerText ? { header: { type: 'text', text: input.headerText } } : {}),
          body: { text: input.bodyText },
          ...(input.footerText ? { footer: { text: input.footerText } } : {}),
          action: {
            button: input.buttonText.slice(0, 20),
            sections: input.sections.map((s) => ({
              title: s.title.slice(0, 24),
              rows: s.rows.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                description: r.description?.slice(0, 72),
              })),
            })),
          },
        },
      },
    });
    return { messageId: result.messages?.[0]?.id ?? randomUUID() };
  }

  // ── Media (images, video, documents, audio) ─────────────────────────────

  async sendMedia(to: string, input: {
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    mediaId?: string;             // pre-uploaded
    mediaUrl?: string;            // public HTTPS URL
    caption?: string;             // images, video, document
    filename?: string;            // documents only
  }): Promise<WhatsAppSendResult> {
    const mediaPayload: any = input.mediaId
      ? { id: input.mediaId }
      : { link: input.mediaUrl };
    if (input.caption && (input.type === 'image' || input.type === 'video' || input.type === 'document')) {
      mediaPayload.caption = input.caption;
    }
    if (input.filename && input.type === 'document') {
      mediaPayload.filename = input.filename;
    }

    const result = await this.req<{ messages?: Array<{ id: string }> }>('POST', `/${this.phoneNumberId}/messages`, {
      body: {
        messaging_product: 'whatsapp',
        to,
        type: input.type,
        [input.type]: mediaPayload,
      },
    });
    return { messageId: result.messages?.[0]?.id ?? randomUUID() };
  }

  /**
   * Upload media to Meta. Returns an opaque media ID you can pass to
   * `sendMedia` / template `headerImageId`. IDs expire after ~30 days.
   */
  async uploadMedia(input: { data: Buffer; mimeType: string; filename: string }): Promise<{ id: string }> {
    if (!this.accessToken) throw new WhatsAppNotConfiguredError(this.missingSendCredentials());
    const boundary = `----CRM-AI-WA-${Date.now()}`;
    const parts: Array<string | Buffer> = [];
    parts.push(`--${boundary}`);
    parts.push(`Content-Disposition: form-data; name="messaging_product"`);
    parts.push('');
    parts.push('whatsapp');
    parts.push(`--${boundary}`);
    parts.push(`Content-Disposition: form-data; name="type"`);
    parts.push('');
    parts.push(input.mimeType);
    parts.push(`--${boundary}`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="${input.filename}"`);
    parts.push(`Content-Type: ${input.mimeType}`);
    parts.push('');
    parts.push(input.data);
    parts.push(`--${boundary}--`);
    const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? Buffer.concat([p, Buffer.from('\r\n')]) : Buffer.from(`${p}\r\n`))));

    const res = await fetch(`https://graph.facebook.com/v18.0/${this.phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WhatsApp media upload failed: ${res.status} ${text}`);
    }
    return (await res.json()) as { id: string };
  }

  /** Fetch the public download URL for a Meta-hosted media id (inbound attachments). */
  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    return this.req('GET', `/${mediaId}`);
  }

  /** Download bytes of an inbound media attachment. */
  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const meta = await this.getMediaUrl(mediaId);
    const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) throw new Error(`download media failed: ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    return { data, mimeType: meta.mime_type };
  }

  // ── Reactions, read receipts, typing ───────────────────────────────────

  async sendReaction(to: string, messageId: string, emoji: string): Promise<WhatsAppSendResult> {
    const result = await this.req<{ messages?: Array<{ id: string }> }>('POST', `/${this.phoneNumberId}/messages`, {
      body: {
        messaging_product: 'whatsapp',
        to,
        type: 'reaction',
        reaction: { message_id: messageId, emoji },
      },
    });
    return { messageId: result.messages?.[0]?.id ?? randomUUID() };
  }

  async markRead(messageId: string): Promise<void> {
    await this.req('POST', `/${this.phoneNumberId}/messages`, {
      body: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
    });
  }

  // ── Subscribed apps (webhook subscription on the WABA) ─────────────────

  /**
   * Subscribe our app to receive webhook events for the merchant's WABA.
   * The merchant must have already set the webhook URL + verify token at
   * Meta App Dashboard → WhatsApp → Configuration. This call binds their
   * WABA to our app so events flow.
   */
  async subscribeAppToWaba(wabaId: string): Promise<unknown> {
    return this.req('POST', `/${wabaId}/subscribed_apps`, {});
  }

  async listSubscribedApps(wabaId: string): Promise<unknown[]> {
    const res = await this.req<{ data: unknown[] }>('GET', `/${wabaId}/subscribed_apps`);
    return res.data ?? [];
  }

  async unsubscribeAppFromWaba(wabaId: string): Promise<unknown> {
    return this.req('DELETE', `/${wabaId}/subscribed_apps`);
  }

  // ── Phone numbers list (pick the right one in the picker UI) ───────────

  /** All phone numbers attached to a WABA — used by the picker UI. */
  async listPhoneNumbersForWaba(wabaId: string): Promise<Array<{ id: string; display_phone_number: string; verified_name: string; quality_rating?: string }>> {
    const res = await this.req<{ data: any[] }>('GET', `/${wabaId}/phone_numbers`, {
      query: { fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status' },
    });
    return res.data ?? [];
  }
}
