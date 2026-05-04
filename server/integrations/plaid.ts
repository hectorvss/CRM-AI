/**
 * server/integrations/plaid.ts
 *
 * Plaid REST API adapter. Plaid uses client_id + secret + access_token
 * authentication (no OAuth user flow — auth happens client-side via
 * Plaid Link, which exchanges a public_token for a per-user access_token).
 *
 *  - Sandbox: https://sandbox.plaid.com
 *  - Dev:     https://development.plaid.com
 *  - Prod:    https://production.plaid.com
 *
 * Webhooks: POSTs JSON envelope. Verified by JWT in `Plaid-Verification`
 * header (signed with a per-environment public key fetched from
 * /webhook_verification_key/get). For simplicity we additionally use a
 * URL-path token per tenant to discriminate.
 */

import { logger } from '../utils/logger.js';

export type PlaidEnvironment = 'sandbox' | 'development' | 'production';

const ENVIRONMENT_BASE_URLS: Record<PlaidEnvironment, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

export class PlaidAuthError extends Error { constructor(m: string) { super(m); this.name = 'PlaidAuthError'; } }

export interface PlaidLinkTokenResponse { link_token: string; expiration: string; request_id: string }
export interface PlaidExchangeResponse { access_token: string; item_id: string; request_id: string }
export interface PlaidAccount { account_id: string; balances: { available: number | null; current: number | null; iso_currency_code: string | null }; mask: string | null; name: string; official_name: string | null; subtype: string | null; type: string }
export interface PlaidIdentity { account_id: string; owners: Array<{ names: string[]; phone_numbers: any[]; emails: any[]; addresses: any[] }> }

export class PlaidAdapter {
  private base: string;
  constructor(private clientId: string, private secret: string, env: PlaidEnvironment) {
    this.base = ENVIRONMENT_BASE_URLS[env];
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: this.clientId, secret: this.secret, ...body }),
    });
    if (res.status === 401 || res.status === 403) throw new PlaidAuthError(`plaid ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`plaid ${path} failed: ${res.status} ${text}`); }
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('/categories/get', {}); return { ok: true }; }
    catch (err) { logger.warn('plaid ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Link token (client-side exchange flow) ─────────────────────────────────
  async createLinkToken(opts: { userClientId: string; clientName: string; products: string[]; countryCodes: string[]; language: string; webhook?: string; redirectUri?: string }): Promise<PlaidLinkTokenResponse> {
    return this.request('/link/token/create', {
      user: { client_user_id: opts.userClientId },
      client_name: opts.clientName,
      products: opts.products,
      country_codes: opts.countryCodes,
      language: opts.language,
      ...(opts.webhook ? { webhook: opts.webhook } : {}),
      ...(opts.redirectUri ? { redirect_uri: opts.redirectUri } : {}),
    });
  }

  /** Exchange public_token (returned by Plaid Link onSuccess) for a permanent access_token. */
  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeResponse> {
    return this.request('/item/public_token/exchange', { public_token: publicToken });
  }

  // ── Account / identity / balance reads (per-item access_token) ─────────────
  async getAccounts(accessToken: string): Promise<PlaidAccount[]> {
    const r = await this.request<{ accounts: PlaidAccount[] }>('/accounts/get', { access_token: accessToken });
    return r.accounts;
  }

  async getBalance(accessToken: string): Promise<PlaidAccount[]> {
    const r = await this.request<{ accounts: PlaidAccount[] }>('/accounts/balance/get', { access_token: accessToken });
    return r.accounts;
  }

  async getIdentity(accessToken: string): Promise<PlaidIdentity[]> {
    const r = await this.request<{ accounts: PlaidIdentity[] }>('/identity/get', { access_token: accessToken });
    return r.accounts;
  }

  async getAuth(accessToken: string): Promise<{ accounts: PlaidAccount[]; numbers: { ach: any[]; bacs: any[]; international: any[] } }> {
    return this.request('/auth/get', { access_token: accessToken });
  }

  async getTransactions(accessToken: string, opts: { startDate: string; endDate: string; count?: number; offset?: number }): Promise<{ accounts: PlaidAccount[]; transactions: any[]; total_transactions: number }> {
    return this.request('/transactions/get', { access_token: accessToken, start_date: opts.startDate, end_date: opts.endDate, options: { count: opts.count ?? 100, offset: opts.offset ?? 0 } });
  }

  async itemRemove(accessToken: string): Promise<{ removed: boolean; request_id: string }> {
    return this.request('/item/remove', { access_token: accessToken });
  }

  // ── Webhook verification key ───────────────────────────────────────────────
  async getWebhookVerificationKey(keyId: string): Promise<any> {
    return this.request('/webhook_verification_key/get', { key_id: keyId });
  }
}
