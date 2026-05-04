/**
 * server/integrations/google-oauth.ts
 *
 * Shared Google OAuth 2.0 helpers used by Google Calendar and Google Drive.
 * Each product registers its own routes + adapter + connector row, but they
 * all flow through these primitives and share Google's auth/token endpoints.
 *
 *  - Auth URL:  https://accounts.google.com/o/oauth2/v2/auth
 *  - Token URL: https://oauth2.googleapis.com/token
 *  - Revoke:    https://oauth2.googleapis.com/revoke
 *  - Tokens:    1h access, refresh via refresh_token (always present when
 *               access_type=offline + prompt=consent)
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

export const GOOGLE_CALENDAR_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export const GOOGLE_DRIVE_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;

export interface GoogleOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: GoogleOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: GoogleOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: GoogleOAuthEnv; scopes: readonly string[] }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    response_type: 'code',
    scope: opts.scopes.join(' '),
    state: opts.state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number;
  scope: string;
  idToken: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: GoogleOAuthEnv }): Promise<GoogleTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: opts.env.clientId,
      client_secret: opts.env.clientSecret,
      code: opts.code,
      redirect_uri: opts.env.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`google token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? '',
    idToken: data.id_token ?? null,
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: GoogleOAuthEnv }): Promise<GoogleTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: opts.env.clientId,
      client_secret: opts.env.clientSecret,
      refresh_token: opts.refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`google token refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? '',
    idToken: data.id_token ?? null,
  };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch { /* best-effort */ }
}

export async function fetchUserInfo(accessToken: string): Promise<{ sub: string; email: string; name: string; picture?: string } | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    return await res.json() as any;
  } catch { return null; }
}

/** Generate a per-channel webhook token used to authenticate Google push notifications. */
export function generateChannelToken(): string {
  return randomBytes(24).toString('base64url');
}
