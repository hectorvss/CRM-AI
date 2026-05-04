/**
 * server/integrations/jira-oauth.ts
 *
 * Atlassian (Jira) OAuth 2.0 — 3LO flow.
 *
 *  - Auth URL:   https://auth.atlassian.com/authorize
 *  - Token URL:  https://auth.atlassian.com/oauth/token
 *  - Resource:   https://api.atlassian.com/oauth/token/accessible-resources
 *                returns the list of cloudids (sites) the access token is
 *                authorised for. We pin the first one (or the one selected
 *                by the user later).
 *  - API base:   https://api.atlassian.com/ex/jira/{cloudid}/rest/api/3/
 *
 *  - Tokens: short-lived (1h) access, refresh via `offline_access` scope.
 *  - Webhooks: Jira's OAuth 3LO does NOT issue a signing secret. We use the
 *    dynamic webhook REST API (`/rest/api/3/webhook`) and embed a per-
 *    connector random token in the callback URL path; the webhook handler
 *    looks up the connector by that token. Webhooks expire after 30 days
 *    unless extended via the refresh endpoint.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';

export const JIRA_ACCESSIBLE_RESOURCES = 'https://api.atlassian.com/oauth/token/accessible-resources';

export const JIRA_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'manage:jira-project',
  'manage:jira-webhook',
  'offline_access',
] as const;

export interface JiraOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: JiraOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: JiraOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: JiraOAuthEnv; scopes?: readonly string[] }): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: opts.env.clientId,
    scope: (opts.scopes ?? JIRA_SCOPES).join(' '),
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface JiraTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: JiraOAuthEnv }): Promise<JiraTokenGrant> {
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
    throw new Error(`jira token exchange failed: ${res.status} ${text}`);
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

export async function refreshAccessToken(opts: { refreshToken: string; env: JiraOAuthEnv }): Promise<JiraTokenGrant> {
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
    throw new Error(`jira token refresh failed: ${res.status} ${text}`);
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

export interface JiraAccessibleResource {
  id: string;            // cloudid
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
}

export async function listAccessibleResources(accessToken: string): Promise<JiraAccessibleResource[]> {
  const res = await fetch(JIRA_ACCESSIBLE_RESOURCES, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`jira accessible-resources failed: ${res.status} ${text}`);
  }
  return (await res.json()) as JiraAccessibleResource[];
}

/** Generate a random URL-safe token used as a per-connector webhook discriminator. */
export function generateWebhookToken(): string {
  return randomBytes(24).toString('base64url');
}
