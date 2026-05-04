/**
 * server/integrations/messenger.ts
 *
 * Facebook Messenger adapter via Meta Graph API. Each merchant's
 * Facebook Page is its own connector (different Page Access Token).
 *
 * Surface (~95% of customer-support flows):
 *  - Send text / quick replies / generic templates / button templates
 *  - Send media (image/video/file/audio) by URL or attachment_id
 *  - Mark seen / typing on / typing off (sender actions)
 *  - Get user profile (name + locale) for the case sidebar
 *  - HMAC verification on inbound webhooks
 *  - Subscribe app to page (so events flow)
 *
 * Auth model: Page Access Token (long-lived, 60 days, easily refreshable
 * by exchanging a User token). Each call uses Bearer / `?access_token=`.
 *
 * Docs: https://developers.facebook.com/docs/messenger-platform
 */

import { createHmac, timingSafeEqual } from 'crypto';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

export interface MessengerCreds {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
}

export interface MessengerSendResult {
  recipientId: string;
  messageId: string;
}

export class MessengerAdapter {
  constructor(private readonly creds: MessengerCreds) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean> }): Promise<T> {
    const url = new URL(`${GRAPH_BASE}${path}`);
    url.searchParams.set('access_token', this.creds.pageAccessToken);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
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
      const err: any = new Error(`Messenger ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.metaCode = (() => { try { return JSON.parse(text)?.error?.code ?? null; } catch { return null; } })();
      err.metaSubcode = (() => { try { return JSON.parse(text)?.error?.error_subcode ?? null; } catch { return null; } })();
      err.metaRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Page info ──────────────────────────────────────────────────────────

  async getPage(): Promise<{ id: string; name: string; category?: string; tasks?: string[]; verification_status?: string; followers_count?: number }> {
    return this.req('GET', `/${this.creds.pageId}`, {
      query: { fields: 'id,name,category,tasks,verification_status,followers_count' },
    });
  }

  // ── Sending messages ───────────────────────────────────────────────────

  /**
   * Send a plain-text message to a Messenger user (PSID).
   * Outside the 24h customer-service window, message_tag is required.
   */
  async sendText(input: {
    recipientId: string;
    text: string;
    messagingType?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
    tag?: 'CONFIRMED_EVENT_UPDATE' | 'POST_PURCHASE_UPDATE' | 'ACCOUNT_UPDATE' | 'HUMAN_AGENT';
  }): Promise<MessengerSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        messaging_type: input.messagingType ?? 'RESPONSE',
        ...(input.tag ? { tag: input.tag } : {}),
        message: { text: input.text },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /** Send a message with quick-reply buttons (up to 13). */
  async sendQuickReplies(input: {
    recipientId: string;
    text: string;
    quickReplies: Array<{ title: string; payload: string; imageUrl?: string }>;
  }): Promise<MessengerSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        messaging_type: 'RESPONSE',
        message: {
          text: input.text,
          quick_replies: input.quickReplies.slice(0, 13).map((q) => ({
            content_type: 'text',
            title: q.title.slice(0, 20),
            payload: q.payload,
            ...(q.imageUrl ? { image_url: q.imageUrl } : {}),
          })),
        },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /** Send a button template (up to 3 postback / url buttons). */
  async sendButtonTemplate(input: {
    recipientId: string;
    text: string;
    buttons: Array<
      | { type: 'postback'; title: string; payload: string }
      | { type: 'web_url'; title: string; url: string; webviewHeightRatio?: 'compact' | 'tall' | 'full' }
      | { type: 'phone_number'; title: string; payload: string }
    >;
  }): Promise<MessengerSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: input.text.slice(0, 640),
              buttons: input.buttons.slice(0, 3).map((b) => {
                if (b.type === 'web_url') {
                  return {
                    type: 'web_url',
                    title: b.title.slice(0, 20),
                    url: b.url,
                    webview_height_ratio: b.webviewHeightRatio ?? 'full',
                  };
                }
                return { type: b.type, title: b.title.slice(0, 20), payload: b.payload };
              }),
            },
          },
        },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /** Send media (image / video / audio / file). */
  async sendMedia(input: {
    recipientId: string;
    type: 'image' | 'video' | 'audio' | 'file';
    url?: string;
    attachmentId?: string;
    isReusable?: boolean;
  }): Promise<MessengerSendResult> {
    const payload: any = input.attachmentId ? { attachment_id: input.attachmentId } : { url: input.url, is_reusable: input.isReusable ?? false };
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        messaging_type: 'RESPONSE',
        message: { attachment: { type: input.type, payload } },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /** Send a sender action (typing on / off / mark seen). */
  async sendSenderAction(recipientId: string, action: 'mark_seen' | 'typing_on' | 'typing_off'): Promise<void> {
    await this.req('POST', `/${this.creds.pageId}/messages`, {
      body: { recipient: { id: recipientId }, sender_action: action },
    });
  }

  // ── User info ──────────────────────────────────────────────────────────

  /** Fetch the user's public profile for a given PSID (within the page). */
  async getUserProfile(psid: string): Promise<{ id: string; first_name?: string; last_name?: string; profile_pic?: string; locale?: string; gender?: string }> {
    return this.req('GET', `/${psid}`, {
      query: { fields: 'id,first_name,last_name,profile_pic,locale' },
    });
  }

  // ── Subscribed apps ────────────────────────────────────────────────────

  /**
   * Subscribe our app to receive webhook events for this page. Without
   * this, events configured at the Meta App webhooks page won't actually
   * arrive — Meta only forwards events for pages that have explicitly
   * granted permission.
   */
  async subscribeAppToPage(subscribedFields: string[] = ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'messaging_referrals', 'messaging_handovers']): Promise<{ success: boolean }> {
    return this.req('POST', `/${this.creds.pageId}/subscribed_apps`, {
      body: { subscribed_fields: subscribedFields.join(',') },
    });
  }

  async unsubscribeAppFromPage(): Promise<{ success: boolean }> {
    return this.req('DELETE', `/${this.creds.pageId}/subscribed_apps`);
  }

  async listSubscribedApps(): Promise<unknown[]> {
    const res = await this.req<{ data: unknown[] }>('GET', `/${this.creds.pageId}/subscribed_apps`);
    return res.data ?? [];
  }

  // ── Webhook signature ─────────────────────────────────────────────────
  // Meta signs each delivery with HMAC-SHA256 over the raw body using the
  // App Secret as key. Header: `x-hub-signature-256: sha256=<hex>`.

  static verifyWebhookSignature(input: { appSecret: string; rawBody: string; providedSignature: string }): boolean {
    if (!input.appSecret || !input.providedSignature) return false;
    const [scheme, providedHex] = input.providedSignature.split('=');
    if (scheme !== 'sha256' || !providedHex) return false;
    const expectedHex = createHmac('sha256', input.appSecret).update(input.rawBody, 'utf8').digest('hex');
    const a = Buffer.from(providedHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
