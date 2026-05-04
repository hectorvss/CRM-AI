/**
 * server/integrations/notion-oauth.ts
 *
 * Notion OAuth 2.0. Distinctive points:
 *  - Auth URL: api.notion.com/v1/oauth/authorize (uses `owner=user` for
 *    public integrations; `owner=workspace` is the alt for internal apps).
 *  - Token URL: api.notion.com/v1/oauth/token (POST with HTTP Basic auth
 *    using `clientId:clientSecret`, body is JSON {grant_type, code, redirect_uri}).
 *  - Token response includes `bot_id`, `workspace_id`, `workspace_name`,
 *    `workspace_icon`, `owner` (the user) and the access token.
 *  - Tokens are long-lived. There's no refresh flow; user must re-auth if
 *    access is revoked.
 *  - Notion has NO webhook system. Consumers poll `databases.query`
 *    or `search` for changes.
 *  - All API calls require `Notion-Version` header (we pin 2022-06-28).
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

export const NOTION_API_BASE = 'https://api.notion.com/v1';
export const NOTION_API_VERSION = '2022-06-28';

export interface NotionOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload {
  t: string; w: string; u: string; n: string; e: number;
}

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: NotionOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: NotionOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: NotionOAuthEnv; ownerType?: 'user' | 'workspace' }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    owner: opts.ownerType ?? 'user',
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface NotionTokenGrant {
  accessToken: string;
  tokenType: string;
  botId: string;
  workspaceId: string;
  workspaceName: string | null;
  workspaceIcon: string | null;
  owner: { type: 'user' | 'workspace'; user?: { id: string; name?: string; avatar_url?: string; person?: { email?: string } } };
  duplicatedTemplateId: string | null;
}

export async function exchangeCodeForToken(opts: { code: string; env: NotionOAuthEnv }): Promise<NotionTokenGrant> {
  const auth = Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.env.redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`notion token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bearer',
    botId: data.bot_id,
    workspaceId: data.workspace_id,
    workspaceName: data.workspace_name ?? null,
    workspaceIcon: data.workspace_icon ?? null,
    owner: data.owner,
    duplicatedTemplateId: data.duplicated_template_id ?? null,
  };
}
