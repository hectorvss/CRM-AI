/**
 * server/integrations/gitlab-oauth.ts
 *
 * GitLab OAuth 2.0 (authorization_code with PKCE).
 *  - Auth URL:  https://gitlab.com/oauth/authorize
 *  - Token URL: https://gitlab.com/oauth/token
 *  - API base:  https://gitlab.com/api/v4
 *  - Tokens: 2h access, refresh via refresh_token (rotates)
 *  - Webhooks: per-project. Verified via `X-Gitlab-Token` header
 *    matching the secret_token we set at registration time
 *    (no HMAC — plain shared-secret comparison).
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://gitlab.com/oauth/authorize';
const TOKEN_URL = 'https://gitlab.com/oauth/token';
export const GITLAB_API_BASE = 'https://gitlab.com/api/v4';

export const GITLAB_SCOPES = ['api', 'read_api', 'read_user', 'read_repository'] as const;

export interface GitLabOAuthEnv { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string; baseUrl?: string }
interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: GitLabOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: GitLabOAuthEnv): StatePayload {
  const dot = state.indexOf('.'); if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot); const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

function authBase(env: GitLabOAuthEnv): string { return env.baseUrl ? env.baseUrl.replace(/\/$/, '') : 'https://gitlab.com'; }

export function buildInstallUrl(opts: { state: string; env: GitLabOAuthEnv; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    response_type: 'code',
    state: opts.state,
    scope: GITLAB_SCOPES.join(' '),
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${authBase(opts.env)}/oauth/authorize?${params.toString()}`;
}

export interface GitLabTokenGrant { accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number; scope: string; createdAt: number }

export async function exchangeCodeForToken(opts: { code: string; codeVerifier: string; env: GitLabOAuthEnv }): Promise<GitLabTokenGrant> {
  const res = await fetch(`${authBase(opts.env)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', client_id: opts.env.clientId, client_secret: opts.env.clientSecret, code: opts.code, redirect_uri: opts.env.redirectUri, code_verifier: opts.codeVerifier }),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`gitlab token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 7200, scope: data.scope ?? '', createdAt: data.created_at ?? Math.floor(Date.now() / 1000) };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: GitLabOAuthEnv }): Promise<GitLabTokenGrant> {
  const res = await fetch(`${authBase(opts.env)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: opts.env.clientId, client_secret: opts.env.clientSecret, refresh_token: opts.refreshToken }),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`gitlab token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 7200, scope: data.scope ?? '', createdAt: data.created_at ?? Math.floor(Date.now() / 1000) };
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const { createHash } = require('crypto');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/** GitLab webhook auth: `X-Gitlab-Token` header equals the per-webhook secret_token (constant-time compare). */
export function verifyWebhookToken(opts: { provided: string; expected: string }): boolean {
  if (!opts.provided || !opts.expected) return false;
  const a = Buffer.from(opts.provided); const b = Buffer.from(opts.expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateWebhookToken(): string {
  return randomBytes(24).toString('base64url');
}
