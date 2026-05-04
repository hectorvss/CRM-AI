/**
 * server/integrations/calendly-oauth.ts
 *
 * Calendly OAuth 2.0. Notes:
 *  - Auth URL: auth.calendly.com/oauth/authorize
 *  - Token URL: auth.calendly.com/oauth/token
 *  - Tokens: 1h expiry + refresh_token. We refresh transparently.
 *  - No scopes parameter — the OAuth grant gives full access. Calendly
 *    relies on subscription-tier feature gating instead.
 *  - Webhook v2: signed `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`
 *    where v1 = HMAC-SHA256(`<t>.<rawBody>`, signing_key) hex.
 *    The signing_key is generated when we create a webhook subscription;
 *    we persist it on the connector for verification.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://auth.calendly.com/oauth/authorize';
const TOKEN_URL = 'https://auth.calendly.com/oauth/token';

export const CALENDLY_API_BASE = 'https://api.calendly.com';

export interface CalendlyOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: CalendlyOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: CalendlyOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: CalendlyOAuthEnv }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface CalendlyTokenGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType: string;
  /** URI of the user resource — `/users/{uuid}`. */
  ownerUri: string | null;
  /** URI of the organization resource — `/organizations/{uuid}`. */
  organizationUri: string | null;
  scope: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: CalendlyOAuthEnv }): Promise<CalendlyTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    code: opts.code,
    redirect_uri: opts.env.redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`calendly token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 3600) - 60) * 1000).toISOString(),
    tokenType: data.token_type ?? 'Bearer',
    ownerUri: data.owner ?? null,
    organizationUri: data.organization ?? null,
    scope: data.scope ?? null,
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: CalendlyOAuthEnv }): Promise<CalendlyTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`calendly refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 3600) - 60) * 1000).toISOString(),
    tokenType: data.token_type ?? 'Bearer',
    ownerUri: data.owner ?? null,
    organizationUri: data.organization ?? null,
    scope: data.scope ?? null,
  };
}

export async function revokeToken(token: string, env: CalendlyOAuthEnv): Promise<void> {
  try {
    await fetch('https://auth.calendly.com/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        token,
      }).toString(),
    });
  } catch { /* best-effort */ }
}

/**
 * Verify a Calendly webhook v2 signature.
 * Header: `Calendly-Webhook-Signature: t=<unix-ts>,v1=<hex-hmac>`.
 * v1 = HMAC-SHA256(`<t>.<rawBody>`, signing_key) → hex.
 * Replay window: 3 minutes (Calendly recommendation).
 */
export function verifyWebhookSignature(opts: {
  rawBody: string;
  header: string;          // full Calendly-Webhook-Signature header value
  signingKey: string;
  toleranceMs?: number;
}): boolean {
  const tolerance = opts.toleranceMs ?? 3 * 60 * 1000;
  const parts = opts.header.split(',').map(p => p.trim());
  let t: string | null = null;
  let v1: string | null = null;
  for (const p of parts) {
    const [k, v] = p.split('=', 2);
    if (k === 't') t = v;
    if (k === 'v1') v1 = v;
  }
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > tolerance / 1000) return false;
  const expected = createHmac('sha256', opts.signingKey).update(`${t}.${opts.rawBody}`).digest('hex');
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
