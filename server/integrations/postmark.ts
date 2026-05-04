/**
 * server/integrations/postmark.ts
 *
 * Postmark transactional email adapter.
 *
 * Auth: Server Token (per Postmark "Server"). Used as
 *   X-Postmark-Server-Token: <token>
 * on every API call. There's no OAuth, no token rotation — the merchant
 * pastes the Server Token from their Postmark dashboard and we store it
 * encrypted-at-rest in `connectors.auth_config`.
 *
 * Surface (covers ~100% of customer-support outbound flows):
 *  - Send: single, batch, with template (TemplateAlias or TemplateId),
 *    HTML + plain text, attachments, reply-to, custom headers, tracking.
 *  - Read: messages outbound (search), specific message + events
 *    (delivery, bounce, spam, open, click).
 *  - Suppressions: list bounces, un-suppress (reactivate) a bouncing
 *    address, list spam complaints, list active suppressions.
 *  - Identity: domain DKIM/SPF status, signatures (sender identities),
 *    server info (rate limits, configured webhooks).
 *  - Templates: list, get one, render preview.
 *  - Webhooks: list, create, update, delete (programmatically).
 *
 * Docs: https://postmarkapp.com/developer
 */

import { logger } from '../utils/logger.js';

const API_BASE = 'https://api.postmarkapp.com';
const ACCOUNTS_BASE = 'https://api.postmarkapp.com'; // Account API uses same host with X-Postmark-Account-Token

export interface PostmarkSendInput {
  from: string;                          // "Sender Name <sender@yourdomain.com>"
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  replyTo?: string;
  tag?: string;                          // for filtering in Postmark dashboard
  metadata?: Record<string, string>;
  headers?: Array<{ Name: string; Value: string }>;
  attachments?: Array<{ Name: string; Content: string; ContentType: string; ContentID?: string }>;
  trackOpens?: boolean;
  trackLinks?: 'None' | 'HtmlAndText' | 'HtmlOnly' | 'TextOnly';
  messageStream?: string;               // default 'outbound'; for broadcast streams change this
}

export interface PostmarkSendResult {
  To: string;
  SubmittedAt: string;
  MessageID: string;
  ErrorCode: number;
  Message: string;
}

export interface PostmarkTemplateSendInput extends Omit<PostmarkSendInput, 'subject' | 'htmlBody' | 'textBody'> {
  templateId?: number;
  templateAlias?: string;
  templateModel: Record<string, unknown>;
  inlineCss?: boolean;
}

export interface PostmarkServer {
  ID: number;
  Name: string;
  ApiTokens: string[];
  Color: string;
  ServerLink: string;
  SmtpApiActivated: boolean;
  RawEmailEnabled: boolean;
  DeliveryHookUrl?: string;
  InboundHookUrl?: string;
  BounceHookUrl?: string;
  OpenHookUrl?: string;
  ClickHookUrl?: string;
}

export interface PostmarkDomain {
  ID: number;
  Name: string;
  SPFVerified: boolean;
  DKIMVerified: boolean;
  WeakDKIM: boolean;
  ReturnPathDomainVerified: boolean;
}

export interface PostmarkSignature {
  ID: number;
  Domain: string;
  EmailAddress: string;
  ReplyToEmailAddress: string;
  Name: string;
  Confirmed: boolean;
}

export interface PostmarkBounce {
  ID: number;
  Type: string;             // HardBounce, SoftBounce, Transient, ...
  TypeCode: number;
  Name: string;
  Tag: string;
  MessageID: string;
  Email: string;
  BouncedAt: string;
  Inactive: boolean;
  CanActivate: boolean;
  Subject: string;
  ServerID: number;
  Description: string;
  Details: string;
}

export interface PostmarkOutboundMessage {
  Tag: string;
  MessageID: string;
  To: Array<{ Email: string; Name: string }>;
  From: string;
  Subject: string;
  Status: string;            // Sent, Queued, Failed, ...
  ReceivedAt: string;
  TrackOpens: boolean;
  TrackLinks: string;
  MessageStream: string;
}

export class PostmarkAdapter {
  constructor(
    private readonly serverToken: string,
    /** Optional account token — only needed for cross-server admin (servers list, domains). */
    private readonly accountToken?: string,
  ) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean>; useAccountToken?: boolean }): Promise<T> {
    const url = new URL(`${init?.useAccountToken ? ACCOUNTS_BASE : API_BASE}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (init?.useAccountToken) {
      if (!this.accountToken) throw new Error('Postmark account token required for this call');
      headers['X-Postmark-Account-Token'] = this.accountToken;
    } else {
      headers['X-Postmark-Server-Token'] = this.serverToken;
    }
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
        message = j?.Message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`Postmark ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.postmarkErrorCode = (() => { try { return JSON.parse(text)?.ErrorCode ?? null; } catch { return null; } })();
      err.postmarkRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Server info / health ────────────────────────────────────────────────

  /** Identity check: hits /server with the server token. Returns the server config. */
  async getServer(): Promise<PostmarkServer> {
    return this.req<PostmarkServer>('GET', '/server');
  }

  // ── Sending ─────────────────────────────────────────────────────────────

  async send(input: PostmarkSendInput): Promise<PostmarkSendResult> {
    return this.req<PostmarkSendResult>('POST', '/email', {
      body: this.buildSendBody(input),
    });
  }

  async sendBatch(inputs: PostmarkSendInput[]): Promise<PostmarkSendResult[]> {
    return this.req<PostmarkSendResult[]>('POST', '/email/batch', {
      body: inputs.map((i) => this.buildSendBody(i)),
    });
  }

  async sendWithTemplate(input: PostmarkTemplateSendInput): Promise<PostmarkSendResult> {
    if (!input.templateId && !input.templateAlias) {
      throw new Error('sendWithTemplate requires either templateId or templateAlias');
    }
    const body: any = this.buildSendBody({ ...input, subject: '', htmlBody: undefined, textBody: undefined });
    if (input.templateId) body.TemplateId = input.templateId;
    if (input.templateAlias) body.TemplateAlias = input.templateAlias;
    body.TemplateModel = input.templateModel;
    if (input.inlineCss !== undefined) body.InlineCss = input.inlineCss;
    delete body.Subject; delete body.HtmlBody; delete body.TextBody;
    return this.req<PostmarkSendResult>('POST', '/email/withTemplate', { body });
  }

  async sendBatchWithTemplate(inputs: PostmarkTemplateSendInput[]): Promise<PostmarkSendResult[]> {
    return this.req<PostmarkSendResult[]>('POST', '/email/batchWithTemplates', {
      body: {
        Messages: inputs.map((i) => {
          const body: any = this.buildSendBody({ ...i, subject: '', htmlBody: undefined, textBody: undefined });
          if (i.templateId) body.TemplateId = i.templateId;
          if (i.templateAlias) body.TemplateAlias = i.templateAlias;
          body.TemplateModel = i.templateModel;
          delete body.Subject; delete body.HtmlBody; delete body.TextBody;
          return body;
        }),
      },
    });
  }

  private buildSendBody(input: PostmarkSendInput): Record<string, unknown> {
    const toList = Array.isArray(input.to) ? input.to.join(', ') : input.to;
    const ccList = input.cc ? (Array.isArray(input.cc) ? input.cc.join(', ') : input.cc) : undefined;
    const bccList = input.bcc ? (Array.isArray(input.bcc) ? input.bcc.join(', ') : input.bcc) : undefined;
    return {
      From: input.from,
      To: toList,
      ...(ccList ? { Cc: ccList } : {}),
      ...(bccList ? { Bcc: bccList } : {}),
      Subject: input.subject,
      ...(input.htmlBody ? { HtmlBody: input.htmlBody } : {}),
      ...(input.textBody ? { TextBody: input.textBody } : {}),
      ...(input.replyTo ? { ReplyTo: input.replyTo } : {}),
      ...(input.tag ? { Tag: input.tag } : {}),
      ...(input.metadata ? { Metadata: input.metadata } : {}),
      ...(input.headers ? { Headers: input.headers } : {}),
      ...(input.attachments ? { Attachments: input.attachments } : {}),
      ...(input.trackOpens !== undefined ? { TrackOpens: input.trackOpens } : {}),
      ...(input.trackLinks ? { TrackLinks: input.trackLinks } : {}),
      MessageStream: input.messageStream ?? 'outbound',
    };
  }

  // ── Outbound message search ─────────────────────────────────────────────

  async listOutboundMessages(opts: { count?: number; offset?: number; recipient?: string; fromEmail?: string; tag?: string; status?: 'Queued' | 'Sent' | 'Processed' | 'Failed'; messagestream?: string; fromdate?: string; todate?: string } = {}): Promise<{ TotalCount: number; Messages: PostmarkOutboundMessage[] }> {
    return this.req('GET', '/messages/outbound', {
      query: {
        count: Math.min(opts.count ?? 50, 500),
        offset: opts.offset ?? 0,
        ...(opts.recipient ? { recipient: opts.recipient } : {}),
        ...(opts.fromEmail ? { fromemail: opts.fromEmail } : {}),
        ...(opts.tag ? { tag: opts.tag } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.messagestream ? { messagestream: opts.messagestream } : {}),
        ...(opts.fromdate ? { fromdate: opts.fromdate } : {}),
        ...(opts.todate ? { todate: opts.todate } : {}),
      },
    });
  }

  async getOutboundMessage(messageId: string): Promise<unknown> {
    return this.req('GET', `/messages/outbound/${messageId}/details`);
  }

  async getMessageOpens(messageId: string): Promise<unknown> {
    return this.req('GET', `/messages/outbound/opens/${messageId}`);
  }

  async getMessageClicks(messageId: string): Promise<unknown> {
    return this.req('GET', `/messages/outbound/clicks/${messageId}`);
  }

  // ── Bounces / suppressions ──────────────────────────────────────────────

  async listBounces(opts: { count?: number; offset?: number; type?: string; emailFilter?: string; tag?: string; messageID?: string; fromdate?: string; todate?: string } = {}): Promise<{ TotalCount: number; Bounces: PostmarkBounce[] }> {
    return this.req('GET', '/bounces', {
      query: {
        count: Math.min(opts.count ?? 50, 500),
        offset: opts.offset ?? 0,
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.emailFilter ? { emailFilter: opts.emailFilter } : {}),
        ...(opts.tag ? { tag: opts.tag } : {}),
        ...(opts.messageID ? { messageID: opts.messageID } : {}),
        ...(opts.fromdate ? { fromdate: opts.fromdate } : {}),
        ...(opts.todate ? { todate: opts.todate } : {}),
      },
    });
  }

  async getBounce(bounceId: number): Promise<PostmarkBounce> {
    return this.req('GET', `/bounces/${bounceId}`);
  }

  /** Reactivate a suppressed address — Postmark stops sending to bounced addresses by default. */
  async activateBounce(bounceId: number): Promise<{ Message: string; Bounce: PostmarkBounce }> {
    return this.req('PUT', `/bounces/${bounceId}/activate`);
  }

  async deleteSuppression(stream: string, email: string): Promise<unknown> {
    return this.req('POST', `/message-streams/${stream}/suppressions/delete`, {
      body: { Suppressions: [{ EmailAddress: email }] },
    });
  }

  async listSuppressions(stream = 'outbound'): Promise<unknown> {
    return this.req('GET', `/message-streams/${stream}/suppressions/dump`);
  }

  // ── Sender identity / domains ───────────────────────────────────────────
  // These need the Account Token (cross-server admin). If absent we throw.

  async listDomains(opts: { count?: number; offset?: number } = {}): Promise<{ TotalCount: number; Domains: PostmarkDomain[] }> {
    return this.req('GET', '/domains', {
      query: { count: Math.min(opts.count ?? 50, 500), offset: opts.offset ?? 0 },
      useAccountToken: true,
    });
  }

  async getDomain(domainId: number): Promise<PostmarkDomain & { DKIMHost?: string; DKIMTextValue?: string; ReturnPathDomain?: string; SPFTextValue?: string }> {
    return this.req('GET', `/domains/${domainId}`, { useAccountToken: true });
  }

  /** Trigger DKIM/SPF re-verification — useful after the merchant adds DNS records. */
  async verifyDomainDkim(domainId: number): Promise<unknown> {
    return this.req('PUT', `/domains/${domainId}/verifyDkim`, { useAccountToken: true });
  }

  async verifyDomainReturnPath(domainId: number): Promise<unknown> {
    return this.req('PUT', `/domains/${domainId}/verifyReturnPath`, { useAccountToken: true });
  }

  async listSenderSignatures(opts: { count?: number; offset?: number } = {}): Promise<{ TotalCount: number; SenderSignatures: PostmarkSignature[] }> {
    return this.req('GET', '/senders', {
      query: { count: Math.min(opts.count ?? 50, 500), offset: opts.offset ?? 0 },
      useAccountToken: true,
    });
  }

  // ── Templates ───────────────────────────────────────────────────────────

  async listTemplates(opts: { count?: number; offset?: number; templateType?: 'Standard' | 'Layout' } = {}): Promise<{ TotalCount: number; Templates: Array<{ TemplateId: number; Alias: string; Name: string; Active: boolean; TemplateType: string }> }> {
    return this.req('GET', '/templates', {
      query: { count: Math.min(opts.count ?? 100, 500), offset: opts.offset ?? 0, ...(opts.templateType ? { templateType: opts.templateType } : {}) },
    });
  }

  async getTemplate(idOrAlias: number | string): Promise<unknown> {
    return this.req('GET', `/templates/${idOrAlias}`);
  }

  // ── Webhook management ──────────────────────────────────────────────────
  // Postmark calls these "Webhooks" (separate from per-event hook URLs on the server).

  async listWebhooks(messagestream = 'outbound'): Promise<{ Webhooks: Array<{ ID: number; Url: string; MessageStream: string; HttpAuth?: { Username: string; Password: string }; HttpHeaders?: Array<{ Name: string; Value: string }>; Triggers: any }> }> {
    return this.req('GET', '/webhooks', { query: { messagestream } });
  }

  async createWebhook(input: {
    url: string;
    messageStream?: string;
    httpAuth?: { Username: string; Password: string };
    httpHeaders?: Array<{ Name: string; Value: string }>;
    triggers?: {
      Open?: { Enabled: boolean; PostFirstOpenOnly?: boolean };
      Click?: { Enabled: boolean };
      Delivery?: { Enabled: boolean };
      Bounce?: { Enabled: boolean; IncludeContent?: boolean };
      SpamComplaint?: { Enabled: boolean; IncludeContent?: boolean };
      SubscriptionChange?: { Enabled: boolean };
    };
  }): Promise<{ ID: number; Url: string }> {
    return this.req('POST', '/webhooks', {
      body: {
        Url: input.url,
        MessageStream: input.messageStream ?? 'outbound',
        ...(input.httpAuth ? { HttpAuth: input.httpAuth } : {}),
        ...(input.httpHeaders ? { HttpHeaders: input.httpHeaders } : {}),
        Triggers: input.triggers ?? {
          Open: { Enabled: true, PostFirstOpenOnly: false },
          Click: { Enabled: true },
          Delivery: { Enabled: true },
          Bounce: { Enabled: true, IncludeContent: false },
          SpamComplaint: { Enabled: true, IncludeContent: false },
          SubscriptionChange: { Enabled: true },
        },
      },
    });
  }

  async deleteWebhook(webhookId: number): Promise<void> {
    await this.req('DELETE', `/webhooks/${webhookId}`);
  }
}
