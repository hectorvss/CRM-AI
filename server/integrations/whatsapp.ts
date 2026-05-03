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
}
