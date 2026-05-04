/**
 * server/integrations/linear-oauth.ts
 *
 * Linear OAuth 2.0. Notes:
 *  - Auth URL: linear.app/oauth/authorize
 *  - Token URL: api.linear.app/oauth/token
 *  - Scopes: comma-separated. `read,write` is the broadest non-admin
 *    combination — `admin` requires extra approval and is dangerous.
 *  - Tokens: 10-year expiry (effectively long-lived); no refresh_token
 *    in the standard flow. We persist directly.
 *  - Webhooks: signed with `Linear-Signature` (hex HMAC-SHA256 of raw
 *    body) using the App's `signing secret` (separate from client_secret).
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://linear.app/oauth/authorize';
const TOKEN_URL = 'https://api.linear.app/oauth/token';
const REVOKE_URL = 'https://api.linear.app/oauth/revoke';

export const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

export const LINEAR_SCOPES = ['read', 'write'] as const;

export interface LinearOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  /** Webhook signing secret (independent from client_secret). */
  signingSecret?: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: LinearOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: LinearOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: LinearOAuthEnv; scopes?: readonly string[]; actor?: 'user' | 'app' }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? LINEAR_SCOPES).join(','),
    state: opts.state,
    actor: opts.actor ?? 'user',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface LinearTokenGrant {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: LinearOAuthEnv }): Promise<LinearTokenGrant> {
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
    throw new Error(`linear token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'Bearer',
    expiresIn: data.expires_in ?? 315_360_000,  // ~10y
    scope: data.scope ?? '',
  };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } catch { /* best-effort */ }
}

/**
 * Verify a Linear webhook delivery.
 * Header: `Linear-Signature` is hex HMAC-SHA256 of the raw body, keyed
 * with the App's signing secret.
 */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; signingSecret: string }): boolean {
  const expected = createHmac('sha256', opts.signingSecret).update(opts.rawBody).digest('hex');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
