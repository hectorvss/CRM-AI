/**
 * server/integrations/gmail.ts
 *
 * Gmail API adapter (REST v1). Built per merchant — each tenant's
 * resolver injects their access token. The adapter is stateless beyond
 * the token, so per-call refresh is handled in gmail-tenant.ts.
 *
 * Surface (covers ~95% of customer-support workflows):
 *  - Threads: list / get / modify (label/unread/archive)
 *  - Messages: list / get / send / reply / forward / trash / untrash
 *  - Attachments: download by attachment ID
 *  - Labels: list / create / delete (used to surface a "Clain" inbox)
 *  - History: incremental sync (the historyId-driven loop)
 *  - Watch: register Pub/Sub push notifications for real-time inbound
 *  - Profile: emailAddress + historyId (used after install)
 *
 * Docs: https://developers.google.com/gmail/api/reference/rest
 */

import { logger } from '../utils/logger.js';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GmailHeader { name: string; value: string }
export interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
}
export interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}
export interface GmailLabel {
  id: string;
  name: string;
  type?: 'system' | 'user';
  labelListVisibility?: string;
  messageListVisibility?: string;
}
export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}
export interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}
export interface GmailHistoryRecord {
  id: string;
  messages?: Array<{ id: string; threadId: string }>;
  messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds?: string[] } }>;
  messagesDeleted?: Array<{ message: { id: string; threadId: string } }>;
  labelsAdded?: Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
  labelsRemoved?: Array<{ message: { id: string; threadId: string }; labelIds: string[] }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build an RFC 5322 message body so we can hand Gmail a raw email. Gmail's
 * /messages/send expects `raw` to be base64url(rfc5322).
 */
export function buildRfc5322Message(input: {
  from?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;                  // plain text or HTML
  mimeType?: 'text/plain' | 'text/html';
  inReplyTo?: string;            // RFC Message-ID we're replying to
  references?: string[];         // RFC Message-IDs in the chain
  threadHeaders?: Record<string, string>;
}): string {
  const lines: string[] = [];
  if (input.from) lines.push(`From: ${input.from}`);
  lines.push(`To: ${input.to}`);
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  if (input.bcc) lines.push(`Bcc: ${input.bcc}`);
  lines.push(`Subject: ${encodeMimeHeader(input.subject)}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references && input.references.length > 0) {
    lines.push(`References: ${input.references.join(' ')}`);
  }
  for (const [k, v] of Object.entries(input.threadHeaders ?? {})) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: ${input.mimeType ?? 'text/plain'}; charset="UTF-8"`);
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(Buffer.from(input.body, 'utf8').toString('base64'));
  return lines.join('\r\n');
}

/** Encode a Subject (or any header) that may contain non-ASCII. */
function encodeMimeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Decode base64url MIME body parts (the raw bytes Gmail returns). */
export function decodeMessagePartBody(part: GmailMessagePart | undefined): string | null {
  if (!part?.body?.data) return null;
  const padded = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Walk a Gmail payload tree and return the most useful body content as
 * plain text. Prefers text/plain; falls back to stripping HTML.
 */
export function extractMessageBody(message: GmailMessage): { plain: string | null; html: string | null } {
  if (!message.payload) return { plain: null, html: null };
  let plain: string | null = null;
  let html: string | null = null;

  function walk(part: GmailMessagePart): void {
    if (part.mimeType === 'text/plain' && !plain) {
      plain = decodeMessagePartBody(part);
    } else if (part.mimeType === 'text/html' && !html) {
      html = decodeMessagePartBody(part);
    }
    if (part.parts) for (const child of part.parts) walk(child);
  }
  walk(message.payload);
  return { plain, html };
}

/** Pull a header value (case-insensitive) from a message payload. */
export function header(message: GmailMessage, name: string): string | null {
  const headers = message.payload?.headers ?? [];
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class GmailAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | string[]> }): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
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
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Surface Google's error envelope: { error: { code, message, status } }
      let message = text;
      try {
        const j = JSON.parse(text);
        message = j?.error?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`Gmail ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.googleError = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Profile ────────────────────────────────────────────────────────────

  getProfile(): Promise<GmailProfile> {
    return this.req<GmailProfile>('GET', '/users/me/profile');
  }

  // ── Messages ───────────────────────────────────────────────────────────

  listMessages(params: {
    q?: string;                   // Gmail search syntax: "is:unread newer_than:7d from:foo@bar.com"
    labelIds?: string[];          // e.g. ['INBOX'], ['UNREAD']
    maxResults?: number;
    pageToken?: string;
    includeSpamTrash?: boolean;
  } = {}): Promise<{ messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate?: number }> {
    return this.req('GET', '/users/me/messages', {
      query: {
        q: params.q ?? '',
        ...(params.labelIds ? { labelIds: params.labelIds } : {}),
        maxResults: Math.min(params.maxResults ?? 50, 500),
        ...(params.pageToken ? { pageToken: params.pageToken } : {}),
        includeSpamTrash: params.includeSpamTrash === true,
      },
    });
  }

  getMessage(messageId: string, format: 'full' | 'metadata' | 'minimal' | 'raw' = 'full'): Promise<GmailMessage> {
    return this.req<GmailMessage>('GET', `/users/me/messages/${messageId}`, { query: { format } });
  }

  /**
   * Send a new email or reply to a thread. Pass `threadId` to keep Gmail
   * threading the message in the right conversation.
   */
  async sendMessage(input: {
    raw: string;                  // RFC 5322 string (NOT base64-encoded — we encode here)
    threadId?: string;
  }): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
    return this.req('POST', '/users/me/messages/send', {
      body: {
        raw: base64UrlEncode(input.raw),
        ...(input.threadId ? { threadId: input.threadId } : {}),
      },
    });
  }

  trashMessage(messageId: string): Promise<GmailMessage> {
    return this.req('POST', `/users/me/messages/${messageId}/trash`);
  }

  untrashMessage(messageId: string): Promise<GmailMessage> {
    return this.req('POST', `/users/me/messages/${messageId}/untrash`);
  }

  /**
   * Add/remove labels on a message — used to mark unread/read, archive
   * (remove INBOX), star (STARRED), or apply a custom label.
   */
  modifyMessage(messageId: string, input: { addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<GmailMessage> {
    return this.req('POST', `/users/me/messages/${messageId}/modify`, { body: input });
  }

  batchModify(input: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<void> {
    return this.req('POST', '/users/me/messages/batchModify', { body: input });
  }

  // ── Threads ────────────────────────────────────────────────────────────

  listThreads(params: { q?: string; labelIds?: string[]; maxResults?: number; pageToken?: string } = {}): Promise<{ threads?: Array<{ id: string; snippet: string; historyId: string }>; nextPageToken?: string; resultSizeEstimate?: number }> {
    return this.req('GET', '/users/me/threads', {
      query: {
        q: params.q ?? '',
        ...(params.labelIds ? { labelIds: params.labelIds } : {}),
        maxResults: Math.min(params.maxResults ?? 50, 500),
        ...(params.pageToken ? { pageToken: params.pageToken } : {}),
      },
    });
  }

  getThread(threadId: string, format: 'full' | 'metadata' | 'minimal' = 'full'): Promise<GmailThread> {
    return this.req<GmailThread>('GET', `/users/me/threads/${threadId}`, { query: { format } });
  }

  modifyThread(threadId: string, input: { addLabelIds?: string[]; removeLabelIds?: string[] }): Promise<GmailThread> {
    return this.req('POST', `/users/me/threads/${threadId}/modify`, { body: input });
  }

  trashThread(threadId: string): Promise<GmailThread> {
    return this.req('POST', `/users/me/threads/${threadId}/trash`);
  }

  // ── Attachments ────────────────────────────────────────────────────────

  /** Returns the attachment body as a Buffer (Gmail base64url-encodes it on the wire). */
  async getAttachment(messageId: string, attachmentId: string): Promise<{ data: Buffer; size: number }> {
    const res = await this.req<{ size: number; data: string }>(
      'GET',
      `/users/me/messages/${messageId}/attachments/${attachmentId}`,
    );
    const padded = res.data.replace(/-/g, '+').replace(/_/g, '/');
    return { data: Buffer.from(padded, 'base64'), size: res.size };
  }

  // ── Labels ─────────────────────────────────────────────────────────────

  listLabels(): Promise<{ labels: GmailLabel[] }> {
    return this.req('GET', '/users/me/labels');
  }

  /** Create a custom label — used by us to tag messages we've ingested ("Clain"). */
  createLabel(input: { name: string; labelListVisibility?: 'labelShow' | 'labelHide'; messageListVisibility?: 'show' | 'hide' }): Promise<GmailLabel> {
    return this.req('POST', '/users/me/labels', {
      body: {
        name: input.name,
        labelListVisibility: input.labelListVisibility ?? 'labelShow',
        messageListVisibility: input.messageListVisibility ?? 'show',
      },
    });
  }

  deleteLabel(labelId: string): Promise<void> {
    return this.req('DELETE', `/users/me/labels/${labelId}`);
  }

  // ── History (incremental sync) ─────────────────────────────────────────

  /**
   * Retrieve all changes since `startHistoryId`. We persist `historyId`
   * after every sync and pass it back in to get only the delta.
   *
   * Gmail returns 404 if the historyId is older than ~7 days — we treat
   * that as "do a full re-sync" rather than a hard error.
   */
  async listHistory(params: { startHistoryId: string; labelId?: string; maxResults?: number; pageToken?: string }): Promise<{ history?: GmailHistoryRecord[]; nextPageToken?: string; historyId: string }> {
    return this.req('GET', '/users/me/history', {
      query: {
        startHistoryId: params.startHistoryId,
        ...(params.labelId ? { labelId: params.labelId } : {}),
        maxResults: Math.min(params.maxResults ?? 100, 500),
        ...(params.pageToken ? { pageToken: params.pageToken } : {}),
      },
    });
  }

  // ── Watch (real-time push via Pub/Sub) ─────────────────────────────────

  /**
   * Tell Gmail to publish change notifications to the given Pub/Sub topic.
   * Watches expire after 7 days — caller MUST renew before expiration.
   *
   * The topic format is: projects/{GCP_PROJECT}/topics/{TOPIC_NAME}
   * The `gmail-api-push@system.gserviceaccount.com` service account must
   * have publisher permission on that topic (configured in GCP IAM).
   */
  watch(input: {
    topicName: string;
    labelIds?: string[];          // default: all labels (everything triggers)
    labelFilterAction?: 'include' | 'exclude';
  }): Promise<GmailWatchResponse> {
    return this.req('POST', '/users/me/watch', {
      body: {
        topicName: input.topicName,
        ...(input.labelIds ? { labelIds: input.labelIds } : {}),
        ...(input.labelFilterAction ? { labelFilterAction: input.labelFilterAction.toUpperCase() } : {}),
      },
    });
  }

  /** Cancel an active watch — call on disconnect to stop notifications. */
  async stopWatch(): Promise<void> {
    try {
      await this.req('POST', '/users/me/stop');
    } catch (err: any) {
      if (err?.statusCode !== 404) throw err;
      // 404 = no active watch; treat as success.
    }
  }

  // ── Drafts ─────────────────────────────────────────────────────────────

  listDrafts(params: { maxResults?: number; pageToken?: string; q?: string } = {}): Promise<{ drafts?: Array<{ id: string; message: { id: string; threadId: string } }>; nextPageToken?: string }> {
    return this.req('GET', '/users/me/drafts', {
      query: {
        maxResults: Math.min(params.maxResults ?? 50, 500),
        ...(params.pageToken ? { pageToken: params.pageToken } : {}),
        ...(params.q ? { q: params.q } : {}),
      },
    });
  }

  createDraft(input: { raw: string; threadId?: string }): Promise<{ id: string; message: GmailMessage }> {
    return this.req('POST', '/users/me/drafts', {
      body: {
        message: {
          raw: base64UrlEncode(input.raw),
          ...(input.threadId ? { threadId: input.threadId } : {}),
        },
      },
    });
  }

  sendDraft(draftId: string): Promise<{ id: string; threadId: string }> {
    return this.req('POST', '/users/me/drafts/send', { body: { id: draftId } });
  }

  deleteDraft(draftId: string): Promise<void> {
    return this.req('DELETE', `/users/me/drafts/${draftId}`);
  }
}

// ── Pub/Sub push payload decoder ──────────────────────────────────────────

/**
 * Decode a Pub/Sub push notification body. Google sends:
 *   { message: { data: <base64(json)>, attributes: {...}, messageId, publishTime }, subscription }
 *
 * The decoded JSON has shape: { emailAddress, historyId }.
 * Our webhook handler uses these to resolve the tenant and run incremental sync.
 */
export function decodePubSubPush(body: unknown): { emailAddress: string; historyId: string } | null {
  try {
    const data = (body as any)?.message?.data;
    if (typeof data !== 'string') return null;
    const decoded = Buffer.from(data, 'base64').toString('utf8');
    const json = JSON.parse(decoded) as { emailAddress?: string; historyId?: string };
    if (!json.emailAddress || !json.historyId) return null;
    return { emailAddress: json.emailAddress, historyId: String(json.historyId) };
  } catch (err) {
    logger.warn('decodePubSubPush failed', { error: String(err) });
    return null;
  }
}
