/**
 * server/integrations/paypal-oauth.ts
 *
 * PayPal uses Client Credentials OAuth, not user-OAuth. The merchant
 * pastes their app's Client ID + Secret (from developer.paypal.com → My
 * Apps & Credentials), and we exchange those for a short-lived access
 * token that's used as a Bearer for every API call.
 *
 * Differences from Stripe Connect / Shopify OAuth:
 *  - No redirect / consent flow — Client Credentials is server-to-server.
 *  - Token TTL is ~9 hours; we cache + auto-refresh in paypal-tenant.ts.
 *  - PayPal has separate sandbox and live environments. Each merchant
 *    chooses one at connect time; the API base differs:
 *      sandbox: api-m.sandbox.paypal.com
 *      live:    api-m.paypal.com
 */

export type PayPalMode = 'sandbox' | 'live';

export const PAYPAL_BASE: Record<PayPalMode, string> = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live:    'https://api-m.paypal.com',
};

export interface PayPalCreds {
  clientId: string;
  clientSecret: string;
  mode: PayPalMode;
}

export interface PayPalAccessToken {
  accessToken: string;
  expiresAt: string;          // ISO; we subtract 60s of safety
  scope: string;
  appId: string;              // PayPal returns the app id
  nonce: string;
}

/**
 * Exchange Client Credentials for an access token. Throws on any non-2xx
 * with the PayPal error message — callers usually wrap this in a "validate
 * creds during connect" catch and surface to the user.
 */
export async function fetchAccessToken(creds: PayPalCreds): Promise<PayPalAccessToken> {
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE[creds.mode]}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j?.error_description ?? j?.error ?? text;
    } catch { /* keep raw */ }
    const err: any = new Error(`PayPal token failed: ${res.status} ${message}`);
    err.statusCode = res.status;
    err.paypalRaw = text;
    throw err;
  }
  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    app_id: string;
    nonce: string;
  };
  return {
    accessToken: data.access_token,
    // Subtract 60s so we refresh before expiry, not on it.
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    scope: data.scope,
    appId: data.app_id,
    nonce: data.nonce,
  };
}
