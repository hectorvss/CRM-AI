/**
 * server/integrations/salesforce-oauth.ts
 *
 * Salesforce OAuth 2.0 (Web Server Flow). Distinctive points:
 *
 *  - Two separate authorities: production / developer orgs use
 *    `login.salesforce.com`; sandboxes use `test.salesforce.com`. The
 *    merchant picks at install-time and we persist `mode`.
 *  - The token response includes an `instance_url` (e.g.
 *    https://acme.my.salesforce.com) that all subsequent API calls must
 *    target — it differs per org and may change after a refresh, so we
 *    re-read it on every refresh and persist it.
 *  - `refresh_token` is long-lived (no expiry by default) but can be
 *    revoked by the org admin. `access_token` TTL is configurable per
 *    Connected App (default 2h).
 *  - Scopes: `api` for REST/SOAP API access, `refresh_token offline_access`
 *    for the refresh grant, `id` to fetch the user identity URL.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export type SalesforceMode = 'production' | 'sandbox';

const AUTHORITIES: Record<SalesforceMode, string> = {
  production: 'https://login.salesforce.com',
  sandbox:    'https://test.salesforce.com',
};

export const SALESFORCE_SCOPES = [
  'api',
  'refresh_token',
  'offline_access',
  'id',
] as const;

export interface SalesforceOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; m: SalesforceMode; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: SalesforceOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: SalesforceOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: {
  state: string;
  env: SalesforceOAuthEnv;
  mode: SalesforceMode;
  scopes?: readonly string[];
  prompt?: 'login' | 'consent';
}): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? SALESFORCE_SCOPES).join(' '),
    state: opts.state,
  });
  if (opts.prompt) params.set('prompt', opts.prompt);
  return `${AUTHORITIES[opts.mode]}/services/oauth2/authorize?${params.toString()}`;
}

export interface SalesforceTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  instanceUrl: string;
  identityUrl: string;
  issuedAt: string;
  signature: string;
  tokenType: string;
  scope: string | null;
  /** Salesforce doesn't always return expires_in; we pessimistically assume 90 min. */
  expiresAt: string;
}

export async function exchangeCodeForToken(opts: { code: string; mode: SalesforceMode; env: SalesforceOAuthEnv }): Promise<SalesforceTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    redirect_uri: opts.env.redirectUri,
    code: opts.code,
  });
  const res = await fetch(`${AUTHORITIES[opts.mode]}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`salesforce token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    instance_url: string;
    id: string;
    issued_at: string;
    signature: string;
    token_type: string;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    instanceUrl: data.instance_url,
    identityUrl: data.id,
    issuedAt: data.issued_at,
    signature: data.signature,
    tokenType: data.token_type,
    scope: data.scope ?? null,
    expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; mode: SalesforceMode; env: SalesforceOAuthEnv }): Promise<{ accessToken: string; refreshToken: string; instanceUrl: string; expiresAt: string; scope: string | null }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(`${AUTHORITIES[opts.mode]}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`salesforce refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    instance_url: string;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    instanceUrl: data.instance_url,
    expiresAt: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    scope: data.scope ?? null,
  };
}

/**
 * Fetch the user identity payload — the `identityUrl` returned at token
 * exchange points to a JSON describing org_id, user_id, email, etc.
 */
export async function fetchIdentity(identityUrl: string, accessToken: string): Promise<{ user_id: string; organization_id: string; email: string | null; display_name: string | null; username: string | null }> {
  const res = await fetch(identityUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`salesforce identity fetch failed: ${res.status}`);
  const data = (await res.json()) as any;
  return {
    user_id: data.user_id,
    organization_id: data.organization_id,
    email: data.email ?? null,
    display_name: data.display_name ?? null,
    username: data.username ?? null,
  };
}

/**
 * Best-effort revoke. Salesforce supports POST /services/oauth2/revoke
 * with token=ACCESS_TOKEN; this surfaces immediate disconnection rather
 * than waiting for the token to expire.
 */
export async function revokeToken(token: string, mode: SalesforceMode): Promise<void> {
  try {
    await fetch(`${AUTHORITIES[mode]}/services/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    });
  } catch { /* ignore — best-effort */ }
}

export function authorityFor(mode: SalesforceMode): string {
  return AUTHORITIES[mode];
}
