/**
 * server/integrations/intercom-oauth.ts
 *
 * Intercom OAuth 2.0. Distinctive points:
 *
 *  - Auth URL is `app.intercom.com/oauth` (no eu/au split — Intercom
 *    routes by workspace region post-auth).
 *  - Token URL: api.intercom.io/auth/eagle/token
 *  - Tokens are long-lived. There's no refresh_token flow (a single
 *    bearer token persists until the workspace admin revokes the app).
 *  - All API calls require `Intercom-Version` header (currently 2.11).
 *  - Webhooks are signed with `X-Hub-Signature` (HMAC-SHA1 hex, prefixed
 *    `sha1=`) using the App's client_secret as the key. There is no
 *    timestamp; replay protection is left to the consumer (we dedupe
 *    by event id).
 *
 *  Region notes: a workspace's region determines its API host
 *  (api.intercom.io for US, api.eu.intercom.io for EU, api.au.intercom.io
 *  for AU). The token-exchange response includes `region` so we can
 *  pin the right host per-workspace.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://app.intercom.com/oauth';
const TOKEN_URL = 'https://api.intercom.io/auth/eagle/token';

export type IntercomRegion = 'us' | 'eu' | 'au';

export const INTERCOM_API_BASE: Record<IntercomRegion, string> = {
  us: 'https://api.intercom.io',
  eu: 'https://api.eu.intercom.io',
  au: 'https://api.au.intercom.io',
};

/** Default API version pin. Bumping this in code flows to every adapter call. */
export const INTERCOM_API_VERSION = '2.11';

export interface IntercomOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: IntercomOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: IntercomOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: IntercomOAuthEnv }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    state: opts.state,
    redirect_uri: opts.env.redirectUri,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface IntercomTokenGrant {
  accessToken: string;
  tokenType: string;
  /** Workspace ("app") id, e.g. `iq6c1g0j`. */
  appId: string | null;
  region: IntercomRegion;
}

export async function exchangeCodeForToken(opts: { code: string; env: IntercomOAuthEnv }): Promise<IntercomTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      code: opts.code,
      client_id: opts.env.clientId,
      client_secret: opts.env.clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`intercom token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { token: string; token_type?: string };
  // Intercom returns `token`, not `access_token`. The region must be
  // discovered via /me on whichever host matches.
  return {
    accessToken: data.token,
    tokenType: data.token_type ?? 'Bearer',
    appId: null,
    region: 'us',  // tentative — caller should detect via probeRegion()
  };
}

/**
 * Probe each Intercom region with the token until one returns 2xx for /me.
 * Stops at the first match. Returns the region + the workspace ("app") id.
 */
export async function probeRegion(token: string): Promise<{ region: IntercomRegion; appId: string | null; me: any }> {
  const tries: IntercomRegion[] = ['us', 'eu', 'au'];
  let lastError: any = null;
  for (const region of tries) {
    try {
      const res = await fetch(`${INTERCOM_API_BASE[region]}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Intercom-Version': INTERCOM_API_VERSION,
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const me = await res.json();
        // /me returns the admin; the workspace id lives in app.id_code or app.id.
        const appId = me?.app?.id_code ?? me?.app?.id ?? null;
        return { region, appId, me };
      }
      lastError = { region, status: res.status };
    } catch (err) {
      lastError = { region, error: String(err) };
    }
  }
  throw new Error(`intercom region probe failed: ${JSON.stringify(lastError)}`);
}

/**
 * Verify a webhook delivery. Intercom signs with HMAC-SHA1 of the raw body
 * using the App's client_secret. Header: `X-Hub-Signature: sha1=<hex>`.
 *
 * Replay protection is event-id based on our side (handled in the webhook
 * route) since Intercom does not provide a timestamp.
 */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; clientSecret: string }): boolean {
  if (!opts.signature || !opts.signature.startsWith('sha1=')) return false;
  const expected = 'sha1=' + createHmac('sha1', opts.clientSecret).update(opts.rawBody).digest('hex');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
