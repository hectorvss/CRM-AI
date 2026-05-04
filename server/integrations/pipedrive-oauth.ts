/**
 * server/integrations/pipedrive-oauth.ts
 *
 * Pipedrive OAuth 2.0 (authorization_code).
 *
 *  - Auth URL:  https://oauth.pipedrive.com/oauth/authorize
 *  - Token URL: https://oauth.pipedrive.com/oauth/token
 *  - API base:  per-company, returned as `api_domain` (e.g. https://your-company.pipedrive.com/api/v1)
 *  - Tokens: 1h access, refresh via refresh_token
 *  - Webhooks: created via REST. Optional HTTP Basic auth on the
 *    callback URL — we set a per-tenant random user/password and verify
 *    those headers.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://oauth.pipedrive.com/oauth/authorize';
const TOKEN_URL = 'https://oauth.pipedrive.com/oauth/token';

export interface PipedriveOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: PipedriveOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: PipedriveOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: PipedriveOAuthEnv }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface PipedriveTokenGrant {
  accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number; scope: string;
  apiDomain: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: PipedriveOAuthEnv }): Promise<PipedriveTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.env.redirectUri }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`pipedrive token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token, refreshToken: data.refresh_token ?? null,
    tokenType: data.token_type ?? 'bearer', expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? '', apiDomain: data.api_domain ?? null,
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: PipedriveOAuthEnv }): Promise<PipedriveTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: opts.refreshToken }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`pipedrive token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken,
    tokenType: data.token_type ?? 'bearer', expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? '', apiDomain: data.api_domain ?? null,
  };
}

export function generateBasicCredentials(): { user: string; pass: string } {
  return {
    user: `pipedrive-${randomBytes(6).toString('hex')}`,
    pass: randomBytes(24).toString('base64url'),
  };
}

/**
 * Verify the HTTP Basic auth header on an incoming Pipedrive webhook against
 * the credentials we set when registering the hook.
 */
export function verifyBasicAuth(headerValue: string, expected: { user: string; pass: string }): boolean {
  if (!headerValue || !headerValue.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(headerValue.slice('Basic '.length), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return false;
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    const ub = Buffer.from(u); const eb = Buffer.from(expected.user);
    const pb = Buffer.from(p); const epb = Buffer.from(expected.pass);
    return ub.length === eb.length && pb.length === epb.length && timingSafeEqual(ub, eb) && timingSafeEqual(pb, epb);
  } catch { return false; }
}
