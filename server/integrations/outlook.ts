/**
 * server/integrations/outlook.ts
 *
 * Microsoft Graph mail adapter. Methods mirror the Gmail adapter where
 * possible so the agent's plan-engine tools can target either provider
 * with minimal branching:
 *
 *   - Messages: list / get / send / reply / forward / move / mark read
 *   - Folders: list mailFolders, look up well-known folder ids
 *   - Attachments: list, download, upload (large via session)
 *   - Subscriptions: create / renew / delete (real-time push)
 *   - Search: $search / $filter syntax
 *
 * Differences from Gmail to keep in mind:
 *   - Messages have stable RFC `internetMessageId` headers, plus Graph-only
 *     `id` (different field, both useful).
 *   - Attachments inline vs. fileAttachment have different shapes.
 *   - Subscriptions max 70h then must be renewed; vs. Gmail's 7-day watch.
 *   - Send vs. Save: `/sendMail` posts directly; `/messages` POST creates
 *     a draft you must then send.
 */

import { logger } from '../utils/logger.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export interface OutlookMessage {
  id: string;
  internetMessageId: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: 'html' | 'text'; content: string };
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  bccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  parentFolderId?: string;
  categories?: string[];
}

export interface OutlookSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
}

export interface OutlookFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
  totalItemCount?: number;
  wellKnownName?: string;
}

export interface OutlookAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  '@odata.type'?: string;
  contentBytes?: string;          // base64 (only for fileAttachment with $expand)
  contentId?: string;
}

export class OutlookAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | string[]>; consistencyLevel?: 'eventual' }): Promise<T> {
    const url = new URL(`${GRAPH_BASE}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
        else url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    if (init?.consistencyLevel) headers.ConsistencyLevel = init.consistencyLevel;
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
      const err: any = new Error(`Graph ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.graphError = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Profile ────────────────────────────────────────────────────────────

  getMe(): Promise<{ id: string; mail: string | null; userPrincipalName: string; displayName: string | null }> {
    return this.req('GET', '/me?$select=id,mail,userPrincipalName,displayName');
  }

  // ── Folders ────────────────────────────────────────────────────────────

  async listMailFolders(): Promise<OutlookFolder[]> {
    const res = await this.req<{ value: OutlookFolder[] }>('GET', '/me/mailFolders?$top=50');
    return res.value ?? [];
  }

  /** Resolve a well-known folder name (Inbox, SentItems, Drafts, ...) to its id. */
  async getFolderByWellKnownName(name: 'inbox' | 'sentitems' | 'drafts' | 'deleteditems' | 'archive' | 'junkemail'): Promise<OutlookFolder> {
    return this.req<OutlookFolder>('GET', `/me/mailFolders/${name}`);
  }

  // ── Messages ───────────────────────────────────────────────────────────

  /**
   * List messages. Supports OData $filter, $search, $select, $top, $skip,
   * $orderby. Common patterns:
   *
   *   listMessages({ folder: 'inbox', filter: 'isRead eq false', top: 50 })
   *   listMessages({ search: '"order #1042"' })
   */
  async listMessages(params: {
    folder?: string;             // well-known name OR folder id
    top?: number;
    skip?: number;
    select?: string[];
    orderBy?: string;            // e.g. 'receivedDateTime desc'
    filter?: string;             // OData filter
    search?: string;             // '$search' query (must be quoted)
  } = {}): Promise<OutlookMessage[]> {
    const path = params.folder
      ? `/me/mailFolders/${params.folder}/messages`
      : '/me/messages';
    const query: Record<string, string | number | string[]> = {
      $top: Math.min(params.top ?? 50, 1000),
      ...(params.skip ? { $skip: params.skip } : {}),
      $orderby: params.orderBy ?? 'receivedDateTime desc',
    };
    if (params.select?.length) query.$select = params.select.join(',');
    if (params.filter) query.$filter = params.filter;
    if (params.search) query.$search = params.search;
    const res = await this.req<{ value: OutlookMessage[]; '@odata.nextLink'?: string }>('GET', path, { query, consistencyLevel: params.search ? 'eventual' : undefined });
    return res.value ?? [];
  }

  getMessage(messageId: string, opts: { expandAttachments?: boolean } = {}): Promise<OutlookMessage & { attachments?: OutlookAttachment[] }> {
    const path = `/me/messages/${messageId}`;
    if (opts.expandAttachments) {
      return this.req('GET', path, { query: { $expand: 'attachments' } });
    }
    return this.req<OutlookMessage>('GET', path);
  }

  /** Fire-and-forget send: doesn't create a draft, just sends and saves to Sent Items. */
  async sendMail(input: {
    subject: string;
    body: string;
    bodyType?: 'html' | 'text';
    to: string[];
    cc?: string[];
    bcc?: string[];
    saveToSentItems?: boolean;
    attachments?: Array<{ name: string; contentType: string; contentBytes: string }>;
  }): Promise<void> {
    await this.req('POST', '/me/sendMail', {
      body: {
        message: {
          subject: input.subject,
          body: { contentType: input.bodyType ?? 'html', content: input.body },
          toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
          ...(input.cc?.length ? { ccRecipients: input.cc.map((a) => ({ emailAddress: { address: a } })) } : {}),
          ...(input.bcc?.length ? { bccRecipients: input.bcc.map((a) => ({ emailAddress: { address: a } })) } : {}),
          ...(input.attachments?.length ? {
            attachments: input.attachments.map((att) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: att.name,
              contentType: att.contentType,
              contentBytes: att.contentBytes,
            })),
          } : {}),
        },
        saveToSentItems: input.saveToSentItems ?? true,
      },
    });
  }

  /**
   * Reply to an existing message in its conversation. Graph creates a new
   * message threaded under the original `conversationId` and sends it.
   */
  async replyToMessage(messageId: string, input: { comment?: string; replyAll?: boolean }): Promise<void> {
    const path = input.replyAll
      ? `/me/messages/${messageId}/replyAll`
      : `/me/messages/${messageId}/reply`;
    await this.req('POST', path, {
      body: { comment: input.comment ?? '' },
    });
  }

  async forwardMessage(messageId: string, input: { to: string[]; comment?: string }): Promise<void> {
    await this.req('POST', `/me/messages/${messageId}/forward`, {
      body: {
        comment: input.comment ?? '',
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
      },
    });
  }

  /** Update message metadata (mark read, change importance, add/remove categories). */
  patchMessage(messageId: string, input: { isRead?: boolean; importance?: 'low' | 'normal' | 'high'; categories?: string[]; flag?: { flagStatus: 'flagged' | 'complete' | 'notFlagged' } }): Promise<OutlookMessage> {
    return this.req('PATCH', `/me/messages/${messageId}`, { body: input });
  }

  moveMessage(messageId: string, destinationFolderId: string): Promise<OutlookMessage> {
    return this.req('POST', `/me/messages/${messageId}/move`, {
      body: { destinationId: destinationFolderId },
    });
  }

  copyMessage(messageId: string, destinationFolderId: string): Promise<OutlookMessage> {
    return this.req('POST', `/me/messages/${messageId}/copy`, {
      body: { destinationId: destinationFolderId },
    });
  }

  trashMessage(messageId: string): Promise<OutlookMessage> {
    return this.moveMessage(messageId, 'deleteditems');
  }

  // ── Attachments ────────────────────────────────────────────────────────

  async listAttachments(messageId: string): Promise<OutlookAttachment[]> {
    const res = await this.req<{ value: OutlookAttachment[] }>('GET', `/me/messages/${messageId}/attachments`);
    return res.value ?? [];
  }

  /** Get a single attachment with its base64 contentBytes inlined. */
  getAttachment(messageId: string, attachmentId: string): Promise<OutlookAttachment> {
    return this.req('GET', `/me/messages/${messageId}/attachments/${attachmentId}`);
  }

  /** Download attachment bytes. Returns a Buffer ready to forward / store. */
  async downloadAttachment(messageId: string, attachmentId: string): Promise<{ data: Buffer; contentType: string; name: string }> {
    const att = await this.getAttachment(messageId, attachmentId);
    if (!att.contentBytes) throw new Error('Attachment has no inline contentBytes');
    return {
      data: Buffer.from(att.contentBytes, 'base64'),
      contentType: att.contentType,
      name: att.name,
    };
  }

  // ── Drafts ─────────────────────────────────────────────────────────────

  async createDraft(input: {
    subject: string;
    body: string;
    bodyType?: 'html' | 'text';
    to: string[];
    cc?: string[];
    threadConversationId?: string;
  }): Promise<OutlookMessage> {
    return this.req('POST', '/me/messages', {
      body: {
        subject: input.subject,
        body: { contentType: input.bodyType ?? 'html', content: input.body },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
        ...(input.cc?.length ? { ccRecipients: input.cc.map((a) => ({ emailAddress: { address: a } })) } : {}),
        ...(input.threadConversationId ? { conversationId: input.threadConversationId } : {}),
      },
    });
  }

  sendDraft(draftId: string): Promise<void> {
    return this.req('POST', `/me/messages/${draftId}/send`);
  }

  deleteDraft(draftId: string): Promise<void> {
    return this.req('DELETE', `/me/messages/${draftId}`);
  }

  // ── Real-time webhooks (Microsoft Graph subscriptions) ──────────────────

  /**
   * Create a subscription so Graph pushes change notifications to our
   * webhook URL when new messages arrive.
   *
   * Lifecycle:
   *   - Max `expirationDateTime` is now + 70 hours (4230 min).
   *   - Microsoft sends a one-time validation request to `notificationUrl`
   *     immediately after creation; our webhook MUST echo the
   *     `validationToken` in <10s.
   *   - Each subsequent notification carries `clientState` so we can
   *     verify it came from our own subscription (rough HMAC equivalent).
   *
   * Renewal: call `renewSubscription` from a cron before expiration.
   */
  async createSubscription(input: {
    notificationUrl: string;
    clientState: string;          // shared secret; we echo this in webhook validation
    resource?: string;            // default: '/me/messages'
    changeType?: string;          // default: 'created' (we add updated/deleted later if needed)
    expirationMinutes?: number;   // default: 4200 (just under 70h)
    lifecycleNotificationUrl?: string;
  }): Promise<OutlookSubscription> {
    const minutes = Math.min(input.expirationMinutes ?? 4200, 4230);
    return this.req('POST', '/subscriptions', {
      body: {
        changeType: input.changeType ?? 'created',
        notificationUrl: input.notificationUrl,
        resource: input.resource ?? '/me/messages',
        expirationDateTime: new Date(Date.now() + minutes * 60_000).toISOString(),
        clientState: input.clientState,
        ...(input.lifecycleNotificationUrl ? { lifecycleNotificationUrl: input.lifecycleNotificationUrl } : {}),
      },
    });
  }

  async renewSubscription(subscriptionId: string, expirationMinutes = 4200): Promise<OutlookSubscription> {
    return this.req('PATCH', `/subscriptions/${subscriptionId}`, {
      body: {
        expirationDateTime: new Date(Date.now() + expirationMinutes * 60_000).toISOString(),
      },
    });
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.req('DELETE', `/subscriptions/${subscriptionId}`);
    } catch (err: any) {
      if (err?.statusCode !== 404) throw err;
      logger.debug('Outlook subscription already gone', { subscriptionId });
    }
  }

  async listSubscriptions(): Promise<OutlookSubscription[]> {
    const res = await this.req<{ value: OutlookSubscription[] }>('GET', '/subscriptions');
    return res.value ?? [];
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Return the message body as text+html (mirrors Gmail's `extractMessageBody`). */
export function extractOutlookBody(message: OutlookMessage): { plain: string | null; html: string | null } {
  const body = message.body;
  if (!body) return { plain: null, html: null };
  if (body.contentType === 'html') {
    return { plain: null, html: body.content };
  }
  return { plain: body.content, html: null };
}

/** First sender address (for case ingestion). */
export function senderAddress(message: OutlookMessage): string | null {
  return message.from?.emailAddress?.address ?? null;
}
