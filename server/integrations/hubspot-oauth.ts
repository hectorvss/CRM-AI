/**
 * server/integrations/hubspot-oauth.ts
 *
 * HubSpot OAuth 2.0. Notes specific to HubSpot:
 *  - Auth URL: app.hubspot.com/oauth/authorize
 *  - Token URL: api.hubapi.com/oauth/v1/token
 *  - Token TTL is 30 minutes; we refresh proactively at 60s before expiry.
 *  - The list of scopes is mandatory and pinned at the App level — if the
 *    merchant's portal doesn't have one of them enabled, the redirect
 *    will surface a "scope not granted" error.
 *  - Webhook signature: `X-HubSpot-Signature-v3` is HMAC-SHA256 over
 *    `{method}\n{uri}\n{rawBody}\n{timestamp}` with the App Client Secret
 *    as the key.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_BASE = 'https://app.hubspot.com';
const API_BASE  = 'https://api.hubapi.com';

/**
 * The default scope set is what a customer-support agent typically needs:
 * read+write on contacts, companies, deals, tickets, line items, products,
 * conversations + read on owners and pipelines. `oauth` is implicit.
 */
export const HUBSPOT_SCOPES = [
  'oauth',
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.companies.read',
  'crm.objects.companies.write',
  'crm.objects.deals.read',
  'crm.objects.deals.write',
  'crm.objects.line_items.read',
  'crm.objects.owners.read',
  'crm.schemas.deals.read',
  'crm.schemas.contacts.read',
  'crm.schemas.companies.read',
  'tickets',
  'conversations.read',
  'conversations.write',
  'e-commerce',
  'files',
] as const;

export interface HubspotOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  appId?: string;          // numeric HubSpot App ID — optional, only used for webhook subscription URLs
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: HubspotOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: HubspotOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: HubspotOAuthEnv; scopes?: readonly string[]; optionalScopes?: readonly string[] }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? HUBSPOT_SCOPES).join(' '),
    state: opts.state,
  });
  if (opts.optionalScopes?.length) params.set('optional_scope', opts.optionalScopes.join(' '));
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

export interface HubspotTokenGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: HubspotOAuthEnv }): Promise<HubspotTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    redirect_uri: opts.env.redirectUri,
    code: opts.code,
  });
  const res = await fetch(`${API_BASE}/oauth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`hubspot token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; token_type?: string };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    tokenType: data.token_type ?? 'bearer',
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: HubspotOAuthEnv }): Promise<HubspotTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(`${API_BASE}/oauth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`hubspot refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; token_type?: string };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    tokenType: data.token_type ?? 'bearer',
  };
}

/**
 * Fetch token introspection — returns the hub_id (portal id), scopes, etc.
 */
export async function introspectToken(accessToken: string): Promise<{ hub_id: number; user: string; user_id: number; hub_domain: string; scopes: string[]; token_type: string; app_id: number; expires_in: number }> {
  const res = await fetch(`${API_BASE}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`hubspot introspect failed: ${res.status}`);
  return res.json();
}

/**
 * Verify the v3 webhook signature. The header is `X-HubSpot-Signature-v3`
 * and the timestamp arrives in `X-HubSpot-Request-Timestamp`. Replay window
 * is enforced at 5 minutes to mitigate stale-event attacks.
 */
export function verifyWebhookV3(opts: {
  method: string;
  url: string;
  rawBody: string;
  signature: string;
  timestamp: string;
  clientSecret: string;
  toleranceMs?: number;
}): boolean {
  const tolerance = opts.toleranceMs ?? 5 * 60 * 1000;
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > tolerance) return false;
  const message = `${opts.method}${opts.url}${opts.rawBody}${opts.timestamp}`;
  const expected = createHmac('sha256', opts.clientSecret).update(message).digest('base64');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
