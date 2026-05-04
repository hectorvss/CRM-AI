/**
 * server/integrations/outlook-oauth.ts
 *
 * Microsoft identity platform v2 OAuth — same shape as gmail-oauth.ts so
 * Outlook follows the same per-tenant + signed-state + auto-refresh
 * patterns as the rest of the integrations.
 *
 * We use the `common` tenant authority so the SaaS works for ALL Microsoft
 * account types — work/school (Entra ID), personal (Microsoft accounts),
 * Azure AD multi-tenant. The scopes we request are delegated permissions
 * (Mail.ReadWrite + Mail.Send + offline_access + User.Read).
 *
 * Docs:
 *   https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
 *   https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTHORITY = 'https://login.microsoftonline.com';

/** Scopes for delegated mail access. `offline_access` is what gives us a refresh_token. */
export const OUTLOOK_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'MailboxSettings.Read',
] as const;

export interface OutlookOAuthEnv {
  clientId: string;
  clientSecret: string;
  /** "common" (any account), "organizations" (work/school only), "consumers" (personal), or a tenant GUID. */
  tenant: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: OutlookOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: OutlookOAuthEnv): StatePayload {
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

// ── Install URL ─────────────────────────────────────────────────────────────

export function buildInstallUrl(opts: {
  state: string;
  env: OutlookOAuthEnv;
  scopes?: readonly string[];
  loginHint?: string;
  /** Force re-consent (use after rotating scopes). Microsoft default is "select_account". */
  prompt?: 'login' | 'none' | 'consent' | 'select_account';
}): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    response_mode: 'query',
    scope: (opts.scopes ?? OUTLOOK_SCOPES).join(' '),
    state: opts.state,
    prompt: opts.prompt ?? 'select_account',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${AUTHORITY}/${opts.env.tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

// ── Token exchange ──────────────────────────────────────────────────────────

export interface OutlookTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
  tokenType: string;
  idToken: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: OutlookOAuthEnv }): Promise<OutlookTokenGrant> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    code: opts.code,
    redirect_uri: opts.env.redirectUri,
    grant_type: 'authorization_code',
    scope: OUTLOOK_SCOPES.join(' '),
  });
  const res = await fetch(`${AUTHORITY}/${opts.env.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`outlook token exchange failed: ${res.status} ${text}`);
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

export async function refreshAccessToken(opts: { refreshToken: string; env: OutlookOAuthEnv }): Promise<{ accessToken: string; refreshToken: string; expiresAt: string; scope: string }> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
    scope: OUTLOOK_SCOPES.join(' '),
  });
  const res = await fetch(`${AUTHORITY}/${opts.env.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`outlook refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    scope: data.scope,
  };
}

/**
 * Fetch the authenticated user's profile from Microsoft Graph. Used after
 * install to learn the email and display name to put on the connector row.
 */
export async function fetchUserInfo(accessToken: string): Promise<{ id: string; mail: string | null; userPrincipalName: string; displayName: string | null }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`graph /me failed: ${res.status}`);
  const data = (await res.json()) as { id: string; mail?: string; userPrincipalName: string; displayName?: string };
  return {
    id: data.id,
    mail: data.mail ?? null,
    userPrincipalName: data.userPrincipalName,
    displayName: data.displayName ?? null,
  };
}

/**
 * Microsoft tokens don't have a public revocation endpoint analogous to
 * Google's. The recommended way to disconnect is to delete the consent
 * grant from the user's My Account page. We just drop the local state.
 */
