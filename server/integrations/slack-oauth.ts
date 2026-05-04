/**
 * server/integrations/slack-oauth.ts
 *
 * Slack OAuth 2.0 (v2). Bot-first install flow — the merchant authorises
 * a Slack workspace, we receive a bot token (xoxb-) plus team metadata.
 *
 *  Auth URL:  https://slack.com/oauth/v2/authorize
 *  Token URL: https://slack.com/api/oauth.v2.access
 *
 * Notes:
 *  - Slack tokens do NOT expire by default (legacy behaviour) UNLESS the
 *    workspace admin has token rotation enabled. We support both cases:
 *    when refresh_token + expires_in are returned we refresh, otherwise
 *    we treat the token as static.
 *  - State is HMAC-signed with a short TTL + nonce to prevent CSRF.
 *  - Events API + interactivity verification both share the App's
 *    `signing secret` (separate env var) — kept here for cohesion.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

/** Bot-side scopes Clain needs out of the box. */
export const SLACK_BOT_SCOPES = [
  'app_mentions:read',
  'chat:write',
  'chat:write.public',
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'im:write',
  'mpim:read',
  'mpim:history',
  'users:read',
  'users:read.email',
  'reactions:write',
  'team:read',
  'files:read',
  'files:write',
  'commands',
] as const;

/** User-side scope only used to fetch the installer's identity. */
export const SLACK_USER_SCOPES = ['identify'] as const;

export interface SlackOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  signingSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: SlackOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: SlackOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: {
  state: string;
  env: SlackOAuthEnv;
  scopes?: readonly string[];
  userScopes?: readonly string[];
  team?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? SLACK_BOT_SCOPES).join(','),
    user_scope: (opts.userScopes ?? SLACK_USER_SCOPES).join(','),
    state: opts.state,
  });
  if (opts.team) params.set('team', opts.team);
  return `${AUTH_URL}?${params.toString()}`;
}

export interface SlackTokenGrant {
  ok: boolean;
  appId: string;
  authedUser: { id: string; scope?: string; access_token?: string; token_type?: string };
  scope: string;
  tokenType: string;            // 'bot'
  accessToken: string;          // xoxb-...
  botUserId: string;
  team: { id: string; name: string };
  enterprise: { id: string; name: string } | null;
  isEnterpriseInstall: boolean;
  refreshToken?: string;
  expiresAt?: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: SlackOAuthEnv }): Promise<SlackTokenGrant> {
  const body = new URLSearchParams({
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
    throw new Error(`slack token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  if (!data?.ok) {
    throw new Error(`slack token exchange returned ok=false: ${data?.error ?? 'unknown'}`);
  }
  const grant: SlackTokenGrant = {
    ok: true,
    appId: data.app_id,
    authedUser: data.authed_user ?? { id: '' },
    scope: data.scope ?? '',
    tokenType: data.token_type ?? 'bot',
    accessToken: data.access_token,
    botUserId: data.bot_user_id ?? '',
    team: { id: data.team?.id ?? '', name: data.team?.name ?? '' },
    enterprise: data.enterprise ? { id: data.enterprise.id, name: data.enterprise.name } : null,
    isEnterpriseInstall: Boolean(data.is_enterprise_install),
  };
  if (typeof data.refresh_token === 'string' && typeof data.expires_in === 'number') {
    grant.refreshToken = data.refresh_token;
    grant.expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  }
  return grant;
}

/**
 * Token rotation grant. Only relevant if the workspace admin enabled token
 * rotation; otherwise tokens are static and this is never called.
 */
export async function refreshAccessToken(opts: { refreshToken: string; env: SlackOAuthEnv }): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`slack refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  if (!data?.ok) throw new Error(`slack refresh ok=false: ${data?.error ?? 'unknown'}`);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    expiresAt: new Date(Date.now() + ((data.expires_in ?? 43_200) - 60) * 1000).toISOString(),
  };
}

/**
 * Verify a Slack Events API / interactivity request signature.
 * Header schema: `X-Slack-Signature: v0=<hex hmac>` with a paired
 * `X-Slack-Request-Timestamp`. 5-minute replay window enforced.
 */
export function verifyRequestSignature(opts: {
  rawBody: string;
  signature: string;
  timestamp: string;
  signingSecret: string;
  toleranceMs?: number;
}): boolean {
  const tolerance = opts.toleranceMs ?? 5 * 60 * 1000;
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > tolerance / 1000) return false;
  const base = `v0:${opts.timestamp}:${opts.rawBody}`;
  const mac = createHmac('sha256', opts.signingSecret).update(base).digest('hex');
  const expected = `v0=${mac}`;
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Best-effort revoke. Slack supports `auth.revoke` to invalidate the bot
 * token. Surfaces immediate disconnection for the merchant.
 */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch('https://slack.com/api/auth.revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'test=false',
    });
  } catch { /* best-effort */ }
}
