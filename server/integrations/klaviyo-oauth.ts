/**
 * server/integrations/klaviyo-oauth.ts
 *
 * Klaviyo OAuth 2.0.
 *  - Auth URL:  https://www.klaviyo.com/oauth/authorize
 *  - Token URL: https://a.klaviyo.com/oauth/token
 *  - API base:  https://a.klaviyo.com/api/  (with revision header)
 *  - Tokens: 1h access, refresh via refresh_token
 *  - Webhooks: per-account. Signed with `klaviyo-signature` header
 *    (HMAC SHA256 of the raw body, base64 encoded, keyed with the
 *    webhook's signing secret returned at creation time).
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://www.klaviyo.com/oauth/authorize';
const TOKEN_URL = 'https://a.klaviyo.com/oauth/token';
export const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
export const KLAVIYO_API_REVISION = '2024-10-15';

export const KLAVIYO_SCOPES = [
  'profiles:read', 'profiles:write',
  'lists:read', 'lists:write',
  'segments:read',
  'campaigns:read',
  'flows:read',
  'events:read', 'events:write',
  'subscriptions:write',
  'webhooks:read', 'webhooks:write',
  'metrics:read',
  'tags:read', 'tags:write',
] as const;

export interface KlaviyoOAuthEnv { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string }
interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: KlaviyoOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: KlaviyoOAuthEnv): StatePayload {
  const dot = state.indexOf('.');
  if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot); const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

export function buildInstallUrl(opts: { state: string; env: KlaviyoOAuthEnv; codeChallenge: string }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: KLAVIYO_SCOPES.join(' '),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface KlaviyoTokenGrant { accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number; scope: string }

export async function exchangeCodeForToken(opts: { code: string; codeVerifier: string; env: KlaviyoOAuthEnv }): Promise<KlaviyoTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.env.redirectUri, code_verifier: opts.codeVerifier }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`klaviyo token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 3600, scope: data.scope ?? '' };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: KlaviyoOAuthEnv }): Promise<KlaviyoTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: opts.refreshToken }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`klaviyo token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 3600, scope: data.scope ?? '' };
}

/** PKCE helpers — Klaviyo requires PKCE on auth code flow. */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const { createHash } = require('crypto');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function verifyWebhookSignature(opts: { rawBody: string; signature: string; secret: string }): boolean {
  const expected = createHmac('sha256', opts.secret).update(opts.rawBody).digest('base64');
  const a = Buffer.from(opts.signature); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
