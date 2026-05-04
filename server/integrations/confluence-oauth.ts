/**
 * server/integrations/confluence-oauth.ts
 *
 * Atlassian (Confluence) OAuth 2.0 — 3LO flow. Same auth.atlassian.com
 * gateway as Jira; we just request Confluence-specific scopes and the
 * accessible-resources endpoint returns the Confluence sites instead.
 *
 *  - Auth URL:   https://auth.atlassian.com/authorize
 *  - Token URL:  https://auth.atlassian.com/oauth/token
 *  - Resource:   https://api.atlassian.com/oauth/token/accessible-resources
 *  - API base:   https://api.atlassian.com/ex/confluence/{cloudid}/wiki/api/v2/
 *
 *  - Tokens: 1h access, refresh via `offline_access` scope.
 *  - Webhooks: Confluence Cloud does NOT expose dynamic webhooks via
 *    OAuth 3LO (only via Connect or Forge). We fall back to polling for
 *    knowledge ingestion — the AI calls list endpoints on a schedule.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

export const CONFLUENCE_ACCESSIBLE_RESOURCES = 'https://api.atlassian.com/oauth/token/accessible-resources';

export const CONFLUENCE_SCOPES = [
  'read:confluence-content.all',
  'read:confluence-content.summary',
  'read:confluence-space.summary',
  'read:confluence-user',
  'search:confluence',
  'offline_access',
] as const;

export interface ConfluenceOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: ConfluenceOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: ConfluenceOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: ConfluenceOAuthEnv; scopes?: readonly string[] }): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: opts.env.clientId,
    scope: (opts.scopes ?? CONFLUENCE_SCOPES).join(' '),
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface ConfluenceTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: ConfluenceOAuthEnv }): Promise<ConfluenceTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: opts.env.clientId,
      client_secret: opts.env.clientSecret,
      code: opts.code,
      redirect_uri: opts.env.redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`confluence token exchange failed: ${res.status} ${text}`);
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

export async function refreshAccessToken(opts: { refreshToken: string; env: ConfluenceOAuthEnv }): Promise<ConfluenceTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: opts.env.clientId,
      client_secret: opts.env.clientSecret,
      refresh_token: opts.refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`confluence token refresh failed: ${res.status} ${text}`);
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

export interface ConfluenceAccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
}

export async function listAccessibleResources(accessToken: string): Promise<ConfluenceAccessibleResource[]> {
  const res = await fetch(CONFLUENCE_ACCESSIBLE_RESOURCES, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`confluence accessible-resources failed: ${res.status} ${text}`);
  }
  const all = (await res.json()) as ConfluenceAccessibleResource[];
  // Filter to sites with Confluence scopes
  return all.filter(r => r.scopes?.some(s => s.includes('confluence')));
}
