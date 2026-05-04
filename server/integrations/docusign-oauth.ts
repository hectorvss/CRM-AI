/**
 * server/integrations/docusign-oauth.ts
 *
 * DocuSign OAuth 2.0 (authorization_code).
 *  - Auth URL:  https://account.docusign.com/oauth/auth
 *  - Token URL: https://account.docusign.com/oauth/token
 *  - UserInfo:  https://account.docusign.com/oauth/userinfo  (returns accounts[] with base_uri)
 *  - API base:  per-account `<base_uri>/restapi/v2.1/accounts/{accountId}`
 *  - Tokens: 8h access, 30-day refresh
 *  - Webhooks (Connect): per-envelope, signed with HMAC SHA256 base64 in
 *    `X-DocuSign-Signature-1` keyed with the HMAC secret defined per-config.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://account.docusign.com/oauth/auth';
const TOKEN_URL = 'https://account.docusign.com/oauth/token';
const USERINFO  = 'https://account.docusign.com/oauth/userinfo';

export const DOCUSIGN_SCOPES = ['signature', 'extended'] as const;

export interface DocuSignOAuthEnv { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string; hmacSecret: string }
interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: DocuSignOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: DocuSignOAuthEnv): StatePayload {
  const dot = state.indexOf('.'); if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot); const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

export function buildInstallUrl(opts: { state: string; env: DocuSignOAuthEnv }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: DOCUSIGN_SCOPES.join(' '),
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface DocuSignTokenGrant { accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number }

export async function exchangeCodeForToken(opts: { code: string; env: DocuSignOAuthEnv }): Promise<DocuSignTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: opts.code }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`docusign token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 28800 };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: DocuSignOAuthEnv }): Promise<DocuSignTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: opts.refreshToken }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`docusign token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 28800 };
}

export interface DocuSignAccountInfo { account_id: string; account_name: string; base_uri: string; is_default: boolean }
export interface DocuSignUserInfo { sub: string; name: string; given_name: string; family_name: string; email: string; accounts: DocuSignAccountInfo[] }

export async function fetchUserInfo(accessToken: string): Promise<DocuSignUserInfo> {
  const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`docusign userinfo failed: ${res.status}`);
  return (await res.json()) as DocuSignUserInfo;
}

/** DocuSign Connect signs payloads with HMAC SHA256 base64 of the raw body. */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; secret: string }): boolean {
  const expected = createHmac('sha256', opts.secret).update(opts.rawBody).digest('base64');
  const a = Buffer.from(opts.signature); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
