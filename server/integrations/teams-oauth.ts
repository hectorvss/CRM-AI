/**
 * server/integrations/teams-oauth.ts
 *
 * Microsoft Teams uses the same Microsoft Identity Platform v2 + Graph
 * stack as our Outlook integration, just with a different set of
 * delegated scopes. We keep them in a separate module so an admin can
 * grant only Teams or only Outlook without re-consenting both.
 *
 * Webhooks ride on Microsoft Graph subscriptions:
 *   POST /v1.0/subscriptions  with resource=`/teams/{id}/channels/{id}/messages`
 *   or `/chats/getAllMessages` (cross-chat, 1h max).
 * Verification: clientState is echoed back on every notification — we
 * generate a per-subscription secret + reverse-look up the tenant.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTHORITY = 'https://login.microsoftonline.com';

/**
 * Teams scopes split into two buckets:
 *   1. **Read & post** in channels and 1:1 / group chats the signed-in
 *      user can already see (channel/chat lists + message history).
 *   2. **Subscriptions** — Graph webhooks need ChannelMessage.Read.All
 *      (channel-level) and Chat.ReadWrite (1:1/group-level).
 *
 * `offline_access` gives us a refresh_token. `User.Read` gives identity.
 */
export const TEAMS_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'User.Read',
  // Discover teams + channels
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'TeamMember.Read.All',
  // Read + write channel messages
  'ChannelMessage.Read.All',
  'ChannelMessage.Send',
  // Read + write 1:1 / group chats
  'Chat.ReadBasic',
  'Chat.ReadWrite',
  'ChatMessage.Send',
] as const;

export interface TeamsOAuthEnv {
  clientId: string;
  clientSecret: string;
  tenant: string;          // 'common' for multi-tenant, 'organizations', 'consumers', or a tenant GUID
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: TeamsOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: TeamsOAuthEnv): StatePayload {
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
  env: TeamsOAuthEnv;
  scopes?: readonly string[];
  loginHint?: string;
  prompt?: 'login' | 'none' | 'consent' | 'select_account';
}): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    response_mode: 'query',
    scope: (opts.scopes ?? TEAMS_SCOPES).join(' '),
    state: opts.state,
    prompt: opts.prompt ?? 'select_account',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${AUTHORITY}/${opts.env.tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export interface TeamsTokenGrant {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
  tokenType: string;
  idToken: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: TeamsOAuthEnv }): Promise<TeamsTokenGrant> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    code: opts.code,
    redirect_uri: opts.env.redirectUri,
    grant_type: 'authorization_code',
    scope: TEAMS_SCOPES.join(' '),
  });
  const res = await fetch(`${AUTHORITY}/${opts.env.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`teams token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    scope: data.scope ?? '',
    tokenType: data.token_type ?? 'Bearer',
    idToken: data.id_token ?? null,
  };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: TeamsOAuthEnv }): Promise<{ accessToken: string; refreshToken: string; expiresAt: string; scope: string }> {
  const body = new URLSearchParams({
    client_id: opts.env.clientId,
    client_secret: opts.env.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
    scope: TEAMS_SCOPES.join(' '),
  });
  const res = await fetch(`${AUTHORITY}/${opts.env.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`teams refresh failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? opts.refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
    scope: data.scope ?? '',
  };
}

export async function fetchUserInfo(accessToken: string): Promise<{ id: string; mail: string | null; userPrincipalName: string; displayName: string | null }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,displayName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`graph /me failed: ${res.status}`);
  const data = (await res.json()) as any;
  return {
    id: data.id,
    mail: data.mail ?? null,
    userPrincipalName: data.userPrincipalName,
    displayName: data.displayName ?? null,
  };
}
