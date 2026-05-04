/**
 * server/integrations/front-oauth.ts
 *
 * Front OAuth 2.0 (authorization_code).
 *
 *  - Auth URL:  https://app.frontapp.com/oauth/authorize
 *  - Token URL: https://app.frontapp.com/oauth/token
 *  - API base:  https://api2.frontapp.com/
 *  - Tokens: 1h access, refresh via refresh_token
 *  - Webhooks: dynamic application webhooks via REST. Signed with
 *    `X-Front-Signature` header which is base64 HMAC-SHA256 of the raw body
 *    keyed with the **app secret** (the OAuth client_secret), NOT a per-
 *    webhook secret. So we verify with our app secret directly.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://app.frontapp.com/oauth/authorize';
const TOKEN_URL = 'https://app.frontapp.com/oauth/token';

export const FRONT_API_BASE = 'https://api2.frontapp.com';

export const FRONT_SCOPES = ['shared:*', 'private:*'] as const;

export interface FrontOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: FrontOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: FrontOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: FrontOAuthEnv }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    client_id: opts.env.clientId,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface FrontTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: FrontOAuthEnv }): Promise<FrontTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.env.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`front token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? '',
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: FrontOAuthEnv }): Promise<FrontTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`front token refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? '',
  };
}

/**
 * Verify a Front webhook delivery.
 * Header: `X-Front-Signature` is base64 HMAC-SHA256 of `<timestamp>:<rawBody>`
 * keyed with the **app secret** (= OAuth client_secret).
 * `X-Front-Request-Timestamp` is the unix seconds.
 */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; timestamp: string; appSecret: string }): boolean {
  // Reject if timestamp drift > 5 minutes
  const t = Number(opts.timestamp);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', opts.appSecret).update(`${opts.timestamp}:${opts.rawBody}`).digest('base64');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
