/**
 * server/integrations/gmail-oauth.ts
 *
 * Google OAuth 2.0 utilities for Gmail. Mirrors the shape of
 * shopify-oauth.ts and stripe-oauth.ts so the Gmail integration follows
 * the same per-tenant + signed state + refresh patterns.
 *
 * Why not delegate fully to the existing /api/oauth-connectors flow?
 *  - That route is generic across providers and only persists the token
 *    blob — it doesn't run the post-install steps Gmail needs (call
 *    users.watch to register Pub/Sub, store historyId, look up the
 *    user's email address to use as the connector name).
 *  - Auto-refreshing expiring access tokens lives in this module too,
 *    invoked from gmail-tenant.ts on every adapter resolution.
 *
 * Docs:
 *   https://developers.google.com/identity/protocols/oauth2/web-server
 *   https://developers.google.com/gmail/api/guides/push
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * Scopes requested at install. `gmail.modify` covers read/send/label/
 * trash but NOT delete. We avoid `gmail.full_access` because Google
 * rejects unverified apps using full_access. Keep this list tight —
 * adding scopes forces every merchant to re-authorize.
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'email',
  'profile',
] as const;

export interface GmailOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string;   // tenantId
  w: string;   // workspaceId
  u: string;   // userId
  n: string;   // nonce
  e: number;   // expires (epoch ms)
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: GmailOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = {
    ...payload,
    n: randomBytes(12).toString('base64url'),
    e: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: GmailOAuthEnv): StatePayload {
  const dot = state.indexOf('.');
  if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('state: signature mismatch');
  }

  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) {
    throw new Error('state: expired');
  }
  return decoded;
}

// ── Install URL ─────────────────────────────────────────────────────────────

export function buildInstallUrl(opts: {
  state: string;
  env: GmailOAuthEnv;
  scopes?: readonly string[];
  /** Pre-fill the email field on Google's consent screen. */
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? GMAIL_SCOPES).join(' '),
    access_type: 'offline',
    // `prompt=consent` is what guarantees Google returns a refresh_token.
    // Without it, returning users who already consented get only an
    // access_token and we can't keep the connection alive long-term.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: opts.state,
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ── Token exchange ──────────────────────────────────────────────────────────

export interface GmailTokenGrant {
  accessToken: string;
  /** Only returned the FIRST time we ask (with prompt=consent). */
  refreshToken: string | null;
  expiresAt: string;   // ISO; access_token TTL ~1h
  scope: string;
  tokenType: string;
  idToken: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: GmailOAuthEnv }): Promise<GmailTokenGrant> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    redirect_uri: opts.env.redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`gmail token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    scope: data.scope,
    tokenType: data.token_type,
    idToken: data.id_token ?? null,
  };
}

/**
 * Mint a new access token using the long-lived refresh token. Called
 * automatically by the per-tenant resolver when the cached access token
 * is within ~60s of expiry.
 */
export async function refreshAccessToken(opts: { refreshToken: string; env: GmailOAuthEnv }): Promise<{ accessToken: string; expiresAt: string; scope: string; refreshToken: string }> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`gmail refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
    refresh_token?: string;
  };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    scope: data.scope,
    // Google sometimes rotates the refresh token; carry the new one when given.
    refreshToken: data.refresh_token ?? opts.refreshToken,
  };
}

/** Revoke a token. Best-effort — Google returns 200 even on already-revoked. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    // Swallow — disconnection on our side proceeds regardless.
  }
}

/**
 * Decode the Google ID token (JWT) without signature verification. We use
 * it only to extract the user's email — the access_token is what does the
 * actual API auth, so a forged id_token doesn't grant anything dangerous.
 * For PII-grade trust, use the userinfo endpoint instead.
 */
export function extractEmailFromIdToken(idToken: string | null): string | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * Hit /userinfo with the access token to get the canonical email +
 * verification status. Use this when you need to trust the email.
 */
export async function fetchUserInfo(accessToken: string): Promise<{ email: string; verified: boolean; name: string | null; picture: string | null }> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const data = (await res.json()) as { email: string; email_verified: boolean; name?: string; picture?: string };
  return {
    email: data.email,
    verified: data.email_verified === true,
    name: data.name ?? null,
    picture: data.picture ?? null,
  };
}
