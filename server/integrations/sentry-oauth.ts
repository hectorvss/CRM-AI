/**
 * server/integrations/sentry-oauth.ts
 *
 * Sentry OAuth (Sentry Integration Platform).
 *  - Auth URL:  https://sentry.io/oauth/authorize/  (org-scoped via `installationUuid`)
 *  - Token URL: https://sentry.io/api/0/sentry-app-installations/{installationUuid}/authorizations/
 *  - API base:  https://sentry.io/api/0/
 *  - Tokens: 8h access, refresh via refresh_token
 *  - Webhooks: signed with `Sentry-Hook-Signature` = hex HMAC SHA256 of
 *    raw body keyed with the integration's client_secret.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export const SENTRY_API_BASE = 'https://sentry.io/api/0';
const AUTH_URL = 'https://sentry.io/sentry-app-installations';

export const SENTRY_SCOPES = [
  'org:read', 'project:read', 'project:write',
  'team:read',
  'event:read', 'event:write',
  'member:read',
] as const;

export interface SentryOAuthEnv { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string }
interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: SentryOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: SentryOAuthEnv): StatePayload {
  const dot = state.indexOf('.'); if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot); const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

/**
 * Sentry Integration Platform install URL — user picks an org and authorizes
 * the public app. Install slug must be configured on the Sentry app.
 */
export function buildInstallUrl(opts: { state: string; sentryAppSlug: string }): string {
  const params = new URLSearchParams({ state: opts.state });
  return `https://sentry.io/sentry-apps/${encodeURIComponent(opts.sentryAppSlug)}/external-install/?${params.toString()}`;
}

export interface SentryTokenGrant { accessToken: string; refreshToken: string; expiresAt: string; scope: string }

/**
 * Sentry calls our redirect with `code` + `installationId`. We POST to the
 * authorizations endpoint to exchange for tokens.
 */
export async function exchangeCodeForToken(opts: { code: string; installationId: string; env: SentryOAuthEnv }): Promise<SentryTokenGrant> {
  const url = `${SENTRY_API_BASE}/sentry-app-installations/${encodeURIComponent(opts.installationId)}/authorizations/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code: opts.code, client_id: opts.env.clientId, client_secret: opts.env.clientSecret }),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`sentry token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.token, refreshToken: data.refreshToken, expiresAt: data.expiresAt, scope: data.scopes?.join(' ') ?? '' };
}

export async function refreshAccessToken(opts: { refreshToken: string; installationId: string; env: SentryOAuthEnv }): Promise<SentryTokenGrant> {
  const url = `${SENTRY_API_BASE}/sentry-app-installations/${encodeURIComponent(opts.installationId)}/authorizations/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: opts.refreshToken, client_id: opts.env.clientId, client_secret: opts.env.clientSecret }),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`sentry token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.token, refreshToken: data.refreshToken, expiresAt: data.expiresAt, scope: data.scopes?.join(' ') ?? '' };
}

/** Verify Sentry webhook. Header `Sentry-Hook-Signature` = hex HMAC SHA256(rawBody, client_secret). */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; clientSecret: string }): boolean {
  const expected = createHmac('sha256', opts.clientSecret).update(opts.rawBody).digest('hex');
  const a = Buffer.from(opts.signature); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
