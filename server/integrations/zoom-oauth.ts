/**
 * server/integrations/zoom-oauth.ts
 *
 * Zoom OAuth 2.0 (authorization_code).
 *
 *  - Auth URL:  https://zoom.us/oauth/authorize
 *  - Token URL: https://zoom.us/oauth/token (Basic auth client_id:client_secret)
 *  - API base:  https://api.zoom.us/v2/
 *  - Tokens: 1h access, refresh via refresh_token
 *  - Webhooks: validated via the Zoom Verification Token (in headers) AND
 *    HMAC-SHA256 signature in `x-zm-signature` header. Format:
 *    `v0=<hex HMAC SHA256 of v0:<timestamp>:<rawBody>>` where the
 *    timestamp comes from `x-zm-request-timestamp`.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://zoom.us/oauth/authorize';
const TOKEN_URL = 'https://zoom.us/oauth/token';

export const ZOOM_API_BASE = 'https://api.zoom.us/v2';

export const ZOOM_SCOPES = [
  'meeting:read', 'meeting:write',
  'recording:read',
  'user:read',
  'webinar:read',
  'cloud_recording:read',
] as const;

export interface ZoomOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  webhookSecretToken: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: ZoomOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: ZoomOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: ZoomOAuthEnv }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface ZoomTokenGrant { accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number; scope: string }

export async function exchangeCodeForToken(opts: { code: string; env: ZoomOAuthEnv }): Promise<ZoomTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.env.redirectUri }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`zoom token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, tokenType: data.token_type ?? 'bearer', expiresIn: data.expires_in ?? 3600, scope: data.scope ?? '' };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: ZoomOAuthEnv }): Promise<ZoomTokenGrant> {
  const basic = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: opts.refreshToken }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`zoom token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken, tokenType: data.token_type ?? 'bearer', expiresIn: data.expires_in ?? 3600, scope: data.scope ?? '' };
}

/**
 * Verify Zoom webhook.
 * Headers:  x-zm-signature (= "v0=<hex>"), x-zm-request-timestamp
 * Signed:   `v0:<timestamp>:<rawBody>` keyed with the **Webhook Secret Token**
 *           (from your Zoom App's Feature → Event Subscriptions panel).
 */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; timestamp: string; secretToken: string }): boolean {
  if (!opts.signature.startsWith('v0=')) return false;
  const t = Number(opts.timestamp);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const provided = opts.signature.slice('v0='.length);
  const expected = createHmac('sha256', opts.secretToken).update(`v0:${opts.timestamp}:${opts.rawBody}`).digest('hex');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Build the URL-validation response Zoom expects when adding the endpoint.
 * They send `event: 'endpoint.url_validation'` with `payload.plainToken`;
 * we reply with the plainToken AND its HMAC SHA256 hex signed with the
 * Secret Token.
 */
export function buildUrlValidationResponse(plainToken: string, secretToken: string): { plainToken: string; encryptedToken: string } {
  return {
    plainToken,
    encryptedToken: createHmac('sha256', secretToken).update(plainToken).digest('hex'),
  };
}
