/**
 * server/integrations/zendesk-oauth.ts
 *
 * Zendesk OAuth 2.0. Distinctive points:
 *
 *  - Auth host is per-subdomain. The merchant tells us their Zendesk
 *    subdomain (e.g. `acme` for acme.zendesk.com), we redirect to
 *    `https://{subdomain}.zendesk.com/oauth/authorizations/new`, and the
 *    token endpoint mirrors that — `https://{subdomain}.zendesk.com/oauth/tokens`.
 *  - Tokens are long-lived (no built-in expiry).
 *  - Scopes are space-separated. `read write` is the broadest combination;
 *    we request more granular ones to follow least-privilege.
 *  - Webhook deliveries are signed with `X-Zendesk-Webhook-Signature`
 *    (HMAC SHA256, base64) over `{X-Zendesk-Webhook-Signature-Timestamp}{rawBody}`.
 *    The signing secret is provisioned per-webhook in Zendesk admin.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i;

export const ZENDESK_SCOPES = [
  'read',
  'write',
  // Granular scopes Zendesk supports. Including them is harmless even when
  // `write` is also present — older accounts only honour the granular ones.
  'tickets:read', 'tickets:write',
  'users:read', 'users:write',
  'organizations:read',
  'hc:read',                    // help center
  'webhooks:read', 'webhooks:write',
  'triggers:read', 'triggers:write',
  'auditlogs:read',
] as const;

export interface ZendeskOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string;
  s: string;        // subdomain
  n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: ZendeskOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: ZendeskOAuthEnv): StatePayload {
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

export function isValidSubdomain(s: string): boolean {
  return SUBDOMAIN_RE.test(s);
}

export function authBase(subdomain: string): string {
  if (!isValidSubdomain(subdomain)) throw new Error(`zendesk: invalid subdomain "${subdomain}"`);
  return `https://${subdomain}.zendesk.com`;
}

export function buildInstallUrl(opts: {
  state: string;
  env: ZendeskOAuthEnv;
  subdomain: string;
  scopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? ZENDESK_SCOPES).join(' '),
    state: opts.state,
  });
  return `${authBase(opts.subdomain)}/oauth/authorizations/new?${params.toString()}`;
}

export interface ZendeskTokenGrant {
  accessToken: string;
  tokenType: string;
  scope: string;
  /** Zendesk doesn't return expires_in for the long-lived default; if rotation is enabled it does. */
  expiresAt: string | null;
  refreshToken: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; subdomain: string; env: ZendeskOAuthEnv; scopes?: readonly string[] }): Promise<ZendeskTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    redirect_uri: opts.env.redirectUri,
    code: opts.code,
    scope: (opts.scopes ?? ZENDESK_SCOPES).join(' '),
  });
  const res = await fetch(`${authBase(opts.subdomain)}/oauth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`zendesk token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bearer',
    scope: data.scope ?? '',
    expiresAt: typeof data.expires_in === 'number' ? new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString() : null,
    refreshToken: data.refresh_token ?? null,
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; subdomain: string; env: ZendeskOAuthEnv }): Promise<ZendeskTokenGrant> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(`${authBase(opts.subdomain)}/oauth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`zendesk refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bearer',
    scope: data.scope ?? '',
    expiresAt: typeof data.expires_in === 'number' ? new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString() : null,
    refreshToken: data.refresh_token ?? opts.refreshToken,
  };
}

/**
 * Verify Zendesk webhook signature.
 * Header: `X-Zendesk-Webhook-Signature` is base64(HMAC-SHA256(timestamp + body, secret))
 * Header: `X-Zendesk-Webhook-Signature-Timestamp` ISO timestamp.
 * Replay window: 5 minutes.
 */
export function verifyWebhookSignature(opts: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret: string;
  toleranceMs?: number;
}): boolean {
  const tolerance = opts.toleranceMs ?? 5 * 60 * 1000;
  const ts = Date.parse(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > tolerance) return false;
  const expected = createHmac('sha256', opts.secret).update(opts.timestamp + opts.rawBody).digest('base64');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Best-effort revoke. Zendesk supports DELETE on the access token. */
export async function revokeToken(token: string, subdomain: string): Promise<void> {
  try {
    await fetch(`${authBase(subdomain)}/api/v2/oauth/tokens/current.json`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* best-effort */ }
}
