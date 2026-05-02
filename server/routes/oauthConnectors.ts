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

// In-memory state store (per-process; fine for single-instance deployments)
// key = state token, value = { tenantId, workspaceId, system, createdAt }
const pendingStates = new Map<string, { tenantId: string; workspaceId: string; system: string; createdAt: number }>();

// Prune states older than 10 minutes
function pruneStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of pendingStates) {
    if (v.createdAt < cutoff) pendingStates.delete(k);
  }
}

function buildRedirectUri(req: Request, system: string): string {
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
  const host  = req.headers['x-forwarded-host']  ?? req.headers.host;
  return `${proto}://${host}/api/oauth-connectors/${system}/callback`;
}

// ── GET /:system/start ─────────────────────────────────────────────────────────

oauthConnectorsRouter.get('/:system/start', (req: Request, res: Response) => {
  pruneStates();

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
  pendingStates.set(state, { tenantId, workspaceId, system, createdAt: Date.now() });

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
    return res.send(closePopupHtml('error', oauthError));
  }

  if (!code || !state) {
    return res.status(400).send(closePopupHtml('error', 'Missing code or state parameter'));
  }

  const pending = pendingStates.get(state);
  if (!pending) {
    return res.status(400).send(closePopupHtml('error', 'Invalid or expired state — please try again'));
  }
  pendingStates.delete(state);

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
    res.send(closePopupHtml('success', system));

  } catch (err: any) {
    logger.error(`oauth/${system}: callback error`, { error: err.message });
    res.send(closePopupHtml('error', err.message ?? 'OAuth failed'));
  }
});

// ── Popup close helper ────────────────────────────────────────────────────────

function closePopupHtml(status: 'success' | 'error', detail: string): string {
  return `<!DOCTYPE html>
<html><head><title>OAuth ${status}</title></head>
<body>
<p style="font-family:sans-serif;padding:2rem;color:${status === 'success' ? '#16a34a' : '#dc2626'}">
  ${status === 'success' ? `✓ ${detail} connected successfully. You can close this window.` : `✗ ${detail}`}
</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'oauth_${status}', detail: ${JSON.stringify(detail)} }, '*');
    setTimeout(() => window.close(), 1500);
  }
</script>
</body></html>`;
}
