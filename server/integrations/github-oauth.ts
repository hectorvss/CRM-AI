/**
 * server/integrations/github-oauth.ts
 *
 * GitHub OAuth (user-to-server) flow for OAuth Apps.
 *
 *  - Auth URL:  https://github.com/login/oauth/authorize
 *  - Token URL: https://github.com/login/oauth/access_token
 *  - Tokens: long-lived bearer (no expiry on classic OAuth Apps; new GitHub
 *    Apps have token rotation but we use OAuth App for simplicity).
 *  - Webhooks: registered per-repo (or per-org) via REST. Signed with
 *    `X-Hub-Signature-256` = `sha256=<hex HMAC SHA256 of raw body>` keyed
 *    with the secret we set at registration time.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

const AUTH_URL  = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

export const GITHUB_API_BASE = 'https://api.github.com';

export const GITHUB_SCOPES = [
  'repo',          // full control of private repos (issues + PRs)
  'read:org',      // read org membership
  'read:user',     // read profile
  'user:email',    // primary email
  'admin:repo_hook', // create webhooks on repos
] as const;

export interface GitHubOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: GitHubOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: GitHubOAuthEnv): StatePayload {
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

export function buildInstallUrl(opts: { state: string; env: GitHubOAuthEnv; scopes?: readonly string[] }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    redirect_uri: opts.env.redirectUri,
    scope: (opts.scopes ?? GITHUB_SCOPES).join(' '),
    state: opts.state,
    allow_signup: 'true',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GitHubTokenGrant {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export async function exchangeCodeForToken(opts: { code: string; env: GitHubOAuthEnv }): Promise<GitHubTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: opts.env.clientId,
      client_secret: opts.env.clientSecret,
      code: opts.code,
      redirect_uri: opts.env.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`github token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as any;
  if (data.error) throw new Error(`github token exchange error: ${data.error_description || data.error}`);
  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bearer',
    scope: data.scope ?? '',
  };
}

/** Revoke a user's OAuth grant. */
export async function revokeToken(opts: { accessToken: string; env: GitHubOAuthEnv }): Promise<void> {
  try {
    await fetch(`${GITHUB_API_BASE}/applications/${opts.env.clientId}/grant`, {
      method: 'DELETE',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${opts.env.clientId}:${opts.env.clientSecret}`).toString('base64'),
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: opts.accessToken }),
    });
  } catch { /* best-effort */ }
}

/**
 * Verify GitHub webhook signature.
 * Header: `X-Hub-Signature-256: sha256=<hex HMAC SHA256 of raw body>`
 */
export function verifyWebhookSignature(opts: { rawBody: string; signature: string; secret: string }): boolean {
  if (!opts.signature.startsWith('sha256=')) return false;
  const provided = opts.signature.slice('sha256='.length);
  const expected = createHmac('sha256', opts.secret).update(opts.rawBody).digest('hex');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}
