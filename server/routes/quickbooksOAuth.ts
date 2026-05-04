/**
 * server/routes/quickbooksOAuth.ts
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildInstallUrl, signState, verifyState, exchangeCodeForToken, revokeToken, type QuickBooksOAuthEnv } from '../integrations/quickbooks-oauth.js';
import { quickbooksForTenant, invalidateQuickBooksForTenant } from '../integrations/quickbooks-tenant.js';
import { QuickBooksAdapter } from '../integrations/quickbooks.js';

export const quickbooksOAuthRouter = Router();

function readEnv(): QuickBooksOAuthEnv | { error: string } {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  const stateSecret = process.env.QUICKBOOKS_STATE_SECRET || process.env.STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const verifierToken = process.env.QUICKBOOKS_VERIFIER_TOKEN || '';
  const publicBase = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
  if (!clientId || !clientSecret) return { error: 'QuickBooks OAuth not configured' };
  if (!publicBase) return { error: 'PUBLIC_BASE_URL must be set' };
  if (!stateSecret) return { error: 'QUICKBOOKS_STATE_SECRET must be set' };
  return { clientId, clientSecret, stateSecret, verifierToken, redirectUri: `https://${publicBase}/api/integrations/quickbooks/callback` };
}

quickbooksOAuthRouter.get('/install', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).json({ error: env.error });
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const state = signState({ t: req.tenantId, w: req.workspaceId ?? '', u: req.userId }, env);
  const url = buildInstallUrl({ state, env });
  if (req.headers.accept?.includes('application/json')) return res.json({ url, state });
  return res.redirect(url);
});

quickbooksOAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const env = readEnv(); if ('error' in env) return res.status(503).send(env.error);
  if (typeof req.query.error === 'string') return res.redirect(`/app/integrations?error=quickbooks&reason=${encodeURIComponent(req.query.error)}`);
  let state; try { state = verifyState(String(req.query.state || ''), env); } catch { return res.status(401).send('Invalid state'); }
  const code = String(req.query.code || ''); if (!code) return res.status(400).send('Missing code');
  const realmId = String(req.query.realmId || ''); if (!realmId) return res.status(400).send('Missing realmId');

  let grant; try { grant = await exchangeCodeForToken({ code, env }); }
  catch (err) { logger.warn('QuickBooks token exchange failed', { error: String(err) }); return res.redirect(`/app/integrations?error=quickbooks&reason=token_exchange`); }

  const adapter = new QuickBooksAdapter(grant.accessToken, realmId);
  let companyName: string | null = null;
  try { const r: any = await adapter.getCompanyInfo(); companyName = r?.CompanyInfo?.CompanyName ?? null; }
  catch (err) { logger.warn('QuickBooks getCompanyInfo failed', { error: String(err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `quickbooks::${state.t}::${realmId}`;

  const authConfig: Record<string, unknown> = {
    access_token: grant.accessToken, refresh_token: grant.refreshToken,
    token_type: grant.tokenType, scope: 'com.intuit.quickbooks.accounting',
    access_token_expires_at: new Date(Date.now() + grant.expiresIn * 1000).toISOString(),
    refresh_token_expires_at: new Date(Date.now() + grant.xRefreshTokenExpiresIn * 1000).toISOString(),
    realm_id: realmId, company_name: companyName, granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: state.t, system: 'quickbooks', name: companyName || `qb-${realmId}`,
    status: 'connected', auth_type: 'oauth_authorization_code', auth_config: authConfig,
    capabilities: { reads: ['company', 'customers', 'invoices', 'payments'], writes: ['create_customer', 'create_payment', 'create_creditmemo'], events: ['Customer', 'Invoice', 'Payment', 'CreditMemo'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) { logger.error('QuickBooks upsert failed', { error: error.message }); return res.redirect(`/app/integrations?error=quickbooks&reason=persist`); }

  invalidateQuickBooksForTenant(state.t, state.w || null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: state.t, workspace_id: state.w || state.t, actor_id: state.u, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'quickbooks', realm_id: realmId, company: companyName }, occurred_at: now }).then(() => {}, () => {});
  return res.redirect('/app/integrations?connected=quickbooks');
});

quickbooksOAuthRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const env = readEnv();
  const resolved = await quickbooksForTenant(req.tenantId, req.workspaceId ?? null);
  if (resolved && !('error' in env) && resolved.connector.refreshToken) {
    try { await revokeToken({ token: resolved.connector.refreshToken, env }); } catch { /* ignore */ }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'quickbooks');
  if (error) return res.status(500).json({ error: error.message });
  invalidateQuickBooksForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

quickbooksOAuthRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'quickbooks').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    realm_id: cfg.realm_id ?? null, company_name: cfg.company_name ?? null,
    scope: cfg.scope ?? null,
    refresh_token_expires_at: cfg.refresh_token_expires_at ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

quickbooksOAuthRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await quickbooksForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'QuickBooks not connected' });
  try {
    const invoices = await resolved.adapter.listInvoices({ limit: 5 });
    return res.json({ ok: true, invoices_visible: invoices.length, sample: invoices.map(i => ({ id: i.Id, number: i.DocNumber, total: i.TotalAmt, balance: i.Balance, due: i.DueDate })) });
  } catch (err: any) { return res.status(502).json({ error: 'QuickBooks API call failed', details: String(err?.message ?? err) }); }
});

quickbooksOAuthRouter.post('/customer', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await quickbooksForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'QuickBooks not connected' });
  const email = String(req.body?.email || '').trim();
  const displayName = String(req.body?.display_name || email).trim();
  if (!displayName) return res.status(400).json({ error: 'display_name or email required' });
  try {
    if (email) { const found = await resolved.adapter.findCustomerByEmail(email); if (found) return res.json({ ok: true, found: true, customer: { id: found.Id, name: found.DisplayName } }); }
    const created = await resolved.adapter.createCustomer({ displayName, email, phone: req.body?.phone, companyName: req.body?.company_name });
    return res.json({ ok: true, found: false, customer: { id: created.Id, name: created.DisplayName } });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

quickbooksOAuthRouter.post('/credit-memo', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await quickbooksForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'QuickBooks not connected' });
  const customerId = String(req.body?.customer_id || '');
  const totalAmt = Number(req.body?.total_amt);
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : null;
  if (!customerId || !Number.isFinite(totalAmt) || !lines?.length) return res.status(400).json({ error: 'customer_id, total_amt and lines[] required' });
  try {
    const cm = await resolved.adapter.createCreditMemo({ customerId, totalAmt, lines, txnDate: req.body?.txn_date });
    return res.json({ ok: true, credit_memo: { id: cm.Id, total: cm.TotalAmt } });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
