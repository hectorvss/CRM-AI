/**
 * server/integrations/ups-oauth.ts
 *
 * UPS uses OAuth 2.0 Client Credentials. The merchant pastes Client ID +
 * Secret from developer.ups.com → My Apps; we exchange for a Bearer token
 * cached in ups-tenant.ts.
 *
 * Sandbox vs production environments use different hosts:
 *   sandbox:    wwwcie.ups.com
 *   production: onlinetools.ups.com
 *
 * Token TTL is ~4 hours.
 */

export type UpsMode = 'sandbox' | 'production';

export const UPS_BASE: Record<UpsMode, string> = {
  sandbox:    'https://wwwcie.ups.com',
  production: 'https://onlinetools.ups.com',
};

export interface UpsCreds {
  clientId: string;
  clientSecret: string;
  mode: UpsMode;
}

export interface UpsAccessToken {
  accessToken: string;
  expiresAt: string;          // ISO
  scope: string;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
  status: string;
}

export async function fetchAccessToken(creds: UpsCreds): Promise<UpsAccessToken> {
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch(`${UPS_BASE[creds.mode]}/security/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'x-merchant-id': creds.clientId,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j?.response?.errors?.[0]?.message ?? j?.error_description ?? j?.error ?? text;
    } catch { /* keep raw */ }
    const err: any = new Error(`UPS token failed: ${res.status} ${message}`);
    err.statusCode = res.status;
    err.upsRaw = text;
    throw err;
  }
  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: string | number;
    issued_at?: string | number;
    scope?: string;
    refresh_token?: string;
    refresh_token_expires_in?: string | number;
    refresh_token_status?: string;
    status?: string;
  };
  const expiresInSec = Number(data.expires_in) || 14_400;
  const refreshSec   = Number(data.refresh_token_expires_in) || 0;
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (expiresInSec - 60) * 1000).toISOString(),
    scope: data.scope ?? '',
    refreshToken: data.refresh_token ?? null,
    refreshTokenExpiresAt: refreshSec ? new Date(Date.now() + refreshSec * 1000).toISOString() : null,
    status: data.status ?? data.refresh_token_status ?? 'approved',
  };
}
