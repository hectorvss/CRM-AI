/**
 * server/routes/docusignOAuth.ts
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, fetchUserInfo, type DocuSignOAuthEnv } from '../integrations/docusign-oauth.js';
import { docusignForTenant, invalidateDocuSignForTenant } from '../integrations/docusign-tenant.js';

export const docusignOAuthRouter = Router();

function readEnv(): DocuSignOAuthEnv | { error: string } {
  const clientId = process.env.DOCUSIGN_CLIENT_ID;
  const clientSecret = process.env.DOCUSIGN_CLIENT_SECRET;
  const stateSecret = process.env.DOCUSIGN_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const hmacSecret = process.env.DOCUSIGN_HMAC_SECRET || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'DocuSign OAuth not configured' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'DOCUSIGN_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, hmacSecret, redirectUri: `https://${publicBase}/api/integrations/docusign/callback` };
}

docusignOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

docusignOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=docusign&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');

  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('DocuSign token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=docusign&reason=token_exchange`); }

  let userInfo; try { userInfo = await fetchUserInfo(grant.accessToken); }
  catch (err) { logger.warn('DocuSign userinfo failed', { error: String(err) }); return res.redirect(`/app/integrations?error=docusign&reason=userinfo`); }

  const account = userInfo.accounts?.find(a => a.is_default) ?? userInfo.accounts?.[0];
  if (!account) return res.redirect(`/app/integrations?error=docusign&reason=no_account`);

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `docusign::${state.t}::${account.account_id}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: 'signature extended',
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    account_id: account.account_id, account_name: account.account_name, base_uri: account.base_uri,
    sub: userInfo.sub, email: userInfo.email, name: userInfo.name,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'docusign', name: account.account_name || account.account_id,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['envelopes', 'templates', 'connect'], writes: ['create_envelope', 'void_envelope', 'create_recipient_view'], events: ['envelope-sent', 'envelope-delivered', 'envelope-completed', 'envelope-declined', 'envelope-voided'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('DocuSign upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=docusign&reason=persist`); }

  invalidateDocuSignForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'docusign', account_id: account.account_id, email: userInfo.email }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=docusign');
});

docusignOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'docusign');
  if (error) return res.status(500).json({ error: error.message });
  invalidateDocuSignForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

docusignOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'docusign').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    account_id: cfg.account_id ?? null, account_name: cfg.account_name ?? null, base_uri: cfg.base_uri ?? null,
    email: cfg.email ?? null, name: cfg.name ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

docusignOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await docusignForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'DocuSign not connected' });
  try {
    const r = await resolved.adapter.listEnvelopes({ count: 5 });
    return res.json({ ok: true, envelopes_visible: r.envelopes.length, sample: r.envelopes.map(e => ({ id: e.envelopeId, status: e.status, subject: e.emailSubject, sent: e.sentDateTime })) });
  } catch (err: any) { return res.status(502).json({ error: 'DocuSign API call failed', details: String(err?.message ?? err) }); }
});

docusignOAuthRouter.post('/envelope', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await docusignForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'DocuSign not connected' });
  const subject = String(req.body?.email_subject || '').trim();
  if (!subject) return res.status(400).json({ error: 'email_subject required' });
  try {
    const r = await resolved.adapter.createEnvelope({
      emailSubject: subject,
      emailBlurb: req.body?.email_blurb,
      status: req.body?.draft ? 'created' : 'sent',
      templateId: req.body?.template_id,
      templateRoles: req.body?.template_roles,
      documents: req.body?.documents,
      recipients: req.body?.recipients,
    });
    return res.json({ ok: true, envelope: r });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

docusignOAuthRouter.post('/envelope/void', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await docusignForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'DocuSign not connected' });
  const id = String(req.body?.envelope_id || '');
  const reason = String(req.body?.reason || 'Voided by Clain agent');
  if (!id) return res.status(400).json({ error: 'envelope_id required' });
  try { await resolved.adapter.voidEnvelope(id, reason); return res.json({ ok: true }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
