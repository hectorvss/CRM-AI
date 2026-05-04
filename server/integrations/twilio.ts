/**
 * server/integrations/twilio.ts
 *
 * Twilio adapter — SMS + WhatsApp via Twilio's Programmable Messaging.
 *
 * Auth model: Twilio is API-key based (no OAuth). Merchants paste:
 *   - Account SID  (AC...)        — acts as username
 *   - Auth Token                  — used for Basic auth + webhook signing
 *   OR (preferred for production):
 *   - API Key SID    (SK...)
 *   - API Key Secret
 *   (the Account SID is still required as the resource owner)
 *
 * Validation: hit GET /v1/Accounts/{SID}.json before saving — Twilio
 * returns the account's friendlyName + status, which we surface on the
 * connected modal.
 *
 * Webhook signature: HMAC-SHA1 over `fullUrl + sortedParams` keyed by
 * the auth token, base64-encoded. Multi-tenant: each merchant uses
 * THEIR token, so signature verification needs the resolved tenant
 * before it can run.
 *
 * Docs: https://www.twilio.com/docs/usage/api
 */

import { createHmac, timingSafeEqual } from 'crypto';

const API_BASE = 'https://api.twilio.com/2010-04-01';
const CONVERSATIONS_BASE = 'https://conversations.twilio.com/v1';
const MESSAGING_BASE = 'https://messaging.twilio.com/v1';

export interface TwilioCreds {
  accountSid: string;
  /** Use authToken for the simplest setup; or apiKey/apiSecret for narrower access. */
  authToken?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
}

export interface TwilioMessageOut {
  to: string;
  body?: string;
  from?: string;                 // e.g. +14155551234 or messagingServiceSid
  messagingServiceSid?: string;
  mediaUrls?: string[];          // for MMS / WhatsApp media
  /** WhatsApp pre-approved templates (Content API). */
  contentSid?: string;
  contentVariables?: Record<string, string>;
  /** Receive a status callback at this URL once Twilio finalises the send. */
  statusCallback?: string;
  /** Idempotency: pass a stable key per logical message to dedupe retries. */
  idempotencyKey?: string;
}

export interface TwilioMessage {
  sid: string;
  account_sid: string;
  to: string;
  from: string;
  body: string;
  status: string;                // queued | sending | sent | delivered | failed | undelivered
  direction: string;             // inbound | outbound-api | outbound-call | outbound-reply
  num_segments: string;
  num_media: string;
  price: string | null;
  price_unit: string | null;
  error_code: number | null;
  error_message: string | null;
  date_created: string;
  date_updated: string;
  date_sent: string | null;
  uri: string;
}

export interface TwilioAccount {
  sid: string;
  friendly_name: string;
  status: string;                // active | suspended | closed
  type: string;
  date_created: string;
  date_updated: string;
}

export interface TwilioPhoneNumber {
  sid: string;
  account_sid: string;
  phone_number: string;
  friendly_name: string;
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean };
  sms_url?: string | null;
  sms_method?: string | null;
  voice_url?: string | null;
  status_callback?: string | null;
  date_created: string;
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class TwilioAdapter {
  constructor(private readonly creds: TwilioCreds) {}

  /** Twilio uses HTTP Basic with either AccountSID:AuthToken or APIKey:Secret. */
  private authHeader(): string {
    const useApiKey = this.creds.apiKeySid && this.creds.apiKeySecret;
    const user = useApiKey ? this.creds.apiKeySid! : this.creds.accountSid;
    const pass = useApiKey ? this.creds.apiKeySecret! : (this.creds.authToken ?? '');
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }

  private async req<T>(method: string, url: string, init?: { body?: URLSearchParams; idempotencyKey?: string }): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
      Accept: 'application/json',
    };
    let body: BodyInit | undefined;
    if (init?.body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = init.body.toString();
    }
    if (init?.idempotencyKey) {
      headers['I-Twilio-Idempotency-Token'] = init.idempotencyKey;
    }
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      try {
        const j = JSON.parse(text);
        message = j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`Twilio ${method} ${url} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.twilioCode = (() => { try { return JSON.parse(text)?.code ?? null; } catch { return null; } })();
      err.twilioRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Account / validation ─────────────────────────────────────────────────

  async getAccount(): Promise<TwilioAccount> {
    return this.req<TwilioAccount>('GET', `${API_BASE}/Accounts/${this.creds.accountSid}.json`);
  }

  /** Live USD balance — handy for warning the merchant when low. */
  async getBalance(): Promise<{ balance: string; currency: string; account_sid: string }> {
    return this.req('GET', `${API_BASE}/Accounts/${this.creds.accountSid}/Balance.json`);
  }

  // ── Phone numbers ────────────────────────────────────────────────────────

  /** Numbers owned by the account — used by the picker UI. */
  async listIncomingPhoneNumbers(opts: { phoneNumber?: string; pageSize?: number } = {}): Promise<TwilioPhoneNumber[]> {
    const url = new URL(`${API_BASE}/Accounts/${this.creds.accountSid}/IncomingPhoneNumbers.json`);
    url.searchParams.set('PageSize', String(opts.pageSize ?? 50));
    if (opts.phoneNumber) url.searchParams.set('PhoneNumber', opts.phoneNumber);
    const res = await this.req<{ incoming_phone_numbers: TwilioPhoneNumber[] }>('GET', url.toString());
    return res.incoming_phone_numbers ?? [];
  }

  /** Available numbers for purchase in a given country. */
  async listAvailablePhoneNumbers(opts: { country: string; type?: 'Local' | 'TollFree' | 'Mobile'; areaCode?: string; smsEnabled?: boolean }): Promise<Array<{ phone_number: string; friendly_name: string; locality: string; region: string; iso_country: string; capabilities: { voice?: boolean; SMS?: boolean; MMS?: boolean } }>> {
    const url = new URL(`${API_BASE}/Accounts/${this.creds.accountSid}/AvailablePhoneNumbers/${opts.country}/${opts.type ?? 'Local'}.json`);
    if (opts.areaCode) url.searchParams.set('AreaCode', opts.areaCode);
    if (opts.smsEnabled) url.searchParams.set('SmsEnabled', 'true');
    const res = await this.req<{ available_phone_numbers: any[] }>('GET', url.toString());
    return res.available_phone_numbers ?? [];
  }

  async purchasePhoneNumber(opts: { phoneNumber: string; smsUrl?: string; statusCallback?: string; friendlyName?: string }): Promise<TwilioPhoneNumber> {
    const body = new URLSearchParams();
    body.set('PhoneNumber', opts.phoneNumber);
    if (opts.smsUrl) body.set('SmsUrl', opts.smsUrl);
    if (opts.statusCallback) body.set('StatusCallback', opts.statusCallback);
    if (opts.friendlyName) body.set('FriendlyName', opts.friendlyName);
    return this.req('POST', `${API_BASE}/Accounts/${this.creds.accountSid}/IncomingPhoneNumbers.json`, { body });
  }

  /**
   * Programmatically set the webhook URL on an existing number so the
   * merchant doesn't have to do it manually in Twilio's console.
   */
  async configurePhoneNumberWebhooks(opts: { phoneNumberSid: string; smsUrl?: string; smsMethod?: 'POST' | 'GET'; statusCallback?: string; voiceUrl?: string }): Promise<TwilioPhoneNumber> {
    const body = new URLSearchParams();
    if (opts.smsUrl) body.set('SmsUrl', opts.smsUrl);
    if (opts.smsMethod) body.set('SmsMethod', opts.smsMethod);
    if (opts.statusCallback) body.set('StatusCallback', opts.statusCallback);
    if (opts.voiceUrl) body.set('VoiceUrl', opts.voiceUrl);
    return this.req('POST', `${API_BASE}/Accounts/${this.creds.accountSid}/IncomingPhoneNumbers/${opts.phoneNumberSid}.json`, { body });
  }

  // ── Messages: SMS + WhatsApp ─────────────────────────────────────────────

  /**
   * Send a Twilio message. WhatsApp uses the same endpoint with
   * `whatsapp:+E164` prefix on To/From. Templates require `contentSid`.
   *
   *   sendMessage({ to: 'whatsapp:+34612345678', from: 'whatsapp:+14155551234', body: 'Hello' })
   *   sendMessage({ to: '+34612345678', body: 'Hi' })  // SMS
   */
  async sendMessage(input: TwilioMessageOut): Promise<TwilioMessage> {
    const body = new URLSearchParams();
    body.set('To', input.to);
    if (input.body) body.set('Body', input.body);
    if (input.from) body.set('From', input.from);
    if (input.messagingServiceSid) body.set('MessagingServiceSid', input.messagingServiceSid);
    if (input.mediaUrls) {
      for (const url of input.mediaUrls) body.append('MediaUrl', url);
    }
    if (input.contentSid) body.set('ContentSid', input.contentSid);
    if (input.contentVariables) body.set('ContentVariables', JSON.stringify(input.contentVariables));
    if (input.statusCallback) body.set('StatusCallback', input.statusCallback);

    return this.req('POST', `${API_BASE}/Accounts/${this.creds.accountSid}/Messages.json`, {
      body,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async listMessages(opts: { to?: string; from?: string; dateSentAfter?: string; pageSize?: number } = {}): Promise<TwilioMessage[]> {
    const url = new URL(`${API_BASE}/Accounts/${this.creds.accountSid}/Messages.json`);
    url.searchParams.set('PageSize', String(opts.pageSize ?? 50));
    if (opts.to) url.searchParams.set('To', opts.to);
    if (opts.from) url.searchParams.set('From', opts.from);
    if (opts.dateSentAfter) url.searchParams.set('DateSent>', opts.dateSentAfter);
    const res = await this.req<{ messages: TwilioMessage[] }>('GET', url.toString());
    return res.messages ?? [];
  }

  async getMessage(messageSid: string): Promise<TwilioMessage> {
    return this.req('GET', `${API_BASE}/Accounts/${this.creds.accountSid}/Messages/${messageSid}.json`);
  }

  // ── WhatsApp templates (Content API) ─────────────────────────────────────
  // Templates are managed via the Content API. We expose only "list approved
  // templates" — creation is rare and best done in Twilio's console.

  async listContent(): Promise<unknown[]> {
    const res = await this.req<{ contents: unknown[] }>('GET', `${MESSAGING_BASE.replace('messaging', 'content')}/Content`);
    return res.contents ?? [];
  }

  // ── Conversations API (unified inbox across channels) ───────────────────
  // Used when the merchant prefers Conversations over per-channel Messages.

  async createConversation(input: { friendlyName?: string; uniqueName?: string; messagingServiceSid?: string; attributes?: Record<string, unknown> }): Promise<{ sid: string }> {
    const body = new URLSearchParams();
    if (input.friendlyName) body.set('FriendlyName', input.friendlyName);
    if (input.uniqueName) body.set('UniqueName', input.uniqueName);
    if (input.messagingServiceSid) body.set('MessagingServiceSid', input.messagingServiceSid);
    if (input.attributes) body.set('Attributes', JSON.stringify(input.attributes));
    return this.req('POST', `${CONVERSATIONS_BASE}/Conversations`, { body });
  }

  async addConversationParticipant(conversationSid: string, input: { messagingBindingAddress: string; messagingBindingProxyAddress: string }): Promise<unknown> {
    const body = new URLSearchParams();
    body.set('MessagingBinding.Address', input.messagingBindingAddress);
    body.set('MessagingBinding.ProxyAddress', input.messagingBindingProxyAddress);
    return this.req('POST', `${CONVERSATIONS_BASE}/Conversations/${conversationSid}/Participants`, { body });
  }

  // ── Webhook signature verification ──────────────────────────────────────
  // Static helper because the webhook handler resolves the tenant FIRST and
  // then calls verify with that tenant's authToken — we don't need an
  // adapter instance at that point.

  static verifyWebhookSignature(opts: { authToken: string; fullUrl: string; params: Record<string, string>; providedSignature: string }): boolean {
    if (!opts.authToken || !opts.providedSignature) return false;

    const sortedKeys = Object.keys(opts.params).sort();
    const dataToSign = sortedKeys.reduce((acc, key) => acc + key + (opts.params[key] ?? ''), opts.fullUrl);

    const expected = createHmac('sha1', opts.authToken)
      .update(Buffer.from(dataToSign, 'utf-8'))
      .digest('base64');

    const a = Buffer.from(opts.providedSignature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
