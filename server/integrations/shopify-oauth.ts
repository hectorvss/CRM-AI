/**
 * server/integrations/shopify-oauth.ts
 *
 * Shopify OAuth 2.0 flow primitives. The merchant clicks "Install" in the
 * SaaS UI; we redirect them to Shopify's grant page with the right scope set;
 * Shopify redirects back to /callback with a temporary `code`; we exchange
 * it for a permanent (offline) Admin API access token and persist it in the
 * `connectors` table so subsequent requests for that workspace can talk to
 * that store.
 *
 * Design notes:
 *  - We use OFFLINE access tokens (not online). Online tokens expire with
 *    the user session; offline tokens are tied to the shop and the install
 *    grant — exactly what a backend integration needs.
 *  - `state` is a JWT-like signed envelope carrying tenantId+workspaceId+
 *    nonce. Shopify echoes it back unchanged. We verify the HMAC and the
 *    timestamp before trusting either tenant or shop on callback — this
 *    blocks replay and CSRF.
 *  - Scopes are conservative-by-default: read+write on the resources the
 *    agent actually uses (orders, customers, products, fulfillments,
 *    returns, draft orders, inventory). Adjust SCOPES if you need more.
 *
 * Docs: https://shopify.dev/docs/apps/auth/oauth/getting-started
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

/**
 * Scopes requested at install time. Each scope corresponds to a set of
 * Admin API endpoints. Keep this list aligned with the methods exposed
 * by `ShopifyAdapter` — adding a new method that needs `read_locations`
 * means adding `read_locations` here and asking merchants to re-install.
 */
export const SCOPES = [
  'read_orders',
  'write_orders',
  'read_all_orders',          // 60+ days back; requires Shopify approval
  'read_customers',
  'write_customers',
  'read_products',
  'write_products',
  'read_inventory',
  'write_inventory',
  'read_fulfillments',
  'write_fulfillments',
  'read_returns',
  'write_returns',
  'read_draft_orders',
  'write_draft_orders',
  'read_gift_cards',
  'read_locations',
  'read_shipping',
  'read_marketing_events',
  'read_checkouts',
  'read_price_rules',
  'read_discounts',
  'read_reports',
  'read_analytics',
] as const;

export type ShopifyScope = typeof SCOPES[number];

export interface OAuthEnv {
  apiKey: string;
  apiSecret: string;
  /** Public URL where Shopify will redirect after the merchant approves. */
  redirectUri: string;
  /** Used to sign the `state` parameter. Random > 32 bytes. */
  stateSecret: string;
}

/**
 * Validate that a domain looks like a Shopify shop URL. Shopify shops live
 * at <name>.myshopify.com — anything else is rejected so a forged callback
 * can't trick us into hitting an attacker-controlled host.
 */
export function isValidShopDomain(shop: string | undefined | null): boolean {
  if (!shop || typeof shop !== 'string') return false;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

// ── State envelope (signed CSRF token) ───────────────────────────────────────

interface StatePayload {
  t: string;   // tenantId
  w: string;   // workspaceId
  u: string;   // userId initiating install
  n: string;   // nonce (random)
  e: number;   // exp (epoch ms)
}

/** Sign a state envelope with HMAC-SHA256. Returns a URL-safe base64 string. */
export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: OAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = {
    ...payload,
    n: randomBytes(12).toString('base64url'),
    e: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/**
 * Verify a returned state token. Returns the decoded payload, or throws.
 * Constant-time comparison on the HMAC to avoid timing oracles.
 */
export function verifyState(state: string, env: OAuthEnv): StatePayload {
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

// ── Install URL ──────────────────────────────────────────────────────────────

/**
 * Build the URL the merchant should be redirected to in order to grant our
 * app access to their store. Shopify will redirect back to redirectUri with
 * `?code=...&shop=...&state=...&hmac=...&host=...&timestamp=...`.
 *
 *   https://shopify.dev/docs/apps/auth/oauth/getting-started#step-2-ask-for-permission
 */
export function buildInstallUrl(opts: {
  shop: string;
  state: string;
  env: OAuthEnv;
  scopes?: readonly string[];
  /** Per-user (online) tokens — leave undefined for offline. */
  perUserGrant?: boolean;
}): string {
  if (!isValidShopDomain(opts.shop)) {
    throw new Error(`shop: invalid domain "${opts.shop}"`);
  }
  const params = new URLSearchParams({
    client_id: opts.env.apiKey,
    scope: (opts.scopes ?? SCOPES).join(','),
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  if (opts.perUserGrant) {
    params.set('grant_options[]', 'per-user');
  }
  return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`;
}

// ── Callback HMAC verification ──────────────────────────────────────────────

/**
 * Shopify signs the OAuth callback query string with the app's API secret.
 * We MUST verify this BEFORE believing any of the parameters — otherwise an
 * attacker could craft a callback that points at their store and steal the
 * code (or worse, get us to install on the wrong store).
 *
 * Algorithm:
 *  1. Take all query params except `hmac` and `signature`.
 *  2. Sort by key.
 *  3. Concatenate as `key=value&key=value` (URL-encoded).
 *  4. HMAC-SHA256 with apiSecret. Hex digest.
 *  5. Constant-time compare with the `hmac` query param.
 *
 *   https://shopify.dev/docs/apps/auth/oauth/getting-started#step-3-confirm-installation
 */
export function verifyCallbackHmac(query: Record<string, string | string[] | undefined>, env: OAuthEnv): boolean {
  const hmac = typeof query.hmac === 'string' ? query.hmac : null;
  if (!hmac) return false;

  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k === 'hmac' || k === 'signature') continue;
    if (v === undefined) continue;
    flat[k] = Array.isArray(v) ? v.join(',') : String(v);
  }
  const sortedKeys = Object.keys(flat).sort();
  const message = sortedKeys.map((k) => `${k}=${flat[k]}`).join('&');

  const digest = createHmac('sha256', env.apiSecret).update(message).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Code → token exchange ───────────────────────────────────────────────────

export interface ShopifyTokenGrant {
  /** The actual offline access token used as X-Shopify-Access-Token. */
  accessToken: string;
  /** Comma-separated scopes that were actually granted. */
  scope: string;
  /** Online-token-only fields are absent for offline grants. */
  expiresAt?: string | null;
  associatedUserScope?: string | null;
  associatedUser?: { id: number; email: string; first_name?: string; last_name?: string } | null;
}

/**
 * POST /admin/oauth/access_token to exchange the temporary code for a
 * permanent offline access token. This is the only call where we use the
 * app's secret directly (everything else uses the resulting token).
 */
export async function exchangeCodeForToken(opts: {
  shop: string;
  code: string;
  env: OAuthEnv;
}): Promise<ShopifyTokenGrant> {
  if (!isValidShopDomain(opts.shop)) {
    throw new Error(`shop: invalid domain "${opts.shop}"`);
  }
  const url = `https://${opts.shop}/admin/oauth/access_token`;
  const body = JSON.stringify({
    client_id: opts.env.apiKey,
    client_secret: opts.env.apiSecret,
    code: opts.code,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`shopify token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    scope: string;
    expires_in?: number;
    associated_user_scope?: string;
    associated_user?: ShopifyTokenGrant['associatedUser'];
  };
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    associatedUserScope: data.associated_user_scope ?? null,
    associatedUser: data.associated_user ?? null,
  };
}
