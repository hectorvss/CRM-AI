/**
 * server/integrations/docusign.ts
 *
 * DocuSign eSignature REST API v2.1 adapter, scoped to a single account.
 * Base: `<base_uri>/restapi/v2.1/accounts/{accountId}/`
 */

import { logger } from '../utils/logger.js';

export class DocuSignAuthError extends Error { constructor(m: string) { super(m); this.name = 'DocuSignAuthError'; } }

export interface DocuSignEnvelope {
  envelopeId: string; status: string;
  emailSubject?: string; emailBlurb?: string;
  sentDateTime?: string; completedDateTime?: string; voidedDateTime?: string;
  recipients?: any;
}

export interface DocuSignRecipient { name: string; email: string; routingOrder?: string; recipientId?: string; clientUserId?: string }

export class DocuSignAdapter {
  private base: string;
  constructor(private accessToken: string, public accountId: string, public baseUri: string) {
    this.base = `${baseUri.replace(/\/$/, '')}/restapi/v2.1/accounts/${encodeURIComponent(accountId)}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new DocuSignAuthError(`docusign ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`docusign ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('GET', '/'); return { ok: true }; }
    catch (err) { logger.warn('docusign ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Envelopes ──────────────────────────────────────────────────────────────
  /**
   * Send an envelope from a template OR raw documents. Returns envelopeId.
   * For raw signing, pass `documents` (with base64 content) and `recipients`.
   */
  async createEnvelope(payload: {
    emailSubject: string; emailBlurb?: string;
    status?: 'sent' | 'created'; // 'sent' = send now, 'created' = draft
    templateId?: string; templateRoles?: Array<{ name: string; email: string; roleName: string; clientUserId?: string }>;
    documents?: Array<{ name: string; documentId: string; fileExtension: string; documentBase64: string }>;
    recipients?: { signers?: DocuSignRecipient[]; carbonCopies?: DocuSignRecipient[] };
  }): Promise<{ envelopeId: string; uri: string; statusDateTime: string; status: string }> {
    return this.request('POST', '/envelopes', { ...payload, status: payload.status ?? 'sent' });
  }

  async getEnvelope(envelopeId: string): Promise<DocuSignEnvelope> {
    return this.request<DocuSignEnvelope>('GET', `/envelopes/${encodeURIComponent(envelopeId)}`);
  }

  async listEnvelopes(opts: { fromDate?: string; status?: string; count?: number } = {}): Promise<{ envelopes: DocuSignEnvelope[]; resultSetSize?: string }> {
    const params = new URLSearchParams();
    params.set('count', String(opts.count ?? 25));
    if (opts.fromDate) params.set('from_date', opts.fromDate);
    else params.set('from_date', new Date(Date.now() - 30 * 86400_000).toISOString());
    if (opts.status) params.set('status', opts.status);
    const r = await this.request<any>('GET', `/envelopes?${params.toString()}`);
    return { envelopes: r?.envelopes ?? [], resultSetSize: r?.resultSetSize };
  }

  async voidEnvelope(envelopeId: string, reason: string): Promise<void> {
    await this.request('PUT', `/envelopes/${encodeURIComponent(envelopeId)}`, { status: 'voided', voidedReason: reason });
  }

  /** Returns the recipient signing URL (for embedded signing — recipient must have clientUserId). */
  async createRecipientView(envelopeId: string, payload: { userName: string; email: string; clientUserId: string; returnUrl: string; authenticationMethod?: string }): Promise<{ url: string }> {
    return this.request('POST', `/envelopes/${encodeURIComponent(envelopeId)}/views/recipient`, { authenticationMethod: payload.authenticationMethod ?? 'none', ...payload });
  }

  async listTemplates(opts: { count?: number } = {}): Promise<any[]> {
    const r = await this.request<any>('GET', `/templates?count=${opts.count ?? 25}`);
    return r?.envelopeTemplates ?? [];
  }

  // ── Connect (webhooks) ─────────────────────────────────────────────────────
  /**
   * DocuSign Connect is configured at account level via REST or admin UI.
   * Custom configurations require CONNECT_USER permission. We expose a
   * helper to list current configurations; creation/management is done in
   * the DocuSign admin UI typically.
   */
  async listConnectConfigurations(): Promise<any[]> {
    const r = await this.request<any>('GET', '/connect');
    return r?.configurations ?? [];
  }
}
