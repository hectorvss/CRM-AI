/**
 * server/routes/oauthConnectors.ts
 *
 * OAuth 2.0 flow for third-party integrations that support it:
 *   Google / Gmail, Slack, Microsoft / Outlook
 *
 * Flow:
 *   1. UI opens GET /api/oauth-connectors/:system/start?tenantId=&workspaceId=
 *      → Server builds authorization URL, stores CSRF state in session, redirects.
 *
 *   2. Provider redirects to GET /api/oauth-connectors/:system/callback?code=&state=
 *      → Server exchanges code for tokens, upserts connector auth_config, closes popup.
 *
 * Required env vars per provider:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   SLACK_CLIENT_ID,  SLACK_CLIENT_SECRET
 *   MS_CLIENT_ID,     MS_CLIENT_SECRET,    MS_TENANT_ID (or 'common')
 *
 * If env vars are missing the /start endpoint returns 501 so the UI can
 * fall back to the manual API-key modal gracefully.
 */

import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

export const oauthConnectorsRouter = Router();

// ── Provider configs ──────────────────────────────────────────────────────────

interface ProviderConfig {
  authUrl:    string;
  tokenUrl:   string;
  scopes:     string[];
  clientId:   () => string | undefined;
  clientSecret: () => string | undefined;
  extraAuthParams?: Record<string, string>;
  /** Map token response fields → auth_config fields */
  mapTokens: (tokens: Record<string, any>) => Record<string, any>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  google: {
    authUrl:      'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:     'https://oauth2.googleapis.com/token',
    scopes:       ['https://www.googleapis.com/auth/gmail.modify', 'openid', 'email'],
    clientId:     () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    mapTokens: (t) => ({
      access_token:  t.access_token,
      refresh_token: t.refresh_token,
      token_type:    t.token_type ?? 'Bearer',
      expires_in:    t.expires_in,
    }),
  },
  gmail: {
    authUrl:      'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:     'https://oauth2.googleapis.com/token',
    scopes:       ['https://www.googleapis.com/auth/gmail.modify', 'openid', 'email'],
    clientId:     () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    mapTokens: (t) => ({
      access_token:  t.access_token,
      refresh_token: t.refresh_token,
      token_type:    t.token_type ?? 'Bearer',
      expires_in:    t.expires_in,
    }),
  },
  slack: {
    authUrl:      'https://slack.com/oauth/v2/authorize',
    tokenUrl:     'https://slack.com/api/oauth.v2.access',
    scopes:       ['channels:read', 'chat:write', 'users:read', 'files:write'],
    clientId:     () => process.env.SLACK_CLIENT_ID,
    clientSecret: () => process.env.SLACK_CLIENT_SECRET,
    mapTokens: (t) => ({
      access_token: t.access_token ?? t.authed_user?.access_token,
      bot_token:    t.access_token,
      team_id:      t.team?.id,
      team_name:    t.team?.name,
    }),
  },
  outlook: {
    authUrl:      `https://login.microsoftonline.com/${process.env.MS_TENANT_ID ?? 'common'}/oauth2/v2.0/authorize`,
    tokenUrl:     `https://login.microsoftonline.com/${process.env.MS_TENANT_ID ?? 'common'}/oauth2/v2.0/token`,
    scopes:       ['offline_access', 'Mail.ReadWrite', 'Mail.Send', 'User.Read'],
    clientId:     () => process.env.MS_CLIENT_ID,
    clientSecret: () => process.env.MS_CLIENT_SECRET,
    mapTokens: (t) => ({
      access_token:  t.access_token,
      refresh_token: t.refresh_token,
      token_type:    t.token_type ?? 'Bearer',
      expires_in:    t.expires_in,
    }),
  },
};

// OAuth state lives in the `oauth_states` table so it survives restarts and
// works across horizontally scaled instances. State tokens older than the
// cutoff are pruned on every /start request before any new lookup.
const OAUTH_STATE_TTL_MINUTES = 10;

async function pruneStates(): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MINUTES * 60 * 1000).toISOString();
    await supabase.from('oauth_states').delete().lt('created_at', cutoff);
  } catch (err: any) {
    logger.warn('oauth: pruneStates failed (non-fatal)', { error: err?.message });
  }
}

async function persistState(
  state: string,
  tenantId: string,
  workspaceId: string,
  system: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('oauth_states').insert({
    state,
    tenant_id:    tenantId,
    workspace_id: workspaceId,
    system,
    created_at:   new Date().toISOString(),
  });
  if (error) {
    throw new Error(`oauth_states insert failed: ${error.message}`);
  }
}

async function consumeState(
  state: string,
): Promise<{ tenantId: string; workspaceId: string; system: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MINUTES * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .gte('created_at', cutoff)
      .maybeSingle();
    if (error || !data) return null;
    await supabase.from('oauth_states').delete().eq('state', state);
    return {
      tenantId:    data.tenant_id,
      workspaceId: data.workspace_id,
      system:      data.system,
    };
  } catch (err: any) {
    logger.error('oauth: consumeState failed', { error: err?.message });
    return null;
  }
}

function buildRedirectUri(req: Request, system: string): string {
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
  const host  = req.headers['x-forwarded-host']  ?? req.headers.host;
  return `${proto}://${host}/api/oauth-connectors/${system}/callback`;
}

// ── GET /:system/start ─────────────────────────────────────────────────────────

oauthConnectorsRouter.get('/:system/start', async (req: Request, res: Response) => {
  await pruneStates();

  const system = req.params.system.toLowerCase();
  const provider = PROVIDERS[system];

  if (!provider) {
    return res.status(404).json({ error: `Unknown OAuth system: ${system}` });
  }

  const clientId = provider.clientId();
  if (!clientId) {
    return res.status(501).json({
      error: `OAuth not configured for ${system}. Set the required env vars.`,
      notConfigured: true,
    });
  }

  const tenantId    = (req.query.tenantId    as string) || 'org_default';
  const workspaceId = (req.query.workspaceId as string) || 'ws_default';

  const state = randomBytes(20).toString('hex');
  try {
    await persistState(state, tenantId, workspaceId, system);
  } catch (err: any) {
    logger.error(`oauth/${system}: failed to persist state`, { error: err?.message });
    return res.status(500).json({ error: 'Failed to initialize OAuth flow' });
  }

  const redirectUri = buildRedirectUri(req, system);
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         provider.scopes.join(' '),
    state,
    ...provider.extraAuthParams,
  });

  logger.info(`oauth/${system}: redirecting to provider`, { tenantId });
  res.redirect(`${provider.authUrl}?${params.toString()}`);
});

// ── GET /:system/callback ──────────────────────────────────────────────────────

oauthConnectorsRouter.get('/:system/callback', async (req: Request, res: Response) => {
  const system = req.params.system.toLowerCase();
  const provider = PROVIDERS[system];

  if (!provider) return res.status(404).send('Unknown system');

  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) {
    logger.warn(`oauth/${system}: provider returned error`, { error: oauthError });
    return sendClosePopup(res, 'error', oauthError);
  }

  if (!code || !state) {
    res.status(400);
    return sendClosePopup(res, 'error', 'Missing code or state parameter');
  }

  const pending = await consumeState(state);
  if (!pending) {
    res.status(400);
    return sendClosePopup(res, 'error', 'Invalid or expired state — please try again');
  }

  const clientId     = provider.clientId()!;
  const clientSecret = provider.clientSecret()!;
  const redirectUri  = buildRedirectUri(req, system);

  try {
    // ── Exchange code for tokens ─────────────────────────────────────────────
    const tokenRes = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${errBody}`);
    }

    const tokens = await tokenRes.json() as Record<string, any>;
    const authConfig = provider.mapTokens(tokens);

    // ── Upsert connector in DB ───────────────────────────────────────────────
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('connectors')
      .select('id')
      .eq('tenant_id', pending.tenantId)
      .eq('system', system)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('connectors')
        .update({ auth_config: authConfig, status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('connectors').insert({
        id:           crypto.randomUUID(),
        tenant_id:    pending.tenantId,
        workspace_id: pending.workspaceId,
        system,
        status:       'active',
        auth_config:  authConfig,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      });
    }

    logger.info(`oauth/${system}: connected`, { tenantId: pending.tenantId });
    sendClosePopup(res, 'success', system);

  } catch (err: any) {
    logger.error(`oauth/${system}: callback error`, { error: err.message });
    sendClosePopup(res, 'error', err.message ?? 'OAuth failed');
  }
});

// ── Popup close helper ────────────────────────────────────────────────────────

/**
 * Escape characters that have special meaning in HTML to prevent XSS when
 * rendering arbitrary `detail` strings (which may include error messages
 * sourced from upstream OAuth providers).
 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function closePopupHtml(status: 'success' | 'error', detail: string): string {
  const safeDetail = escapeHtml(detail);
  // JSON.stringify gives us a JS-string-safe literal; escape `<` to prevent
  // a `</script>` sequence inside the embedded value from breaking out.
  const jsDetail = JSON.stringify(detail).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html><head><title>OAuth ${status}</title></head>
<body>
<p style="font-family:sans-serif;padding:2rem;color:${status === 'success' ? '#16a34a' : '#dc2626'}">
  ${status === 'success' ? `✓ ${safeDetail} connected successfully. You can close this window.` : `✗ ${safeDetail}`}
</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'oauth_${status}', detail: ${jsDetail} }, '*');
    setTimeout(() => window.close(), 1500);
  }
</script>
</body></html>`;
}

function sendClosePopup(res: import('express').Response, status: 'success' | 'error', detail: string): void {
  // Restrict what the popup is allowed to load. We only need our own inline
  // script + style; everything else (network, images, frames, plugins) is
  // disabled. Inline is required because the page is self-contained HTML.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.type('html').send(closePopupHtml(status, detail));
}
