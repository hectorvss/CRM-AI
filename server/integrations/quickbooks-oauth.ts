/**
 * server/integrations/quickbooks-oauth.ts
 *
 * Intuit QuickBooks Online OAuth 2.0.
 *  - Auth URL:  https://appcenter.intuit.com/connect/oauth2
 *  - Token URL: https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
 *  - Revoke:    https://developer.api.intuit.com/v2/oauth2/tokens/revoke
 *  - API base:  https://quickbooks.api.intuit.com/v3/company/{realmId}
 *  - Tokens: 1h access, 100-day refresh (rotation on every refresh).
 *  - Webhooks: configured at app level. Header `intuit-signature` =
 *    base64 HMAC-SHA256 of raw body keyed with the **Verifier Token**
 *    set in the Intuit Developer Dashboard.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

export const QUICKBOOKS_API_BASE = 'https://quickbooks.api.intuit.com/v3/company';

export const QUICKBOOKS_SCOPES = [
  'com.intuit.quickbooks.accounting',
  'openid', 'profile', 'email',
] as const;

export interface QuickBooksOAuthEnv { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string; verifierToken: string }
interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: QuickBooksOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: QuickBooksOAuthEnv): StatePayload {
  const dot = state.indexOf('.'); if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot); const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

export function buildInstallUrl(opts: { state: string; env: QuickBooksOAuthEnv }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    scope: QUICKBOOKS_SCOPES.join(' '),
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface QuickBooksTokenGrant { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number; xRefreshTokenExpiresIn: number }

export async function exchangeCodeForToken(opts: { code: string; env: QuickBooksOAuthEnv }): Promise<QuickBooksTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.env.redirectUri }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`quickbooks token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 3600, xRefreshTokenExpiresIn: data.x_refresh_token_expires_in ?? 8_640_000 };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: QuickBooksOAuthEnv }): Promise<QuickBooksTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: opts.refreshToken }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`quickbooks token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 3600, xRefreshTokenExpiresIn: data.x_refresh_token_expires_in ?? 8_640_000 };
}

export async function revokeToken(opts: { token: string; env: QuickBooksOAuthEnv }): Promise<void> {
  try {
    const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: opts.token }),
    });
  } catch { /* best-effort */ }
}

/** Verify QuickBooks webhook. Header `intuit-signature` = base64 HMAC SHA256(raw, verifierToken). */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; verifierToken: string }): boolean {
  const expected = createHmac('sha256', opts.verifierToken).update(opts.rawBody).digest('base64');
  const a = Buffer.from(opts.signature); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
