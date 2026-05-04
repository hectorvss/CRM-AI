/**
 * server/integrations/instagram.ts
 *
 * Instagram messaging via Meta Graph API. Each merchant's Instagram
 * Business / Creator account must be linked to a Facebook Page; the
 * Page Access Token is what authenticates the calls (same model as
 * Messenger but the resource path is `/{ig_user_id}/messages`).
 *
 * Surface:
 *  - Send text / media (image, video, audio, share)
 *  - Send Story replies / mentions
 *  - Send icebreakers (private replies to comments)
 *  - Send quick replies and generic templates (limited subset vs Messenger)
 *  - Get user profile (username + name)
 *  - Subscribe app to page for IG events
 *  - HMAC verify (shared with Messenger via Meta App Secret)
 *
 * Docs: https://developers.facebook.com/docs/messenger-platform/instagram
 */

import { createHmac, timingSafeEqual } from 'crypto';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

export interface InstagramCreds {
  /** The Instagram Business Account id (NOT the page id, NOT the IG handle). */
  igUserId: string;
  /** Page id of the FB Page linked to the IG account (used for subscriptions). */
  pageId: string;
  /** Page Access Token — same token Messenger uses. */
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
}

export interface InstagramSendResult {
  recipientId: string;
  messageId: string;
}

export class InstagramAdapter {
  constructor(private readonly creds: InstagramCreds) {}

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
      const err: any = new Error(`Instagram ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.metaCode = (() => { try { return JSON.parse(text)?.error?.code ?? null; } catch { return null; } })();
      err.metaSubcode = (() => { try { return JSON.parse(text)?.error?.error_subcode ?? null; } catch { return null; } })();
      err.metaRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Account info ───────────────────────────────────────────────────────

  async getAccount(): Promise<{ id: string; username: string; name?: string; profile_picture_url?: string; followers_count?: number; biography?: string }> {
    return this.req('GET', `/${this.creds.igUserId}`, {
      query: { fields: 'id,username,name,profile_picture_url,followers_count,biography' },
    });
  }

  // ── Sending messages (paths use page id, body recipient is IG-Scoped ID) ──

  async sendText(input: { recipientId: string; text: string }): Promise<InstagramSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        message: { text: input.text },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  async sendMedia(input: { recipientId: string; type: 'image' | 'video' | 'audio'; url: string }): Promise<InstagramSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        message: { attachment: { type: input.type, payload: { url: input.url } } },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /** Quick replies on Instagram — shown as tappable bubbles. Up to 13. */
  async sendQuickReplies(input: { recipientId: string; text: string; quickReplies: Array<{ title: string; payload: string }> }): Promise<InstagramSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { id: input.recipientId },
        message: {
          text: input.text,
          quick_replies: input.quickReplies.slice(0, 13).map((q) => ({
            content_type: 'text',
            title: q.title.slice(0, 20),
            payload: q.payload,
          })),
        },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /**
   * Reply privately to a comment / mention on a post (the only way to
   * start a conversation outside the standard messaging window).
   */
  async sendPrivateReplyToComment(input: { commentId: string; text: string }): Promise<InstagramSendResult> {
    const res = await this.req<{ recipient_id: string; message_id: string }>('POST', `/${this.creds.pageId}/messages`, {
      body: {
        recipient: { comment_id: input.commentId },
        message: { text: input.text },
      },
    });
    return { recipientId: res.recipient_id, messageId: res.message_id };
  }

  /** Reply to a story mention (DM kicked off when a user mentions you in a Story). */
  async sendStoryReply(input: { recipientId: string; text: string }): Promise<InstagramSendResult> {
    return this.sendText(input);
  }

  /** Sender actions: mark_seen / typing_on / typing_off. */
  async sendSenderAction(recipientId: string, action: 'mark_seen' | 'typing_on' | 'typing_off'): Promise<void> {
    await this.req('POST', `/${this.creds.pageId}/messages`, {
      body: { recipient: { id: recipientId }, sender_action: action },
    });
  }

  // ── Conversations / messages list (read history) ───────────────────────

  async listConversations(opts: { limit?: number } = {}): Promise<unknown[]> {
    const res = await this.req<{ data: unknown[] }>('GET', `/${this.creds.igUserId}/conversations`, {
      query: { platform: 'instagram', limit: Math.min(opts.limit ?? 25, 100) },
    });
    return res.data ?? [];
  }

  async getConversation(conversationId: string): Promise<unknown> {
    return this.req('GET', `/${conversationId}`, { query: { fields: 'messages,participants,updated_time' } });
  }

  // ── User info (IG-scoped IDs) ──────────────────────────────────────────

  /**
   * Get a user's public Instagram info given an IG-scoped user id (the
   * id in webhook payloads). Returns null if the user has scopes locked.
   */
  async getIgUser(igsid: string): Promise<{ name?: string; username?: string; profile_pic?: string; follower_count?: number; is_user_follow_business?: boolean; is_business_follow_user?: boolean } | null> {
    try {
      return await this.req('GET', `/${igsid}`, {
        query: { fields: 'name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user' },
      });
    } catch (err: any) {
      if (err?.statusCode === 400 || err?.statusCode === 404) return null;
      throw err;
    }
  }

  // ── Subscribed apps ────────────────────────────────────────────────────

  async subscribeAppToPage(subscribedFields: string[] = ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'mentions', 'comments']): Promise<{ success: boolean }> {
    return this.req('POST', `/${this.creds.pageId}/subscribed_apps`, {
      body: { subscribed_fields: subscribedFields.join(',') },
    });
  }

  async unsubscribeAppFromPage(): Promise<{ success: boolean }> {
    return this.req('DELETE', `/${this.creds.pageId}/subscribed_apps`);
  }

  // ── HMAC verification (same as Messenger) ──────────────────────────────

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
