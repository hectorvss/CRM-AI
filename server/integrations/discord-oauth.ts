/**
 * server/integrations/discord-oauth.ts
 *
 * Discord OAuth 2.0 (bot install flow).
 *
 *  - Auth URL:  https://discord.com/api/oauth2/authorize
 *  - Token URL: https://discord.com/api/oauth2/token
 *  - API base:  https://discord.com/api/v10
 *  - Bot tokens are LONG-LIVED (not OAuth-rotated). User OAuth tokens
 *    have refresh_token (7-day access).
 *  - Webhooks (Interactions): signed with Ed25519 over `<timestamp><body>`
 *    using the application's public key. Header pair:
 *      X-Signature-Ed25519, X-Signature-Timestamp
 */

import { createHmac, timingSafeEqual, randomBytes, createPublicKey, verify as nativeVerify } from 'crypto';

const AUTH_URL  = 'https://discord.com/api/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
export const DISCORD_API_BASE = 'https://discord.com/api/v10';

export const DISCORD_SCOPES = [
  'bot', 'applications.commands',
  'identify', 'guilds',
] as const;

// Bitfield for bot permissions (read+send messages, manage channels, view audit log, mention everyone, embed links, attach files)
export const DISCORD_BOT_PERMISSIONS = String(
  (1n << 10n) | // VIEW_CHANNEL
  (1n << 11n) | // SEND_MESSAGES
  (1n << 14n) | // EMBED_LINKS
  (1n << 15n) | // ATTACH_FILES
  (1n << 16n) | // READ_MESSAGE_HISTORY
  (1n << 17n) | // MENTION_EVERYONE
  (1n << 31n) | // USE_APPLICATION_COMMANDS
  (1n << 36n)   // SEND_MESSAGES_IN_THREADS
);

export interface DiscordOAuthEnv { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string; publicKey: string; botToken: string }
interface StatePayload { t: string; w: string; u: string; n: string; e: number }

export function signState(payload: Omit<StatePayload, 'n' | 'e'>, env: DiscordOAuthEnv, ttlMs = 10 * 60 * 1000): string {
  const full: StatePayload = { ...payload, n: randomBytes(12).toString('base64url'), e: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const mac = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyState(state: string, env: DiscordOAuthEnv): StatePayload {
  const dot = state.indexOf('.'); if (dot === -1) throw new Error('state: malformed');
  const body = state.slice(0, dot); const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', env.stateSecret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('state: signature mismatch');
  const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (typeof decoded?.e !== 'number' || decoded.e < Date.now()) throw new Error('state: expired');
  return decoded;
}

export function buildInstallUrl(opts: { state: string; env: DiscordOAuthEnv }): string {
  const params = new URLSearchParams({
    client_id: opts.env.clientId,
    response_type: 'code',
    redirect_uri: opts.env.redirectUri,
    state: opts.state,
    scope: DISCORD_SCOPES.join(' '),
    permissions: DISCORD_BOT_PERMISSIONS,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface DiscordTokenGrant { accessToken: string; refreshToken: string | null; tokenType: string; expiresIn: number; scope: string; guild?: { id: string; name: string }; webhook?: { id: string; token: string; url: string } }

export async function exchangeCodeForToken(opts: { code: string; env: DiscordOAuthEnv }): Promise<DiscordTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.env.redirectUri, client_id: opts.env.clientId, client_secret: opts.env.clientSecret }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`discord token exchange failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 604_800, scope: data.scope ?? '', guild: data.guild, webhook: data.webhook };
}

export async function refreshAccessToken(opts: { refreshToken: string; env: DiscordOAuthEnv }): Promise<DiscordTokenGrant> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: opts.refreshToken, client_id: opts.env.clientId, client_secret: opts.env.clientSecret }).toString(),
  });
  if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`discord token refresh failed: ${res.status} ${text}`); }
  const data = (await res.json()) as any;
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? opts.refreshToken, tokenType: data.token_type ?? 'Bearer', expiresIn: data.expires_in ?? 604_800, scope: data.scope ?? '' };
}

/**
 * Verify Discord Interactions endpoint signature using Ed25519.
 * Headers: X-Signature-Ed25519, X-Signature-Timestamp.
 * Signed message: `<timestamp><rawBody>`. Public key is the application's
 * public key (hex) from Discord Developer Portal.
 */
export function verifyInteractionSignature(opts: { rawBody: string; signature: string; timestamp: string; publicKeyHex: string }): boolean {
  try {
    const message = Buffer.concat([Buffer.from(opts.timestamp, 'utf8'), Buffer.from(opts.rawBody, 'utf8')]);
    const sig = Buffer.from(opts.signature, 'hex');
    const rawKey = Buffer.from(opts.publicKeyHex, 'hex');
    if (sig.length !== 64 || rawKey.length !== 32) return false;
    // Ed25519 SPKI prefix for raw 32-byte key
    const spkiPrefix = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
    const der = Buffer.concat([spkiPrefix, rawKey]);
    const publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return nativeVerify(null, message, publicKey, sig);
  } catch {
    return false;
  }
}
