/**
 * server/integrations/stripe-oauth.ts
 *
 * Stripe Connect (Standard) OAuth flow.
 *
 * Each merchant connects their own Stripe account. The flow:
 *   1. Browser redirects to https://connect.stripe.com/oauth/authorize
 *   2. Merchant logs in / approves
 *   3. Stripe redirects back with ?code=&state=
 *   4. We POST to /oauth/token with the code → access_token + refresh_token + stripe_user_id
 *   5. Persist in connectors.auth_config:
 *        { stripe_user_id, access_token, refresh_token, livemode, scope }
 *
 * Standard accounts give us a real merchant secret key — every API call
 * we make is on their behalf and shows up in their Dashboard. No platform-
 * fees plumbing required for the read/write surface we need.
 *
 * Docs:
 *   https://docs.stripe.com/connect/oauth-reference
 *   https://docs.stripe.com/connect/standard-accounts
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

export const STRIPE_OAUTH_AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
export const STRIPE_OAUTH_TOKEN_URL = 'https://connect.stripe.com/oauth/token';
export const STRIPE_OAUTH_DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize';

/**
 * Stripe Connect scope. `read_write` gives us full Standard-account access
 * (Customers, Charges, Refunds, Disputes, Subscriptions, Invoices, etc.).
 * `read_only` is also valid but limits us to GET — we need writes.
 */
export type StripeOAuthScope = 'read_write' | 'read_only';

export interface StripeOAuthEnv {
  /** Stripe Connect Client ID (ca_...). Found in Dashboard → Settings → Connect → OAuth. */
  clientId: string;
  /** Platform secret key (sk_live_ / sk_test_). Used to exchange code for token. */
  platformSecretKey: string;
  /** Where Stripe redirects after auth — must be whitelisted in the Connect app config. */
  redirectUri: string;
  /** Used to sign `state`. Random > 32 bytes. */
  stateSecret: string;
}

interface StatePayload {
  t: string;   // tenantId
  w: string;   // workspaceId
  u: string;   // userId
  n: string;   // nonce
  e: number;   // expires (epoch ms)
}

/** Sign a state envelope with HMAC-SHA256. URL-safe base64. */
export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: StripeOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = {
    ...payload,
    n: randomBytes(12).toString('base64url'),
    e: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: StripeOAuthEnv): StatePayload {
  const dot = state.indexOf('.');
  if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('state: signature mismatch');
  }

  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) {
    throw new Error('state: expired');
  }
  return decoded;
}

// ── Install URL ─────────────────────────────────────────────────────────────

export function buildInstallUrl(opts: {
  state: string;
  env: StripeOAuthEnv;
  scope?: StripeOAuthScope;
  /** Pre-fill on the Stripe consent page so the merchant doesn't retype it. */
  prefill?: {
    email?: string;
    business_name?: string;
    country?: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    url?: string;
  };
  /** Suggest "express" or "standard" — we default to standard for full API access. */
  stripeUserType?: 'standard' | 'express';
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    scope: opts.scope ?? 'read_write',
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });

  if (opts.prefill) {
    for (const [k, v] of Object.entries(opts.prefill)) {
      if (v) params.set(`stripe_user[${k}]`, String(v));
    }
  }

  return `${STRIPE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

// ── Code → token exchange ──────────────────────────────────────────────────

export interface StripeTokenGrant {
  /** Restricted secret key for the connected account. We store this. */
  accessToken: string;
  /** Long-lived refresh token. Used to mint a new access_token if Stripe ever rotates. */
  refreshToken: string | null;
  /** Connected Stripe account ID — `acct_...`. */
  stripeUserId: string;
  /** Connected account's publishable key. */
  stripePublishableKey: string | null;
  scope: string;
  livemode: boolean;
  tokenType: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: StripeOAuthEnv }): Promise<StripeTokenGrant> {
  const body = new URLSearchParams({
    client_secret: opts.env.platformSecretKey,
    code: opts.code,
    grant_type: 'authorization_code',
  });

  const res = await fetch(STRIPE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`stripe oauth token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    stripe_user_id: string;
    stripe_publishable_key?: string;
    scope: string;
    livemode: boolean;
    token_type: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    stripeUserId: data.stripe_user_id,
    stripePublishableKey: data.stripe_publishable_key ?? null,
    scope: data.scope,
    livemode: data.livemode,
    tokenType: data.token_type,
  };
}

/**
 * Refresh an access token. Stripe Connect tokens don't normally expire, but
 * the merchant or Stripe can rotate them — call this if a request returns
 * 401 with type=invalid_request_error and "expired" in the message.
 */
export async function refreshAccessToken(opts: { refreshToken: string; env: StripeOAuthEnv }): Promise<StripeTokenGrant> {
  const body = new URLSearchParams({
    client_secret: opts.env.platformSecretKey,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(STRIPE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`stripe oauth refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    stripeUserId: data.stripe_user_id,
    stripePublishableKey: data.stripe_publishable_key ?? null,
    scope: data.scope,
    livemode: data.livemode,
    tokenType: data.token_type,
  };
}

/**
 * Revoke our access to a connected account. Called when the merchant clicks
 * "Disconnect" in our UI. After this Stripe stops accepting requests with
 * that access_token.
 */
export async function deauthorize(opts: { stripeUserId: string; env: StripeOAuthEnv }): Promise<void> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    stripe_user_id: opts.stripeUserId,
  });
  const res = await fetch(STRIPE_OAUTH_DEAUTHORIZE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${opts.env.platformSecretKey}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`stripe deauthorize failed: ${res.status} ${text}`);
  }
}
