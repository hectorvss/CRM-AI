/**
 * server/integrations/aircall-oauth.ts
 *
 * Aircall OAuth 2.0 (authorization_code).
 *
 *  - Auth URL:  https://dashboard.aircall.io/oauth/authorize
 *  - Token URL: https://api.aircall.io/v1/oauth/token
 *  - API base:  https://api.aircall.io/v1/
 *  - Tokens: long-lived bearer (no expires_in returned for OAuth Apps)
 *  - Webhooks: registered via REST. Signed using the **webhook token**
 *    returned at create time. Header `X-Aircall-Signature` = HMAC-SHA256
 *    in hex format of `<timestamp>.<rawBody>` keyed with the webhook
 *    token; timestamp is in `X-Aircall-Timestamp`.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://dashboard.aircall.io/oauth/authorize';
const TOKEN_URL = 'https://api.aircall.io/v1/oauth/token';

export const AIRCALL_API_BASE = 'https://api.aircall.io/v1';

export const AIRCALL_SCOPES = ['public_api'] as const;

export interface AircallOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: AircallOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: AircallOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: AircallOAuthEnv }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: AIRCALL_SCOPES.join(' '),
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface AircallTokenGrant {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: AircallOAuthEnv }): Promise<AircallTokenGrant> {
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
    throw new Error(`aircall token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'Bearer',
    scope: data.scope ?? '',
  };
}

/**
 * Verify Aircall webhook signature.
 * Header: `X-Aircall-Signature: <hex HMAC SHA256>`
 *         `X-Aircall-Timestamp: <unix seconds>`
 * Signed payload: `<timestamp>.<rawBody>`
 */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; timestamp: string; webhookToken: string }): boolean {
  const t = Number(opts.timestamp);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', opts.webhookToken).update(`${opts.timestamp}.${opts.rawBody}`).digest('hex');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
