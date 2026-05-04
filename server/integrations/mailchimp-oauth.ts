/**
 * server/integrations/mailchimp-oauth.ts
 *
 * Mailchimp OAuth 2.0 (authorization_code).
 *
 *  - Auth URL:  https://login.mailchimp.com/oauth2/authorize
 *  - Token URL: https://login.mailchimp.com/oauth2/token
 *  - Metadata:  https://login.mailchimp.com/oauth2/metadata
 *               (gives the per-account `api_endpoint`, e.g. https://us1.api.mailchimp.com)
 *  - API base:  per-DC `<api_endpoint>/3.0/`
 *  - Tokens:    long-lived bearer (no expires_in)
 *  - Webhooks:  per-list. NOT signed (Mailchimp's webhook auth is just a
 *               URL secret query param). We bake a per-tenant token into
 *               the path: `/webhooks/mailchimp/<token>`.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://login.mailchimp.com/oauth2/authorize';
const TOKEN_URL = 'https://login.mailchimp.com/oauth2/token';

export const MAILCHIMP_METADATA = 'https://login.mailchimp.com/oauth2/metadata';

export interface MailchimpOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: MailchimpOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: MailchimpOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: MailchimpOAuthEnv }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface MailchimpTokenGrant { accessToken: string; tokenType: string; expiresIn: number; scope?: string }

export async function exchangeCodeForToken(opts: { code: string; env: MailchimpOAuthEnv }): Promise<MailchimpTokenGrant> {
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
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`mailchimp token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 0, scope: data.scope };
}

export interface MailchimpMetadata {
  dc: string;
  role: string;
  accountname: string;
  user_id: number;
  login: { email: string; avatar?: string; member_since: string; activated_at: string; last_login: string; login_id: number; login_email: string; login_name: string };
  login_url: string;
  api_endpoint: string;
}

export async function fetchMetadata(accessToken: string): Promise<MailchimpMetadata> {
  const res = await fetch(MAILCHIMP_METADATA, { headers: { Authorization: `OAuth ${accessToken}`, Accept: 'application/json' } });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`mailchimp metadata failed: ${res.status} ${text}`); }
  return (await res.json()) as MailchimpMetadata;
}

export function generateWebhookToken(): string {
  return randomBytes(24).toString('base64url');
}
