/**
 * server/integrations/asana-oauth.ts
 *
 * Asana OAuth 2.0 (authorization_code).
 *
 *  - Auth URL:  https://app.asana.com/-/oauth_authorize
 *  - Token URL: https://app.asana.com/-/oauth_token
 *  - API base:  https://app.asana.com/api/1.0/
 *  - Tokens: 1h access, refresh via refresh_token
 *  - Webhooks: per-resource. The handshake response includes
 *    `X-Hook-Secret`; we MUST echo it back on first POST. Subsequent
 *    deliveries are signed with `X-Hook-Signature` = hex HMAC-SHA256
 *    of the raw body keyed with that secret.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://app.asana.com/-/oauth_authorize';
const TOKEN_URL = 'https://app.asana.com/-/oauth_token';

export const ASANA_API_BASE = 'https://app.asana.com/api/1.0';

export const ASANA_SCOPES = ['default'] as const; // Asana uses a single 'default' scope

export interface AsanaOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: AsanaOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: AsanaOAuthEnv): StatePayload {
  const dot = state.indexOf('.');
  if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

export function buildInstallUrl(opts: { state: string; env: AsanaOAuthEnv }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    response_type: 'code',
    state: opts.state,
    scope: ASANA_SCOPES.join(' '),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface AsanaTokenGrant { accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number; data?: { id: string; email: string; name: string } }

export async function exchangeCodeForToken(opts: { code: string; env: AsanaOAuthEnv }): Promise<AsanaTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: opts.env.clientId, client_secret: opts.env.clientSecret, code: opts.code, redirect_uri: opts.env.redirectUri }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`asana token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, tokenType: data.token_type ?? 'bearer', expiresIn: data.expires_in ?? 3600, data: data.data };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: AsanaOAuthEnv }): Promise<AsanaTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: opts.env.clientId, client_secret: opts.env.clientSecret, refresh_token: opts.refreshToken }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`asana token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken, tokenType: data.token_type ?? 'bearer', expiresIn: data.expires_in ?? 3600 };
}

/** Verify Asana webhook signature: hex HMAC SHA256 of raw body keyed with the per-webhook secret. */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; secret: string }): boolean {
  const expected = createHmac('sha256', opts.secret).update(opts.rawBody).digest('hex');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
